#!/usr/bin/env python3
"""Catch misanchored national layers.

Every national layer is a clone of a Trailmap layer whose position in the stack
is known-good. If the clone sits on the other side of a structural landmark from
its template, it is in the wrong band -- which is how the Estonian depth
contours ended up below the opaque water fills and were painted over.

For each (clone, template) pair, compare the sign of (index - landmark index)
for each landmark. Any sign flip is a band crossing.
"""

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

import json


STYLE = os.path.join(REPO, "style_base_v2.json")

# Landmarks must be `all`-country layers. A Finland-only layer is never in the
# same built style as a Swedish one, so comparing positions across it is
# meaningless -- that false positive is what this list originally produced.
LANDMARKS = [
    "landcover-glacier-(def-all-osm)",
    "landcover-wood-(def-all-osm)",
    "landcover-scree-(def-all-osm)",
    "landuse-sport_play-(def-all-osm)",
    "water-ocean-(def-all-osm)",
    "water-intermittent-(def-all-osm)",          # the water-end slot anchor
    "waterway-stream-linetype-(def-all-osm)",
    "tunnel-service-case-(def-all-osm)",
    "military_area-fill-(def-all-osm)",
    "boundary-land-minor-(def-all-osm)",
    "highway-path-case-(def-all-osm)",
    "highway-track-line_goodvis-(def-all-osm)",
    "poi-level_2-(def-all-osm)",
]


def pairs():
    """clone id -> the layer whose stack position it should mirror.

    Built when the national layers were generated; most entries are the layer the
    clone was copied from, but a few name a different layer on purpose where the
    template was chosen for its paint rather than its place in the stack (the
    ground-cover barriers, open_land/heath, Denmark's mires below the water band).
    Regenerate only if new national layers are added.
    """
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                           "zorder_map.json"), encoding="utf-8") as fh:
        return json.load(fh)


def main():
    style = json.load(open(STYLE, encoding="utf-8"))
    idx = {l["id"]: i for i, l in enumerate(style["layers"])}
    marks = [(m, idx[m]) for m in LANDMARKS if m in idx]
    tmap = pairs()
    problems = []
    checked = 0
    for clone, tmpl in sorted(tmap.items()):
        if clone not in idx:
            problems.append((clone, tmpl, "clone missing from style"))
            continue
        if tmpl not in idx:
            continue  # template was itself a clone added in the same pass
        checked += 1
        c, t = idx[clone], idx[tmpl]
        for name, m in marks:
            if name in (clone, tmpl):
                continue
            if (c < m) != (t < m):
                side = "below" if c < m else "above"
                problems.append((clone, tmpl, "sits %s %s; its template does not" % (side, name)))
    print("checked %d clone/template pairs against %d landmarks" % (checked, len(marks)))
    if problems:
        print()
        print("BAND CROSSINGS (%d):" % len(problems))
        for clone, tmpl, msg in problems:
            print("  %-52s (from %s)" % (clone, tmpl))
            print("      %s" % msg)
    else:
        print("no clone crosses a structural landmark its template does not")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
