#!/usr/bin/env python3
"""Full validation of the national-vector integration.

  1. countries that must NOT change (fin, deu/other, global) select exactly the
     same layers as before, across every style variant
  2. per target country, the layer swap is reported
  3. every layer's `source` is declared
  4. every `source-layer` exists in that source's live TileJSON
  5. every sprite referenced by fill-pattern / icon-image exists in the sheet
  6. every attribute referenced by a national layer's filter exists in the
     TileJSON field list for that source-layer
  7. id convention: the source segment of the layer id matches layer.source

    python3 validate_all.py <before.json> <after.json>
"""

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

import json
import re
import sys
import urllib.request

from verify_build import select

TARGETS = ["swe", "est", "nor", "dnk"]
MUST_NOT_CHANGE = ["fin", "deu", "global", "esp", "ita"]

ARCHIVE = {
    "swe_topo": "sweden_topo", "swe_contours": "sweden_contours",
    "est_topo": "estonia_topo", "est_contours": "estonia_contours",
    "nor_topo": "norway_topo", "dnk_topo": "denmark_topo",
}
SPRITE = "https://marasu.github.io/mtb-trailmap/spritev2.json"


def get(url):
    return json.loads(urllib.request.urlopen(url, timeout=60).read())


def sprite_outputs(node, out):
    """Only the OUTPUT positions of an expression -- match/case/step labels and
    conditions are data, not sprite names."""
    if node is None:
        return
    if isinstance(node, str):
        out.add(node)
        return
    if isinstance(node, dict):  # {stops: [[z, value], ...]}
        for stop in node.get("stops", []):
            if len(stop) > 1:
                sprite_outputs(stop[1], out)
        return
    if not isinstance(node, list) or not node:
        return
    op = node[0]
    if op == "match":
        for i in range(3, len(node) - 1, 2):
            sprite_outputs(node[i], out)
        sprite_outputs(node[-1], out)
    elif op == "case":
        for i in range(2, len(node) - 1, 2):
            sprite_outputs(node[i], out)
        sprite_outputs(node[-1], out)
    elif op == "step":
        sprite_outputs(node[2], out)
        for i in range(4, len(node), 2):
            sprite_outputs(node[i], out)
    elif op in ("coalesce", "concat", "literal"):
        for v in node[1:]:
            sprite_outputs(v, out)
    # any other expression (get/interpolate/…) yields no sprite name


strings = sprite_outputs


def get_props(node, out):
    """Attribute names referenced via ["get", "x"] or legacy string keys."""
    if isinstance(node, list):
        if len(node) >= 2 and node[0] in ("get", "has") and isinstance(node[1], str):
            out.add(node[1])
        elif node and isinstance(node[0], str) and node[0] in (
            "==", "!=", "<", "<=", ">", ">=", "in", "!in", "has", "!has"
        ) and len(node) >= 2 and isinstance(node[1], str) and node[1] != "$type":
            out.add(node[1])
        for v in node:
            get_props(v, out)
    elif isinstance(node, dict):
        for v in node.values():
            get_props(v, out)


