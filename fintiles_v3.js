const fs = require("fs");

// Generate the -v3 styles: Finland read from our own tiles instead of MML's
// taustakartta (AGD-171, plan AGD-160).
//
// The tiles are a drop-in for MML taustakartta v21 (same source-layers, properties and
// values; europe-tiles/finland_vector), split into four archives. So the production
// layers are used as they are and only the plug-in changes, the same rules as
// europe-tiles/finland_vector/style/make_dev_style.py but without its preview-only
// steps (no visibility or app details baked in: the apps build the style):
//   1. mml_topo keeps its id; its TileJSON url becomes our finland_topo tiles.
//   2. New sources mml_contours, mml_buildings, mml_ways (finland_contours /
//      _buildings / _ways). mml_topo layers move by source-layer: korkeus -> contours,
//      rakennus -> buildings, liikenne -> ways (main style: only the mml-ways road
//      overlay; the fairways stay on topo).
//   3. Main style only: one raster layer from fin_relief_hillshade at z8-10 (shadows
//      only, flat ground transparent), just below mml_hillshade, fading out as
//      mml_hillshade takes over at z11. Production hillshade is otherwise unchanged.
//   --mmlv2 (the MML map profile, mmlv2-style.json): the liikenne layers whose filter
//      tests only fairway classes stay on topo, every other one goes to ways;
//      hallintoalue, maastoaluereuna and nimisto live only in ways; the layers on
//      maankaytto, maasto_alue, vesisto_viiva and rakennelma get a twin on mml_ways
//      (the two archives hold disjoint features of those layers).
//
// Usage: node fintiles_v3.js [--mmlv2] [--base URL] [input] [output]
//   defaults: style_base_v2.json -> style_base_v2_v3.json
//             --mmlv2: ../mmlv2/mmlv2-style.json -> mmlv2_style_v3.json
//   --base URL: tile host prefix, default https://vector.trailmap.fi/data
// The script fails rather than guess: on a base style that is not the expected MML v21
// one, already converted, the wrong kind for the mode, or with a layer that would read
// a source-layer its archive does not carry.
// Release: the -v3 tag's commit carries the output as style_base_v2.json (main) or
// mmlv2-style.json (mmlv2 repo).

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

const args = process.argv.slice(2);
let mmlv2 = false;
let BASE = "https://vector.trailmap.fi/data";
const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--mmlv2") mmlv2 = true;
  else if (args[i] === "--base") BASE = args[++i];
  else if (args[i].startsWith("--")) fail(`unknown option ${args[i]}`);
  else positional.push(args[i]);
}
if (!/^https?:\/\/[^/]+/.test(BASE || "")) fail(`--base must be an http(s) URL, got ${BASE}`);
BASE = BASE.replace(/\/+$/, "");
if (positional.length > 2) fail("too many arguments");
const [
  inputPath = mmlv2 ? "../mmlv2/mmlv2-style.json" : "style_base_v2.json",
  outputPath = mmlv2 ? "mmlv2_style_v3.json" : "style_base_v2_v3.json",
] = positional;

// The taustakartta v21 TileJSON both base styles read today; anything else means the
// base style changed and the rules need a look.
const MML_TOPO_URL =
  "https://avoin-karttakuva.maanmittauslaitos.fi/vectortiles/tilejson/taustakartta/1.0.0/taustakartta/default/v21/WGS84_Pseudo-Mercator/tilejson.json?api-key=e77a367c-c6f4-417e-870c-b55d156de596";

const MTK = "© Maanmittauslaitos, Maastotietokanta, CC BY 4.0";
const NIMISTO = "Nimistö © MML";
const MAPTERHORN = "Hillshade © Mapterhorn, CC BY";

// The vector archives' national extent with a margin (MTK reaches 19.04 W at sea,
// 31.598 E, 70.095 N); the relief raster uses its own archive bounds.
const VECTOR_BOUNDS = [19.0, 59.4, 31.65, 70.1];
const RELIEF_BOUNDS = [19.08, 59.45, 31.59, 70.09];

