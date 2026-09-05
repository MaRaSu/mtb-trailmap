#!/usr/bin/env python3
"""Find labels drawn twice: once from OSM, once from the national source.

Both of the duplicates reported so far came from the same mistake -- sampling a
couple of zooms, seeing no overlap, and generalising. OSM gates classes by zoom
inside the tiles (isolated_dwelling only appears at z14, hamlet from z11), so a
duplicate can be invisible at every zoom you happened to look at.

This walks z10-z14 over many areas, evaluates every active label layer's real
filter, and reports any name string a country draws from both sources.
"""

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

import collections
import json
import urllib.request

import mvt
import check_hits as ch
from verify_build import select

STYLE = ch.STYLE
ARCH = {"swe": "sweden_topo", "est": "estonia_topo", "nor": "norway_topo", "dnk": "denmark_topo"}
AREAS = {
    "swe": [(58.3278, 16.4381), (59.31, 18.16), (61.72, 16.17), (58.35, 11.55),
            (63.40, 13.08), (59.86, 17.64)],
    "est": [(58.06, 26.50), (59.55, 25.80), (58.38, 26.72), (59.38, 24.68)],
    "nor": [(59.91, 10.75), (60.63, 6.42), (61.32, 12.27), (69.97, 23.27)],
    "dnk": [(56.17, 9.55), (56.15, 10.21), (55.75, 12.40), (56.95, 8.55)],
}
ZOOMS = (10, 11, 12, 13, 14)


def osm_tile(z, x, y):
    return mvt.read_tile(urllib.request.urlopen(
        "https://tiles.trailmap.fi/data/europe-omt/%d/%d/%d.pbf" % (z, x, y), timeout=60).read())


def names_drawn(style, tag, tile, source_kind, z=None):
    """{name: [layer ids]} for every label layer of this country reading `source_kind`."""
    out = collections.defaultdict(set)
    active = set(select(style, tag))
    for layer in style["layers"]:
        if layer["id"] not in active:
            continue
        lay = layer.get("layout") or {}
        if lay.get("text-field") is None:
            continue
        src = layer.get("source")
        is_osm = src == "osm"
        is_nat = src in (tag + "_topo", tag + "_contours")
        if source_kind == "osm" and not is_osm:
            continue
        if source_kind == "nat" and not is_nat:
            continue
        if z is not None:                      # a layer outside its zoom range
            if z < (layer.get("minzoom") or 0):    # cannot collide with anything
                continue
            if z >= (layer.get("maxzoom") or 99):
                continue
        rows = tile.get(layer.get("source-layer"), [])
        for r in rows:
            nm = r.get("name") or r.get("name:latin")
            if not nm:
                continue
            if ch.ev(layer.get("filter"), r):
                out[nm].add(layer["id"])
    return out


def main():
    style = json.load(open(STYLE, encoding="utf-8"))
    for tag in ("swe", "est", "nor", "dnk"):
        pairs = collections.Counter()
        total = 0
        for lat, lon in AREAS[tag]:
            for z in ZOOMS:
                x, y = mvt.tile_xy(lat, lon, z)
                try:
                    o = osm_tile(z, x, y)
                    n = mvt.fetch(ARCH[tag], z, x, y)
                except Exception:
                    continue
                on = names_drawn(style, tag, o, "osm", z)
                nn = names_drawn(style, tag, n, "nat", z)
                for nm in set(on) & set(nn):
                    total += 1
                    for a in on[nm]:
                        for b in nn[nm]:
                            pairs[(a, b)] += 1
        print("== %s: %d duplicated label instances" % (tag, total))
        for (a, b), c in pairs.most_common(8):
            print("   x%-4d %s" % (c, a))
            print("         also drawn by %s" % b)
        if not pairs:
            print("   none")
        print()


if __name__ == "__main__":
    main()