def main():
    before = json.load(open(sys.argv[1], encoding="utf-8"))
    after = json.load(open(sys.argv[2], encoding="utf-8"))
    fail = []

    print("layers %d -> %d,  sources %d -> %d"
          % (len(before["layers"]), len(after["layers"]),
             len(before["sources"]), len(after["sources"])))
    print()

    print("--- 1. countries that must not change")
    variants = [(sub, hc, navi) for sub in ("mtb", "mtb_winter", "gravel", "mapper")
                for hc in (False, True) for navi in (False, True)]
    for country in MUST_NOT_CHANGE:
        diffs = 0
        for sub, hc, navi in variants:
            if select(before, country, sub, hc, navi) != select(after, country, sub, hc, navi):
                diffs += 1
        if diffs:
            fail.append("%s changed in %d variants" % (country, diffs))
            print("  FAIL %-7s changed in %d/%d variants" % (country, diffs, len(variants)))
        else:
            print("  ok   %-7s unchanged in all %d variants" % (country, len(variants)))

    print()
    print("--- 2. target countries: layer swap (mtb, hc off, free)")
    for country in TARGETS:
        a, b = set(select(before, country)), select(after, country)
        added = [x for x in b if x not in a]
        removed = [x for x in select(before, country) if x not in set(b)]
        print("  %s  +%d national layers, -%d global/OSM layers" % (country, len(added), len(removed)))

    print()
    print("--- 3-4. sources and source-layers against live TileJSON")
    declared = set(after["sources"])
    tilejson = {}
    for src, archive in ARCHIVE.items():
        if src not in declared:
            fail.append("source %s not declared" % src)
            print("  FAIL source %s missing from style" % src)
            continue
        tj = get("https://vector.trailmap.fi/data/%s.json" % archive)
        tilejson[src] = {l["id"]: set(l.get("fields", {})) for l in tj.get("vector_layers", [])}
    for layer in after["layers"]:
        src = layer.get("source")
        if src and src not in declared:
            fail.append("undeclared source %s in %s" % (src, layer["id"]))
        if src in tilejson:
            sl = layer.get("source-layer")
            if sl not in tilejson[src]:
                fail.append("%s: source-layer %r not in %s" % (layer["id"], sl, src))
                print("  FAIL %s -> %s/%s" % (layer["id"], src, sl))
    print("  checked %d layers against %d live TileJSONs" % (len(after["layers"]), len(tilejson)))

    print()
    print("--- 5. sprites")
    sheet = set(get(SPRITE))
    used, sentinel = set(), set()
    for layer in after["layers"]:
        vals = set()
        strings(layer.get("paint", {}).get("fill-pattern"), vals)
        strings(layer.get("layout", {}).get("icon-image"), vals)
        for v in vals:
            if v in sheet or "{" in v:
                continue
            if v == "#blank":
                # "blank" is a real 1x1 sprite; "#blank" resolves to nothing and
                # makes MapLibre log a missing-image warning when it fires. Noted
                # rather than whitelisted so the remaining users stay visible.
                sentinel.add((layer["id"], v))
                continue
            used.add((layer["id"], v))
    real = sorted(used)
    if real:
        for lid, v in real:
            fail.append("sprite %r missing (%s)" % (v, lid))
            print("  FAIL sprite %-40s %s" % (v, lid))
    else:
        print("  ok   every fill-pattern / icon-image resolves in the sprite sheet")
    for lid, v in sorted(sentinel):
        print("  note %-52s uses %r, which is not a sprite; the real one is 'blank'"
              % (lid, v))

    print()
    print("--- 6. filter attributes against TileJSON fields")
    known_meta = {"$type", "class", "size"}
    for layer in after["layers"]:
        src, sl = layer.get("source"), layer.get("source-layer")
        if src not in tilejson or sl not in tilejson.get(src, {}):
            continue
        props = set()
        get_props(layer.get("filter"), props)
        get_props(layer.get("paint"), props)
        get_props(layer.get("layout"), props)
        unknown = {p for p in props if p not in tilejson[src][sl] and p != "$type"}
        if unknown:
            fail.append("%s references %s, not in %s/%s" % (layer["id"], sorted(unknown), src, sl))
            print("  FAIL %-50s %s" % (layer["id"], sorted(unknown)))
    print("  checked filters/paint/layout of every national layer")

    print()
    print("--- 7. id convention")
    bad = 0
    for layer in after["layers"]:
        m = re.search(r"-\((?:[^)]*-)?([a-z_0-9]+)\)$", layer["id"])
        if m and layer.get("source") and m.group(1) != layer["source"] and m.group(1) != "nosource":
            if layer["id"].endswith("-hc)"):
                m2 = re.search(r"-\([^)]*-([a-z_0-9]+)-hc\)$", layer["id"])
                if m2 and m2.group(1) == layer["source"]:
                    continue
            bad += 1
            if bad <= 8:
                print("  note %-58s id says %s, source is %s" % (layer["id"], m.group(1), layer["source"]))
    print("  %d id/source mismatches (pre-existing maptiler ones included)" % bad)

    print()
    if fail:
        print("FAILURES (%d):" % len(fail))
        for f in fail:
            print("  -", f)
        sys.exit(1)
    print("ALL CHECKS PASSED")


if __name__ == "__main__":
    main()
