#!/usr/bin/env python3
"""Simulate buildMapStyleV2's layer selection and diff old vs new style.

Ports the filter chain from next-trailmap/src/ui-stores/app-config-ui-store.ts
(lines ~1097-1300): Finland-only groups, app platform, premium, country, ortho,
ways_only, sub-style visibility, details, high contrast. Enough to prove that a
change to the style file does not move a single layer for a country it was not
meant to touch.

    python3 verify_build.py <old_style.json> <new_style.json>
"""

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

import json

FINLAND_ONLY_GROUPS = {"poi-lipas-hiking", "poi-lipas-sport", "skiing-lipas", "mml-ways"}

# DETAILS_OPTIONS defaults, for the layer groups the Trailmap style uses
# (shared/models/app-config.ts). value 'true' = layer visible.
DETAILS = {
    "mml-ways": False,
    "poi-lipas": False,
    "poi-osm": False,
    "skiing-lipas": False,
    "wood": False,
    "bedrock": True,
    "fixme": False,
    "hillshade": True,
    "contour": True,
    "cadastral": False,
    "depth-contour": False,
}


def finland_only(group):
    return bool(group) and (group.endswith("-routes-lipas") or group in FINLAND_ONLY_GROUPS)


def select(style, country, sub_style="mtb", hc=False, navi=False, plus=False):
    country_filter = "fin" if country == "fin" else "global"
    out = []
    for layer in style["layers"]:
        meta = layer.get("metadata") or {}
        group = meta.get("trailmap:group")
        if layer["id"] == "data_start":
            break
        if country != "fin" and finland_only(group):
            continue
        app = meta.get("trailmap:app")
        if app and app != "web":
            continue
        premium = meta.get("trailmap:premium")
        if premium == "free" and (plus or navi):
            continue
        if premium == "navi" and not navi:
            continue
        if premium == "plus" and not plus:
            continue

        countries = meta.get("trailmap:country")
        countries = countries if isinstance(countries, list) else [countries]
        include = None
        for c in countries:
            if c == country or c == "all" or c == country_filter:
                if include is None:
                    include = True
            if isinstance(c, str) and c.startswith("!") and c[1:] == country:
                include = False
        if include is not True:
            continue

        if group == "background":
            out.append(layer["id"])
            continue

        visible = meta.get("trailmap:" + sub_style) is True
        if group:
            detail = DETAILS.get(group)
            if detail is not None:
                visible = detail

        meta_hc = meta.get("trailmap:high_contrast")
        if hc:
            if meta_hc not in ("yes", "exclusive"):
                continue
        else:
            if meta_hc not in ("yes", "no"):
                continue
        if visible:
            out.append(layer["id"])
    return out


def main():
    old = json.load(open(sys.argv[1], encoding="utf-8"))
    new = json.load(open(sys.argv[2], encoding="utf-8"))
    print("layers in file: %d -> %d" % (len(old["layers"]), len(new["layers"])))
    print("sources:        %d -> %d" % (len(old["sources"]), len(new["sources"])))
    print()
    cases = []
    for country in ("fin", "swe", "nor", "dnk", "est", "deu", "global"):
        for sub in ("mtb", "mtb_winter", "gravel", "mapper"):
            for hc in (False, True):
                for navi in (False, True):
                    cases.append((country, sub, hc, navi))

    worst = {}
    for country, sub, hc, navi in cases:
        a = select(old, country, sub, hc, navi)
        b = select(new, country, sub, hc, navi)
        added = [x for x in b if x not in a]
        removed = [x for x in a if x not in b]
        if added or removed:
            key = country
            worst.setdefault(key, []).append((sub, hc, navi, added, removed))

    for country in ("fin", "nor", "dnk", "est", "deu", "global"):
        if country in worst:
            print("!! %s CHANGED -- must not happen" % country)
            for sub, hc, navi, added, removed in worst[country][:3]:
                print("   %s hc=%s navi=%s +%s -%s" % (sub, hc, navi, added, removed))
        else:
            print("ok %-7s unchanged in all %d variants" % (country, len(cases) // 7))

    print()
    print("swe, mtb, hc=off, free user:")
    a = set(select(old, "swe"))
    b = select(new, "swe")
    for lid in b:
        if lid not in a:
            print("   + %s" % lid)
    for lid in select(old, "swe"):
        if lid not in set(b):
            print("   - %s" % lid)

    print()
    print("swe, mtb, hc=ON:")
    a = set(select(old, "swe", hc=True))
    for lid in select(new, "swe", hc=True):
        if lid not in a:
            print("   + %s" % lid)
    b = set(select(new, "swe", hc=True))
    for lid in select(old, "swe", hc=True):
        if lid not in b:
            print("   - %s" % lid)

    print()
    print("swe, gravel:")
    a = set(select(old, "swe", "gravel"))
    b = set(select(new, "swe", "gravel"))
    for lid in select(new, "swe", "gravel"):
        if lid not in a:
            print("   + %s" % lid)
    for lid in select(old, "swe", "gravel"):
        if lid not in b:
            print("   - %s" % lid)

    print()
    print("swe contours, navi user vs free user:")
    for navi in (False, True):
        got = [x for x in select(new, "swe", navi=navi) if "contour" in x]
        print("   navi=%-5s %s" % (navi, got))


if __name__ == "__main__":
    main()
