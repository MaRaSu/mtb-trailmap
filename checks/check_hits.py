#!/usr/bin/env python3
"""Evaluate every national layer's filter against real decoded tiles.

A layer whose filter matches nothing anywhere is either a typo in a class value
or a class that does not exist in the data -- both are silent failures in
MapLibre, which is exactly what this catches.
"""

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

import json

import mvt

STYLE = os.path.join(REPO, "style_base_v2.json")

ARCHIVE = {
    "swe_topo": "sweden_topo", "swe_contours": "sweden_contours",
    "est_topo": "estonia_topo", "est_contours": "estonia_contours",
    "nor_topo": "norway_topo", "dnk_topo": "denmark_topo",
}
AREAS = {
    "swe": [(67.90, 18.51), (67.35, 17.65), (59.31, 18.16), (61.72, 16.17), (63.40, 13.08), (68.35, 18.78), (58.35, 11.55),
            (59.86, 17.64), (67.85, 20.22), (64.75, 19.50), (57.70, 11.97), (60.62, 15.63)],
    "est": [(59.38, 24.68), (58.06, 26.50), (59.55, 25.80), (58.38, 26.72), (58.39, 24.50),
            (59.20, 25.65), (58.25, 22.50), (59.34, 27.42),
            (58.90, 23.30), (58.30, 24.35)],   # coastal, for the bathymetry layers
    "nor": [(59.91, 10.75), (69.97, 23.27), (60.63, 6.42), (61.32, 12.27), (60.39, 5.32),
            (70.23, 22.35), (69.01, 23.04), (60.53, 8.21), (63.43, 10.40)],
    "dnk": [(56.17, 9.55), (55.75, 12.40), (56.95, 8.55), (55.13, 15.00), (56.15, 10.21)],
}
ZOOMS = (10, 11, 12, 13, 14)


def ev(f, feat):
    if f is None:
        return True
    if not isinstance(f, list):
        return f
    op = f[0]
    if op == "all":
        return all(ev(x, feat) for x in f[1:])
    if op == "any":
        return any(ev(x, feat) for x in f[1:])
    if op == "!":
        return not ev(f[1], feat)
    if op == "get":
        return feat.get(f[1])
    if op == "has":
        return f[1] in feat
    if op == "literal":
        return f[1]
    if op in ("==", "!=", "<", "<=", ">", ">=", "in", "!in"):
        left = f[1]
        left = ev(left, feat) if isinstance(left, list) else (
            "Polygon" if left == "$type" else feat.get(left))
        if op in ("in", "!in"):
            rest = f[2:]
            vals = ev(rest[0], feat) if len(rest) == 1 and isinstance(rest[0], list) else list(rest)
            hit = left in vals
            return hit if op == "in" else not hit
        right = f[2]
        right = ev(right, feat) if isinstance(right, list) else right
        if op == "==":
            return str(left) == str(right)
        if op == "!=":
            return str(left) != str(right)
        try:
            a, b = float(left), float(right)
        except (TypeError, ValueError):
            return False
        return {"<": a < b, "<=": a <= b, ">": a > b, ">=": a >= b}[op]
    return True


def main():
    style = json.load(open(STYLE, encoding="utf-8"))
    cache = {}
    results = []
    for layer in style["layers"]:
        src = layer.get("source")
        if src not in ARCHIVE:
            continue
        meta = layer.get("metadata") or {}
        tag = meta.get("trailmap:country")
        if not isinstance(tag, str) or tag not in AREAS:
            continue
        sl = layer.get("source-layer")
        hits = 0
        for lat, lon in AREAS[tag]:
            for z in ZOOMS:
                if z < (layer.get("minzoom") or 0):
                    continue
                key = (src, z, lat, lon)
                if key not in cache:
                    x, y = mvt.tile_xy(lat, lon, z)
                    try:
                        cache[key] = mvt.fetch(ARCHIVE[src], z, x, y)
                    except Exception:
                        cache[key] = {}
                for feat in cache[key].get(sl, []):
                    if ev(layer.get("filter"), feat):
                        hits += 1
        results.append((tag, layer["id"], hits))

    empty = [r for r in results if r[2] == 0]
    by_country = {}
    for tag, lid, hits in results:
        by_country.setdefault(tag, []).append(hits)
    print("layers evaluated against live tiles:")
    for tag in ("swe", "est", "nor", "dnk"):
        v = by_country.get(tag, [])
        print("  %s  %d layers, %d with zero matches" % (tag, len(v), sum(1 for h in v if h == 0)))
    print()
    if empty:
        print("ZERO MATCHES (verify each is expected, not a typo):")
        for tag, lid, _ in empty:
            print("  %-4s %s" % (tag, lid))
    else:
        print("every national layer matched at least one real feature")


if __name__ == "__main__":
    main()
