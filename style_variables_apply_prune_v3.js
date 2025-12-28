
/**
 * Usage:
 *   node style_variables_apply.js mtb_light
 *
 * Behavior:
 * - Reads only the "style_variables" sheet in style_variables.xlsm.
 * - Row 5: variant headers (mtb_light, mtb_hc_light, etc.).
 * - From row 6 onward:
 *     * Column B = @tag (Column A ignored).
 *     * Selected variant column = EXACT replacement value (quotes preserved).
 * - Copies style_base_v3.json to style_[variant]_v3.json, applies replacements.
 * - Prunes ONLY within "layers":
 *     * Remove a layer if its immediate "metadata" has key "trailmap:[variant]" set to false
 *       (configurable: also remove if "false"/0/"0"). Keep all other layers.
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const VARIANT = process.argv[2];
if (!VARIANT) {
  console.error('Error: Provide a variant, e.g. "node style_variables_apply.js mtb_light"');
  process.exit(1);
}

// --- File names ---
const EXCEL_FILE = path.resolve('style_variables.xlsm');
const SHEET_NAME = 'style_variables'; // Only this sheet is read
const BASE_JSON  = path.resolve('style_base_v3.json');
const OUT_JSON   = path.resolve(`style_${VARIANT}_v3.json`);

// --- Helpers ---
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function fileExists(p) {
  try { fs.accessSync(p, fs.constants.F_OK); return true; } catch { return false; }
}

// --- 1) Read ONLY "style_variables" and build the replacement map ---
if (!fileExists(EXCEL_FILE)) {
  console.error(`Error: Excel file not found: ${EXCEL_FILE}`);
  process.exit(1);
}

let wb;
try {
  wb = XLSX.readFile(EXCEL_FILE, { cellText: true, cellDates: true });
} catch (err) {
  console.error(`Error reading workbook: ${err.message}`);
  process.exit(1);
}

const ws = wb.Sheets[SHEET_NAME];
if (!ws) {
  console.error(`Error: Sheet "${SHEET_NAME}" not found in ${EXCEL_FILE}`);
  process.exit(1);
}

const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
if (!rows || rows.length < 5) {
  console.error(`Error: "${SHEET_NAME}" must have at least 5 rows (row 5 contains variant headers).`);
  process.exit(1);
}

const headerRowIdx = 4; // zero-based index for Excel row 5
const header = rows[headerRowIdx] || [];

const colIdx = header.indexOf(VARIANT);
if (colIdx === -1) {
  console.error(`Error: Variant "${VARIANT}" not found in row 5 of sheet "${SHEET_NAME}".`);
  console.error(`Available variants in row 5: ${header.map(v => (v === undefined ? '—' : String(v))).join(', ')}`);
  process.exit(2);
}

const replacements = new Map();

for (let r = headerRowIdx + 1; r < rows.length; r++) {
  const row = rows[r];
  if (!row || row.length === 0) continue;

  const key = row[1];         // Column B: @tag
  const rawVal = row[colIdx]; // Variant column value

  // Column B may be empty -> ignore the row
  if (typeof key !== 'string') continue;
  const trimmedKey = key.trim();
  if (!trimmedKey.startsWith('@')) continue;

  if (rawVal !== undefined && rawVal !== null) {
    replacements.set(trimmedKey, String(rawVal));
  }
}

if (replacements.size === 0) {
  console.error(`No replacement values found for variant "${VARIANT}" in sheet "${SHEET_NAME}".`);
  process.exit(2);
}

// --- 2) Copy base JSON to variant file ---
if (!fileExists(BASE_JSON)) {
  console.error(`Error: Base JSON file not found: ${BASE_JSON}`);
  process.exit(1);
}
try {
  fs.copyFileSync(BASE_JSON, OUT_JSON);
} catch (err) {
  console.error(`Error copying base JSON: ${err.message}`);
  process.exit(1);
}

// --- 3) Replace all "@..." tokens in the new JSON file ---
let jsonText;
try {
  jsonText = fs.readFileSync(OUT_JSON, 'utf8');
} catch (err) {
  console.error(`Error reading output JSON: ${err.message}`);
  process.exit(1);
}

let replacementCategoriesTouched = 0;
for (const [tag, value] of replacements.entries()) {
  const re = new RegExp(escapeRegExp(tag), 'g');
  const before = jsonText;
  jsonText = jsonText.replace(re, value);
  if (jsonText !== before) replacementCategoriesTouched++;
}

// --- 3.5) Prune ONLY layers whose metadata has "trailmap:[variant]" set to false ---
const variantKeyRaw = `trailmap:${VARIANT}`;

// Config: what counts as "falsey" for pruning in metadata
const treatStringFalseAsFalse = true; // also prune if value === "false"
const treatZeroAsFalse = true;        // also prune if value === 0 or "0"
const trimKeyWhitespace = true;       // normalize "trailmap: winter_light" → "trailmap:winter_light"

function normalizeKey(k) {
  if (typeof k !== 'string') return k;
  return trimKeyWhitespace ? k.replace(/\s+/g, '') : k;
}
const variantKeyNormalized = normalizeKey(variantKeyRaw);

function isFalseyForRemoval(val) {
  if (val === false) return true;
  if (treatStringFalseAsFalse && val === 'false') return true;
  if (treatZeroAsFalse && (val === 0 || val === '0')) return true;
  return false;
}

// Parse the JSON (after replacements) so we can manipulate layers
let parsed;
try {
  parsed = JSON.parse(jsonText);
} catch (err) {
  const diagFile = OUT_JSON.replace(/\.json$/i, '.replaced.before_prune.json');
  try { fs.writeFileSync(diagFile, jsonText, 'utf8'); } catch (_) {}
  console.error('❌ JSON became invalid after replacements. Wrote a diagnostic copy: ' + path.basename(diagFile));
  console.error('Parse error: ' + err.message);
  process.exit(1);
}

/**
 * Prune function that ONLY affects "layers":
 * - If "layers" is an array: remove any element whose immediate `metadata` contains
 *   the key "trailmap:[variant]" with a falsey value.
 * - If "layers" is an object: for each property that is an array, apply the same rule.
 * Returns total number of layer objects removed.
 */
