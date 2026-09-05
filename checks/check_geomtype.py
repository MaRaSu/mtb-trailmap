#!/usr/bin/env python3
"""Does every national layer's type match the geometry it actually matches?

The Søborg Kanal bug: a symbol layer cloned from Finland used point placement,
but the Danish feature is a LineString clipped across 8 tiles, so it got 8
labels. Attributes were checked all along; geometry type was not.

Flags:
  * fill layer matching non-polygon features
  * line layer matching non-line features
  * point-placed symbol layer matching LINE features   <- the Søborg case
  * line-placed symbol layer matching POINT features
"""

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

import collections
import gzip
import json
import urllib.request

import mvt
import check_hits as ch

GEOM = {1: "point", 2: "line", 3: "polygon"}
ARCH = {"swe_topo": "sweden_topo", "swe_contours": "sweden_contours",
        "est_topo": "estonia_topo", "est_contours": "estonia_contours",
        "nor_topo": "norway_topo", "dnk_topo": "denmark_topo"}
AREAS = ch.AREAS
ZOOMS = (11, 12, 13, 14)


def read_with_geom(raw):
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    out = {}
    for field, _w, val in mvt._fields(raw, 0, len(raw)):
        if field != 3:
            continue
        name, keys, values, feats = None, [], [], []
        for f2, _w2, v2 in mvt._fields(val, 0, len(val)):
            if f2 == 1: name = v2.decode()
            elif f2 == 2: feats.append(v2)
            elif f2 == 3: keys.append(v2.decode())
            elif f2 == 4: values.append(mvt._value(v2))
        rows = []
        for f in feats:
            tags, gt = [], 0
            for f3, w3, v3 in mvt._fields(f, 0, len(f)):
                if f3 == 2 and w3 == 2:
                    i = 0
                    while i < len(v3):
                        num, i = mvt._varint(v3, i); tags.append(num)
                elif f3 == 3:
                    gt = v3
            row = {}
            for j in range(0, len(tags) - 1, 2):
                ki, vi = tags[j], tags[j + 1]
                if ki < len(keys) and vi < len(values):
                    row[keys[ki]] = values[vi]
            rows.append((row, GEOM.get(gt, gt)))
        out.setdefault(name, []).extend(rows)
    return out


def main():
    style = json.load(open(ch.STYLE, encoding="utf-8"))
    cache, problems, checked = {}, [], 0
    for layer in style["layers"]:
        src = layer.get("source")
        tag = (layer.get("metadata") or {}).get("trailmap:country")
        if src not in ARCH or not isinstance(tag, str) or tag not in AREAS:
            continue
        sl = layer.get("source-layer")
        ltype = layer["type"]
        placement = (layer.get("layout") or {}).get("symbol-placement", "point")
        seen = collections.Counter()
        for lat, lon in AREAS[tag]:
            for z in ZOOMS:
                if z < (layer.get("minzoom") or 0):
                    continue
                key = (src, z, lat, lon)
                if key not in cache:
                    x, y = mvt.tile_xy(lat, lon, z)
                    try:
                        cache[key] = read_with_geom(urllib.request.urlopen(
                            "https://vector.trailmap.fi/data/%s/%d/%d/%d.pbf"
                            % (ARCH[src], z, x, y), timeout=60).read())
                    except Exception:
                        cache[key] = {}
                for row, g in cache[key].get(sl, []):
                    if ch.ev(layer.get("filter"), row):
                        seen[g] += 1
        if not seen:
            continue
        checked += 1
        bad = None
        if ltype == "fill" and set(seen) - {"polygon"}:
            bad = "fill layer matches %s" % dict(seen)
        elif ltype == "line" and set(seen) - {"line", "polygon"}:
            bad = "line layer matches %s" % dict(seen)
        elif ltype == "symbol" and placement == "point" and seen.get("line"):
            bad = "point-placed symbol over LINE geometry %s -- repeats per tile" % dict(seen)
        elif ltype == "symbol" and placement == "line" and seen.get("point"):
            bad = "line-placed symbol over POINT geometry %s" % dict(seen)
        if bad:
            problems.append((layer["id"], bad))
    print("checked %d national layers against real geometry" % checked)
    if problems:
        print()
        for lid, msg in problems:
            print("  %-52s %s" % (lid, msg))
    else:
        print("every layer's type matches the geometry it draws")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
