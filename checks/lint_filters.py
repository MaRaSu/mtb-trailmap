#!/usr/bin/env python3
"""Lint filters for the legacy/expression mix MapLibre rejects.

MapLibre decides once, for the whole filter, whether it is a legacy filter or an
expression (isExpressionFilter). A legacy combining filter -- ["all", ...] whose
children are legacy comparisons -- requires every child to be legacy too, so
["all", ["==", "$type", "Polygon"], ["in", ["get","class"], ["literal", [...]]]]
fails validation with "string expected, array found" on the child's argument.

This flags any filter that mixes the two forms, and any use of the legacy
"$type" / bare-string field form inside an otherwise expression filter.
"""

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

import json

STYLE = os.path.join(REPO, "style_base_v2.json")

CMP = {"==", "!=", "<", "<=", ">", ">="}
SET_OP = {"in", "!in"}
EXIST = {"has", "!has"}
COMBINE = {"all", "any", "none"}


def classify(f):
    """-> 'legacy' | 'expression' | 'combine' | 'other'"""
    if not isinstance(f, list) or not f:
        return "other"
    op = f[0]
    if op in COMBINE:
        return "combine"
    if op in CMP | SET_OP | EXIST:
        # legacy iff the field argument is a bare string
        return "legacy" if len(f) > 1 and isinstance(f[1], str) else "expression"
    return "expression"


def walk(f, path, out):
    kind = classify(f)
    if kind == "combine":
        kinds = {}
        for i, child in enumerate(f[1:], start=1):
            k = classify(child)
            if k == "combine":
                walk(child, path + [i], out)
                continue
            kinds.setdefault(k, []).append(i)
        if "legacy" in kinds and "expression" in kinds:
            out.append((path, "mixed legacy+expression under %r: legacy at %s, expression at %s"
                        % (f[0], kinds["legacy"], kinds["expression"])))
    return out


def uses_legacy_type(f):
    if isinstance(f, list):
        if len(f) > 1 and f[1] == "$type":
            return True
        return any(uses_legacy_type(x) for x in f)
    return False


def main():
    style = json.load(open(sys.argv[1] if len(sys.argv) > 1 else STYLE, encoding="utf-8"))
    bad = []
    legacy_type = []
    for i, layer in enumerate(style["layers"]):
        f = layer.get("filter")
        if f is None:
            continue
        problems = walk(f, [], [])
        for path, msg in problems:
            bad.append((i, layer["id"], msg))
        if uses_legacy_type(f) and classify(f) == "combine":
            # a $type test alongside anything expression-shaped is the exact trap
            if any(classify(c) == "expression" for c in f[1:]):
                legacy_type.append((i, layer["id"]))
    if bad:
        print("MIXED-SYNTAX FILTERS (%d):" % len(bad))
        for i, lid, msg in bad:
            print("  layers[%d] %-52s %s" % (i, lid, msg))
    else:
        print("no mixed legacy/expression filters")
    print()
    print("layers still using the legacy \"$type\" form: %d"
          % sum(1 for l in style["layers"] if uses_legacy_type(l.get("filter"))))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