function pruneLayersByMetadataFlag(root) {
  let removed = 0;

  const processArray = (arr, groupName = null) => {
    const before = arr.length;
    const filtered = arr.filter(layer => {
      if (!layer || typeof layer !== 'object') return true;

      const md = layer.metadata;
      if (md && typeof md === 'object') {
        // Look ONLY in immediate metadata object
        for (const [k, v] of Object.entries(md)) {
          const normalized = normalizeKey(k);
          if (normalized === variantKeyNormalized && isFalseyForRemoval(v)) {
            return false; // prune this entire layer object
          }
        }
      }
      return true; // keep layer if flag absent or truthy
    });
    removed += (before - filtered.length);
    return filtered;
  };

  if (Array.isArray(root.layers)) {
    root.layers = processArray(root.layers);
  } else if (root.layers && typeof root.layers === 'object') {
    // Support grouped layers structure: { groupA: [...], groupB: [...] }
    for (const [k, v] of Object.entries(root.layers)) {
      if (Array.isArray(v)) {
        root.layers[k] = processArray(v, k);
      }
    }
  }

  return removed;
}

const prunedCount = pruneLayersByMetadataFlag(parsed);

// Optional: after pruning, check whether any remaining layer still has metadata flag === falsey
function findRemainingFalseInLayers(root) {
  const hits = [];
  const checkArray = (arr, basePath) => {
    arr.forEach((layer, idx) => {
      const md = layer && typeof layer === 'object' ? layer.metadata : null;
      if (md && typeof md === 'object') {
        for (const [k, v] of Object.entries(md)) {
          const normalized = normalizeKey(k);
          if (normalized === variantKeyNormalized && isFalseyForRemoval(v)) {
            hits.push({ path: `${basePath}[${idx}]`, key: k, value: v, id: layer.id });
          }
        }
      }
    });
  };

  if (Array.isArray(root.layers)) {
    checkArray(root.layers, 'layers');
  } else if (root.layers && typeof root.layers === 'object') {
    for (const [groupKey, groupVal] of Object.entries(root.layers)) {
      if (Array.isArray(groupVal)) {
        checkArray(groupVal, `layers.${groupKey}`);
      }
    }
  }
  return hits;
}

const remainingFalse = findRemainingFalseInLayers(parsed);

// Re-serialize (pretty print with 2 spaces)
jsonText = JSON.stringify(parsed, null, 2);

// --- 4) Save modified JSON in place ---
try {
  fs.writeFileSync(OUT_JSON, jsonText, 'utf8');
  console.log(`✅ Applied ${replacementCategoriesTouched} replacement categories.`);
  console.log(`✅ Pruned ${prunedCount} layer object(s) from "layers" where metadata contained "${variantKeyRaw}" set to false.`);
  if (remainingFalse.length > 0) {
    console.warn(`⚠️  ${remainingFalse.length} layer(s) still have metadata "${variantKeyRaw}" set to a falsey value. Showing up to 10:`);
    remainingFalse.slice(0, 10).forEach((h, i) => {
      console.warn(`   ${i + 1}. path=${h.path} | id=${JSON.stringify(h.id)} | key="${h.key}" | value=${JSON.stringify(h.value)}`);
    });
    console.warn('   → If these should be removed, verify the value type (boolean vs string) or the exact key spelling.');
  } else {
    console.log(`🧹 No remaining layers with metadata "${variantKeyRaw}" falsey after pruning.`);
  }
  console.log(`➡️  Wrote: ${path.basename(OUT_JSON)}`);
} catch (err) {
  console.error(`Error writing output JSON: ${err.message}`);
  process.exit(1);
}
