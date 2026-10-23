#!/usr/bin/env python3
"""Build the MML-profile outage style from the no-MML variant (AGD-138, D2).

The MML profile in Finland is drawn by the apps' *legacy* builder
(buildMapStyleLegacy), which has no country / premium / high-contrast filtering
and takes visibility from layout.visibility (the profile has no sub-style). So the
v2b-structured variant is pre-filtered here the way buildMapStyleV2 would for
Finland, free tier, normal contrast, and its visibility is baked in:

  - keep layers the V2 builder admits in Finland (country, premium "free",
    high_contrast yes/no); visibility = what V2 draws for the default MTB sub-style
    with default details (checks/verify_build.select); detail groups stay
    toggleable by the legacy builder.
  - legacy hooks: the background layer is named "background" (white-background
    option) with V2's default colour, the aerial layers become "alt_base_ortho" /
    "alt_base_ortho2" (the legacy Ortho base switches exactly those ids), a
    "water-mml" marker follows the first "water-end" layer (legacy places its
    water_end slot there), only one layer keeps the route-slot group (see
    ROUTE_SLOT_GROUP), and "simple" fills count as ways_only so the Simple base
    keeps water and land.
  - sources no kept layer uses are dropped (fewer TileJSON fetches at load).

Usage: python3 nomml_mml_profile.py [variant] [output]
  defaults: style_base_v2_nomml.json -> style_base_v2_nomml_mmlprofile.json
Release: the output is mmlv2-style.json in the mmlv2 repo's outage tag.
"""

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "checks"))
from verify_build import select  # noqa: E402

COUNTRY = "fin"
ORTHO_IDS = {
    "esri_aerial_photo-(def-global-esri_ortho)": "alt_base_ortho",
    "mml_aerial_photo-kapsi-(def-fin-mml_ortho_kapsi)": "alt_base_ortho2",
}
BACKGROUND_ID = "background-(def-all-nosource)"
BACKGROUND_COLOR = "#f4f5eb"  # buildMapStyleV2's BACKGROUND_COLOR_DEFAULT; legacy applies none
# Legacy pushes an "overlays_end" slot for every layer of this group (no guard, unlike
# V2), and a duplicate layer id makes MapLibre reject the style. Extra layers of the
# group are moved to the "-lipas" twin group, which the legacy route toggle also matches.
ROUTE_SLOT_GROUP = "bicycle-routes-osm"
ROUTE_SLOT_TWIN = "bicycle-routes-lipas"


def countries(meta):
    c = meta.get("trailmap:country")
    if c is None:
        return []
    return c if isinstance(c, list) else [c]


def admitted(layer):
    """buildMapStyleV2's filters for Finland, free tier, normal contrast."""
    meta = layer.get("metadata") or {}
    if meta.get("trailmap:app") not in (None, "web"):
        return False
    if meta.get("trailmap:premium") in ("navi", "plus"):
        return False
    if meta.get("trailmap:group") != "background" and meta.get("trailmap:high_contrast") not in ("yes", "no"):
        return False
    c = countries(meta)
    if "!" + COUNTRY in c:
        return False
    return COUNTRY in c or "all" in c


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else "style_base_v2_nomml.json"
    dst = sys.argv[2] if len(sys.argv) > 2 else "style_base_v2_nomml_mmlprofile.json"
    style = json.load(open(src, encoding="utf-8"))
    if (style.get("metadata") or {}).get("trailmap:variant") != "nomml":
        sys.exit("ERROR: input is not the no-MML variant (run nomml_variant.js first)")

    visible = set(select(style, COUNTRY, "mtb", False, False))
    missing = [i for i in ORTHO_IDS if not any(l["id"] == i for l in style["layers"])]
    if missing or not any(l["id"] == BACKGROUND_ID for l in style["layers"]):
        sys.exit("ERROR: expected layers not found: %s" % (missing or [BACKGROUND_ID]))

    layers = []
    water_marked = False
    for layer in style["layers"]:
        if layer["id"] == "data_start":
            break
        if layer["id"] not in ORTHO_IDS and layer["id"] != BACKGROUND_ID and not admitted(layer):
            continue
        layer = json.loads(json.dumps(layer))
        layer["layout"] = dict(layer.get("layout") or {})
        if layer["id"] in ORTHO_IDS:
            layer["id"] = ORTHO_IDS[layer["id"]]
            layer["layout"]["visibility"] = "none"  # legacy turns these on in Ortho mode
        elif layer["id"] == BACKGROUND_ID:
            layer["id"] = "background"
            layer["layout"]["visibility"] = "visible"
            layer["paint"] = {**(layer.get("paint") or {}), "background-color": BACKGROUND_COLOR}
        else:
            layer["layout"]["visibility"] = "visible" if layer["id"] in visible else "none"
        meta = layer.get("metadata") or {}
        # Legacy keeps only ways_only layers on a non-default base; V2's Simple base also
        # keeps the "simple" fills (water, fields, wetland ...).
        if meta.get("trailmap:simple") is not None and not meta.get("trailmap:ways_only"):
            meta["trailmap:ways_only"] = True
        if meta.get("trailmap:group") == ROUTE_SLOT_GROUP:
            if any((l.get("metadata") or {}).get("trailmap:group") == ROUTE_SLOT_GROUP for l in layers):
                meta["trailmap:group"] = ROUTE_SLOT_TWIN
        layers.append(layer)
        group = (layer.get("metadata") or {}).get("trailmap:group")
        if group == "water-end" and not water_marked:
            layers.append({"id": "water-mml", "type": "background", "layout": {"visibility": "none"}})
            water_marked = True

    slots = [l["id"] for l in layers if (l.get("metadata") or {}).get("trailmap:group") == ROUTE_SLOT_GROUP]
    if len(slots) != 1:
        sys.exit("ERROR: expected exactly one %s layer, got %s" % (ROUTE_SLOT_GROUP, slots))

    used = {l["source"] for l in layers if "source" in l}
    style["sources"] = {k: v for k, v in style["sources"].items() if k in used}
    style["layers"] = layers
    style["name"] = "MML profile (no-MML outage)"
    style["metadata"] = {**(style.get("metadata") or {}), "trailmap:variant": "nomml-mmlprofile"}

    with open(dst, "w", encoding="utf-8") as f:
        json.dump(style, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print("%d layers (%d visible by default), %d sources, water-mml marker: %s -> %s"
          % (len(layers), sum(1 for l in layers if l["layout"].get("visibility") == "visible"),
             len(style["sources"]), water_marked, dst))


if __name__ == "__main__":
    main()
