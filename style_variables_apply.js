#!/usr/bin/env node
/**
 * Usage:
 *   node style_variables_apply.js mtb_light
 *
 * Behavior:
 * - Reads only the "style_variables" sheet in style_variables.xlsm.
 * - Row 5 contains the variant headers (mtb_light, mtb_hc_light, etc.).
 * - From row 6 onward:
 *     * Column B contains the @tag (Column A is formatting and ignored).
 *     * The selected variant's column contains the EXACT replacement value
 *       (quotes preserved if present in the cell).
 * - Copies style_base_v3.json to style_[variant]_v3.json, replaces all @tags,
 *   and writes back to the same output file.
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

// --- 1) Read ONLY the "style_variables" sheet and build the replacement map ---
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

// Convert to array-of-arrays with exact row positions.
// header:1 keeps raw cells; blankrows:false collapses empty rows (safe for our usage).
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
if (!rows || rows.length < 5) {
  console.error(`Error: "${SHEET_NAME}" must have at least 5 rows (row 5 contains variant headers).`);
  process.exit(1);
}

const headerRowIdx = 4; // zero-based index for Excel row 5
const header = rows[headerRowIdx] || [];

// Find the column index for the requested VARIANT in row 5
const colIdx = header.indexOf(VARIANT);
if (colIdx === -1) {
  console.error(`Error: Variant "${VARIANT}" not found in row 5 of sheet "${SHEET_NAME}".`);
  console.error(`Available variants in row 5: ${header.map(v => (v === undefined ? '—' : String(v))).join(', ')}`);
  process.exit(2);
}

// Build replacements from row 6 downward:
// - Column B (index 1) = @tag (required to start with '@'; empty allowed -> skip row)
// - Column colIdx = the exact value to insert (stringified as-is)
const replacements = new Map();

for (let r = headerRowIdx + 1; r < rows.length; r++) {
  const row = rows[r];
  if (!row || row.length === 0) continue;

  const key = row[1];         // Column B: the @tag string
  const rawVal = row[colIdx]; // Selected variant column value

  // Allow empty B: if key is missing/empty or not starting with '@', ignore the row.
  if (typeof key !== 'string') continue;
  const trimmedKey = key.trim();
  if (!trimmedKey.startsWith('@')) continue;

  // Accept any defined value (including empty string or numeric 0)
  if (rawVal !== undefined && rawVal !== null) {
    replacements.set(trimmedKey, String(rawVal));
  }
}

// Safety: if we found nothing, warn and exit (prevents accidental blanking).
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

// --- 4) Save modified JSON in place ---
try {
  fs.writeFileSync(OUT_JSON, jsonText, 'utf8');
  console.log(`✅ Applied ${replacementCategoriesTouched} tag categories from "${SHEET_NAME}" to: ${path.basename(OUT_JSON)}`);
} catch (err) {
  console.error(`Error writing output JSON: ${err.message}`);
  process.exit(1);
}
