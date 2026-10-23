const fs = require("fs");

// Generate the "Finland as global" outage variant of the style (AGD-138).
//
// When MML's open services (avoin-karttakuva.maanmittauslaitos.fi) are down, the
// Finland layers drawn from them go blank. This variant draws Finland with the
// same OSM / self-hosted layers the rest of Europe uses:
//   1. Layers drawing an MML-hosted source are removed. The sources the tileserver's
//      offline-style configs name are kept, so those configs still resolve (a source
//      without layers loads no tiles in the live map).
//   2. Layers tagged "global" also get "fin", so both apps' country filters draw
//      them in Finland. A Finland-only OSM twin of such a layer ("(def-fin-osm)" next
//      to "(def-global-osm)") is removed: the twins only cover the zooms MML left
//      open (e.g. lakes to z13, buildings to z14.5), the global layer covers them all.
//      Other Finland-only layers in a group that gets global layers are removed too,
//      except FIN_ORTHO_OVERLAY (Kapsi aerial, z16+), which moves above the global
//      aerial. Exception: groups in
//      KEEP_FIN_GROUPS keep Finland's own layer and skip the global one (hillshade:
//      Finland's is self-hosted, not MML, and already draws there today).
//   3. A source given by a TileJSON "url" is fetched by MapLibre at style load even
//      with no layers, and while that fetch hangs (an outage times out rather than
//      failing) the map's "load" event never fires. So every MML url-source is either
//      inlined to its tile template (INLINE, for sources the tileserver's offline
//      configs name) or dropped (DROP, sources nothing else references).
//
// Usage: node nomml_variant.js [input] [output]
//   defaults: style_base_v2.json -> style_base_v2_nomml.json
// Release: the outage tag's commit carries this output as style_base_v2.json.

const [inputPath = "style_base_v2.json", outputPath = "style_base_v2_nomml.json"] =
  process.argv.slice(2);

const MML_HOST = "maanmittauslaitos.fi";

// Copied from MML's TileJSON (taustakartta v21). Must match the live style's url.
const INLINE = {
  mml_topo: {
    url: "https://avoin-karttakuva.maanmittauslaitos.fi/vectortiles/tilejson/taustakartta/1.0.0/taustakartta/default/v21/WGS84_Pseudo-Mercator/tilejson.json?api-key=e77a367c-c6f4-417e-870c-b55d156de596",
    tiles: [
      "https://avoin-karttakuva.maanmittauslaitos.fi/vectortiles/taustakartta/wmts/1.0.0/taustakartta/default/v21/WGS84_Pseudo-Mercator/{z}/{y}/{x}.pbf?api-key=e77a367c-c6f4-417e-870c-b55d156de596",
    ],
    minzoom: 0,
    maxzoom: 14,
  },
};
const DROP = new Set(["mml_cadastre"]);
const KEEP_FIN_GROUPS = new Set(["hillshade"]);
// Kapsi's own aerial copy (WMS, not MML) stays on top of the global aerial in Finland.
// Its tiles are solid black or white where it has no data (open sea, border strips),
// so it keeps production's minzoom 16: lower, those blocks cover the global imagery
// in coastal and border views. The bounds trim requests well outside Finland.
const FIN_ORTHO_OVERLAY = {
  id: "mml_aerial_photo-kapsi-(def-fin-mml_ortho_kapsi)",
  minzoom: 16,
  bounds: [19.2, 59.5, 31.7, 70.2],
};

const style = JSON.parse(fs.readFileSync(inputPath, "utf8"));

function sourceUrls(def) {
  return [def.url, ...(def.tiles || [])].filter(Boolean);
}

const mmlSources = new Set(
  Object.entries(style.sources)
    .filter(([, def]) => sourceUrls(def).some((u) => u.includes(MML_HOST)))
    .map(([name]) => name),
);

function countries(layer) {
  const c = (layer.metadata || {})["trailmap:country"];
  if (c === undefined) return [];
  return Array.isArray(c) ? c : [c];
}

const removed = style.layers.filter((l) => mmlSources.has(l.source));
let layers = style.layers.filter((l) => !mmlSources.has(l.source));

const isFinOnly = (l) => {
  const c = countries(l);
  return c.length === 1 && c[0] === "fin";
};

const added = [];
const skipped = [];
const finReplaced = new Set();
const flippedGroups = new Set();
for (const layer of layers) {
  const c = countries(layer);
  if (!c.includes("global") || c.includes("fin") || c.includes("!fin")) continue;
  const group = layer.metadata["trailmap:group"];
  if (group && KEEP_FIN_GROUPS.has(group)) {
    skipped.push(layer.id);
    continue;
  }
  layer.metadata["trailmap:country"] = [...c, "fin"];
  added.push(layer.id);
  if (group) flippedGroups.add(group);
  // ids look like "name-(<substyle>-<country>-<source>[-hc])", e.g. "(gr-global-osm)"
  const finTwin = layer.id.replace(/\(([a-z_]+)-global-/, "($1-fin-");
  if (finTwin !== layer.id) finReplaced.add(finTwin);
}
const replaced = layers.filter(
  (l) =>
    isFinOnly(l) &&
    l.id !== FIN_ORTHO_OVERLAY.id &&
    (finReplaced.has(l.id) || flippedGroups.has((l.metadata || {})["trailmap:group"])),
);
layers = layers.filter((l) => !replaced.includes(l));

const overlay = layers.find((l) => l.id === FIN_ORTHO_OVERLAY.id);
if (!overlay) {
  console.error(`ERROR: ${FIN_ORTHO_OVERLAY.id} not found`);
  process.exit(1);
}
const overlayGroup = overlay.metadata["trailmap:group"];
layers = layers.filter((l) => l !== overlay);
const lastOrtho = layers.reduce(
  (last, l, i) => ((l.metadata || {})["trailmap:group"] === overlayGroup ? i : last),
  -1,
);
layers.splice(lastOrtho + 1, 0, { ...overlay, minzoom: FIN_ORTHO_OVERLAY.minzoom });

const sources = { ...style.sources };
for (const name of mmlSources) {
  const def = sources[name];
  if (!def.url) continue;
  if (DROP.has(name)) {
    delete sources[name];
  } else if (INLINE[name]) {
    if (INLINE[name].url !== def.url) {
      console.error(`ERROR: ${name} url changed upstream; update INLINE from its TileJSON`);
      process.exit(1);
    }
    const { url, ...inline } = def;
    const { url: _known, ...tiles } = INLINE[name];
    sources[name] = { ...inline, ...tiles };
  } else {
    console.error(`ERROR: MML source ${name} has a TileJSON url; add it to INLINE or DROP`);
    process.exit(1);
  }
}

sources[overlay.source] = { ...sources[overlay.source], bounds: FIN_ORTHO_OVERLAY.bounds };

const out = { ...style, sources, layers };
out.metadata = { ...style.metadata, "trailmap:variant": "nomml" };

fs.writeFileSync(outputPath, JSON.stringify(out, null, 2) + "\n", "utf8");

console.log(`MML sources: ${[...mmlSources].join(", ")} (no layers; dropped: ${[...mmlSources].filter((n) => !(n in sources)).join(", ") || "none"})`);
console.log(`removed ${removed.length} MML layers`);
console.log(`added "fin" to ${added.length} global layers`);
console.log(`removed ${replaced.length} Finland-only layers replaced by global ones: ${replaced.map((l) => l.id).join(", ")}`);
console.log(`skipped ${skipped.length} global layers (Finland keeps its own): ${skipped.join(", ")}`);
console.log(`${style.layers.length} -> ${layers.length} layers -> ${outputPath}`);