function vectorSource(archive, attribution) {
  return {
    type: "vector",
    tiles: [`${BASE}/${archive}/{z}/{x}/{y}.pbf`],
    minzoom: 0,
    maxzoom: 14,
    bounds: VECTOR_BOUNDS,
    attribution,
  };
}

// The layers each archive carries (europe-tiles/finland_vector/schema/finland_*.yml).
// Every layer the output reads must find its source-layer in its source's archive,
// or it would silently draw nothing.
const ARCHIVE_LAYERS = {
  mml_topo: ["maankaytto", "maasto_alue", "vesisto_alue", "vesisto_viiva", "liikenne", "maasto_viiva",
    "maasto_piste", "alueraja", "rakennelma", "selite", "nimisto"],
  mml_contours: ["korkeus"],
  mml_buildings: ["rakennus"],
  mml_ways: ["liikenne", "maankaytto", "maasto_alue", "vesisto_viiva", "rakennelma", "maastoaluereuna",
    "hallintoalue", "nimisto"],
};

const SPLIT = {
  korkeus: "mml_contours",
  rakennus: "mml_buildings",
  liikenne: "mml_ways",
};
const FAIRWAYS = new Set([16511, 16512, 16521, 16522]);
const MMLV2_WAYS_ONLY = new Set(["hallintoalue", "maastoaluereuna", "nimisto"]);
const MMLV2_TWINNED = new Set(["maankaytto", "maasto_alue", "vesisto_viiva", "rakennelma"]);

const HS_MML_LAYER = "mml_hillshade-(def-fin-mml_hillshade)";
const HS_LOW_SOURCE = "fin_relief_hillshade";
const HS_LOW_ID = "fin_hillshade-lowzoom-(def-fin-fin_relief_hillshade)";

// The kohdeluokka classes a liikenne filter tests: "fairway" (only fairway classes,
// the topo archive's liikenne), "roads" (no fairway class, the ways archive) or
// "mixed" (both, which no archive serves whole).
function liikenneKind(layer) {
  // only the numbers of comparisons on kohdeluokka (legacy ["==","kohdeluokka",v] /
  // ["in","kohdeluokka",...], expression ["get","kohdeluokka"] operands, match labels)
  const classes = [];
  const isKl = (x) => x === "kohdeluokka" || (Array.isArray(x) && x[0] === "get" && x[1] === "kohdeluokka");
  const collect = (e) => {
    if (Array.isArray(e)) e.forEach(collect);
    else if (typeof e === "number") classes.push(e);
  };
  (function walk(e) {
    if (!Array.isArray(e)) return;
    if (e.slice(1).some(isKl)) e.slice(1).filter((x) => !isKl(x)).forEach(collect);
    else e.forEach(walk);
  })(layer.filter);
  const fair = classes.filter((n) => FAIRWAYS.has(n)).length;
  if (classes.length > 0 && fair === classes.length) return "fairway";
  return fair === 0 ? "roads" : "mixed";
}

const style = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const topo = style.sources.mml_topo;
if (!topo || topo.url !== MML_TOPO_URL) fail(`${inputPath} mml_topo is not the expected MML v21 TileJSON; check the rules`);
for (const id of [...Object.values(SPLIT), HS_LOW_SOURCE]) {
  if (style.sources[id]) fail(`${inputPath} already has source ${id} (already converted?)`);
}
// Mode marker: only the main style has the Finland hillshade layer and the mml-ways
// road group; the MML profile style has neither. Both must agree with the flag.
const hasHillshade = style.layers.some((l) => l.id === HS_MML_LAYER);
const hasWaysGroup = style.layers.some((l) => (l.metadata || {})["trailmap:group"] === "mml-ways");
if (hasHillshade !== hasWaysGroup) fail(`${inputPath} is neither the main nor the MML profile style`);
if (mmlv2 === hasHillshade) {
  fail(mmlv2 ? `${inputPath} is the main style (${HS_MML_LAYER}, mml-ways group); drop --mmlv2`
    : `${inputPath} is not the main style (no ${HS_MML_LAYER}); use --mmlv2`);
}

