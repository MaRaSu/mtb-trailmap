// Fill colour for water-river-(def-swe-osm) and its -hc twin. The layer sits under the
// Swedish land cover, so it is also under the two global hillshades, which the ocean and
// the lakes are drawn above; with the plain water colour it shows greyer than the sea.
// This solves, per zoom, for the colour that under the hillshades' flat-ground values
// composites to the plain water colour (blue clips at 255, so a <=3/255 residual is left).
// Flat values measured from the tiles 2026-10-30: mapterhorn eu_hillshade = rgba(0,0,0,74/255),
// esri World_Hillshade over sea = ~rgb(251,250,248) opaque.
// Re-run (node checks/river_hillshade_color.js) and paste the output into both layers'
// fill-color whenever either hillshade layer's opacity, brightness or zoom range changes.
const lerp = (stops, z) => {
  if (z <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) if (z <= stops[i][0]) {
    const [z0, v0] = stops[i - 1], [z1, v1] = stops[i];
    return v0 + (v1 - v0) * (z - z0) / (z1 - z0);
  }
  return stops[stops.length - 1][1];
};
const MT_A = 74 / 255, ESRI = [251, 250, 248].map((v) => v / 255);
const mtOp = [[8, 0.3], [11, 0.45], [13, 0.55], [15, 0.65]], mtBmin = [[9, 0.5], [12, 0.6], [16, 0.7]];
const esOp = [[3, 0.3], [6, 0.5], [7, 0.5], [9, 0.25], [10, 0.1]], esBmin = 0.3;
function hsl(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  return [0, 8, 4].map((n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)));
}
function solve(W, z) {
  const a1 = z >= 9 ? MT_A * lerp(mtOp, z) : 0;            // mapterhorn: minzoom 9
  const b1 = lerp(mtBmin, z);
  const a2 = z >= 4 && z < 10 ? lerp(esOp, z) : 0;          // esri: z4-10, drawn above mapterhorn
  const E = ESRI.map((c) => esBmin + (1 - esBmin) * c);
  return W.map((w, i) => {
    const c1 = (w - E[i] * a2) / (1 - a2);
    const r = Math.min(1, Math.max(0, (c1 - b1 * a1) / (1 - a1)));
    const got = E[i] * a2 + (b1 * a1 + r * (1 - a1)) * (1 - a2);
    return [r, got - w];
  });
}
const ZOOMS = [4, 6, 7, 8, 8.99, 9, 9.99, 10, 11, 12, 13, 15, 16];
for (const [name, W] of [["def", hsl(210, 67, 85)], ["hc", hsl(209, 23, 63)]]) {
  const expr = ["interpolate", ["linear"], ["zoom"]];
  let maxErr = 0;
  for (const z of ZOOMS) {
    const s = solve(W, z);
    maxErr = Math.max(maxErr, ...s.map((v) => Math.abs(v[1]) * 255));
    expr.push(z, "rgb(" + s.map((v) => Math.round(v[0] * 255)).join(", ") + ")");
  }
  console.log(name, "water", W.map((v) => Math.round(v * 255)).join(","), "max residual (0-255):", maxErr.toFixed(1));
  console.log(JSON.stringify(expr));
}