const sources = {};
for (const [id, def] of Object.entries(style.sources)) {
  sources[id] = id === "mml_topo" ? vectorSource("finland_topo", `${MTK}; ${NIMISTO}`) : def;
}
sources.mml_contours = vectorSource("finland_contours", MTK);
sources.mml_buildings = vectorSource("finland_buildings", MTK);
sources.mml_ways = vectorSource("finland_ways", mmlv2 ? `${MTK}; ${NIMISTO}` : MTK);

const moved = { mml_contours: 0, mml_buildings: 0, mml_ways: 0 };
let stayed = 0;
let twins = 0;
const layers = [];
for (const layer of style.layers) {
  if (layer.source !== "mml_topo") {
    layers.push(layer);
    continue;
  }
  const sl = layer["source-layer"];
  let target = SPLIT[sl];
  if (target === "mml_ways") {
    const kind = liikenneKind(layer);
    if (kind === "mixed") fail(`${layer.id} filters fairway and road classes together; split it first`);
    const roads = mmlv2 ? kind === "roads" : (layer.metadata || {})["trailmap:group"] === "mml-ways";
    // main style: the group decides, so the filter must agree with it (topo's liikenne
    // is fairways only, ways' is roads only)
    if (!roads && kind !== "fairway") fail(`${layer.id} reads road classes but would stay on topo (fairways only)`);
    if (roads && kind !== "roads") fail(`${layer.id} reads fairway classes but would move to ways (roads only)`);
    if (!roads) target = undefined;
  }
  if (mmlv2 && MMLV2_WAYS_ONLY.has(sl)) target = "mml_ways";
  if (target) {
    layers.push({ ...layer, source: target });
    moved[target]++;
  } else {
    layers.push(layer);
    stayed++;
  }
  if (mmlv2 && MMLV2_TWINNED.has(sl)) {
    layers.push({ ...JSON.parse(JSON.stringify(layer)), id: `${layer.id} (ways)`, source: "mml_ways" });
    twins++;
  }
}

if (!mmlv2) {
  const i = layers.findIndex((l) => l.id === HS_MML_LAYER);
  if (i < 0) fail(`${HS_MML_LAYER} not found`);
  const ref = layers[i];
  const { "trailmap:id_legacy": _legacy, ...meta } = ref.metadata;
  sources[HS_LOW_SOURCE] = {
    type: "raster",
    tiles: [`${BASE}/${HS_LOW_SOURCE}/{z}/{x}/{y}.webp`],
    tileSize: 256,
    minzoom: 8,
    maxzoom: 10,
    bounds: RELIEF_BOUNDS,
    attribution: MAPTERHORN,
  };
  layers.splice(i, 0, {
    id: HS_LOW_ID,
    type: "raster",
    metadata: meta,
    source: HS_LOW_SOURCE,
    minzoom: 8,
    maxzoom: 12,
    layout: { ...ref.layout },
    paint: {
      "raster-opacity": { stops: [[8, 0.3], [10, 0.4], [11, 0.3], [11.6, 0]] },
      "raster-fade-duration": 0,
    },
  });
}

for (const l of layers) {
  const allowed = ARCHIVE_LAYERS[l.source];
  if (allowed && !allowed.includes(l["source-layer"])) {
    fail(`${l.id} reads ${l["source-layer"]} from ${l.source}, which that archive does not carry`);
  }
}

const out = { ...style, sources, layers };
out.metadata = { ...style.metadata, "trailmap:variant": "v3-fintiles" };
fs.writeFileSync(outputPath, JSON.stringify(out, null, 2) + "\n", "utf8");

console.log(`${mmlv2 ? "mmlv2" : "main"}: mml_topo url -> ${BASE}/finland_topo; ${stayed} layers stay on mml_topo`);
console.log(`re-pointed ${Object.entries(moved).map(([k, v]) => `${k}=${v}`).join(", ")}${mmlv2 ? `; ${twins} ways twins` : ""}`);
if (!mmlv2) console.log(`added ${HS_LOW_ID} below ${HS_MML_LAYER}`);
console.log(`${style.layers.length} -> ${layers.length} layers -> ${outputPath}`);
