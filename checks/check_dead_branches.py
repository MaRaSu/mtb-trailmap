#!/usr/bin/env python3
"""Find paint/layout branches a layer's own filter makes unreachable.

The Sweden ditch bug generalised: a clone narrows the filter to one class but
keeps the template's `case`/`match` on that same attribute, so the test is always
false and every feature silently takes the fallback -- which was the wrong width.
Nothing errors and the style validates.

For each national layer this derives the set of values its filter allows for an
attribute, then checks every case/match keyed on that attribute for branches that
can never be taken, and for tests that are constant.
"""

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

import json

import check_hits as ch

TAGS = {"swe", "est", "nor", "dnk"}


def allowed(f, attr):
    """Values `attr` may take under this filter, or None if unconstrained."""
    if not isinstance(f, list) or not f:
        return None
    op = f[0]
    if op == "all":
        best = None
        for child in f[1:]:
            got = allowed(child, attr)
            if got is not None:
                best = got if best is None else (best & got)
        return best
    # expression form
    if op == "==" and isinstance(f[1], list) and f[1][:2] == ["get", attr]:
        return {f[2]}
    if op == "in" and isinstance(f[1], list) and f[1][:2] == ["get", attr]:
        vals = f[2]
        if isinstance(vals, list) and vals and vals[0] == "literal":
            return set(vals[1])
    # legacy form
    if op == "==" and f[1] == attr:
        return {f[2]}
    if op == "in" and f[1] == attr:
        return set(f[2:])
    return None


def branches(node, out, path="paint/layout"):
    """Yield (attr, labels, kind) for every case/match keyed on ["get", attr]."""
    if isinstance(node, list) and node:
        if node[0] == "match" and isinstance(node[1], list) and node[1][:1] == ["get"]:
            labels = []
            for i in range(2, len(node) - 1, 2):
                lab = node[i]
                labels.append(lab if isinstance(lab, list) else [lab])
            out.append((node[1][1], labels, "match"))
        if node[0] == "case":
            for i in range(1, len(node) - 1, 2):
                c = node[i]
                if isinstance(c, list) and c[0] in ("==", "!=") and \
                        isinstance(c[1], list) and c[1][:1] == ["get"]:
                    out.append((c[1][1], [[c[2]]], "case " + c[0]))
        for v in node:
            branches(v, out, path)
    elif isinstance(node, dict):
        for v in node.values():
            branches(v, out, path)
    return out


def main():
    style = json.load(open(ch.STYLE, encoding="utf-8"))
    problems, notes = [], []
    checked = 0
    for layer in style["layers"]:
        tag = (layer.get("metadata") or {}).get("trailmap:country")
        if not isinstance(tag, str) or tag not in TAGS:
            continue
        f = layer.get("filter")
        found = []
        branches(layer.get("paint"), found)
        branches(layer.get("layout"), found)
        if not found:
            continue
        checked += 1
        for attr, labels, kind in found:
            vals = allowed(f, attr)
            if vals is None:
                continue
            reachable = [any(v in vals for v in lab) for lab in labels]
            covered = set().union(*labels) if labels else set()
            if not any(reachable):
                problems.append((layer["id"], attr, kind,
                                 "no branch reachable -- always the fallback; filter allows %s"
                                 % sorted(vals)))
            else:
                if not all(reachable):
                    dead = [labels[i] for i, r in enumerate(reachable) if not r]
                    problems.append((layer["id"], attr, kind,
                                     "dead branch %s; filter allows %s" % (dead, sorted(vals))))
                # individual labels inside a group that can never match
                stale = sorted(v for lab in labels for v in lab if v not in vals)
                if stale:
                    problems.append((layer["id"], attr, kind,
                                     "unreachable labels %s; filter allows %s"
                                     % (stale, sorted(vals))))
                # An unreachable fallback is only a defect when it carries a real
                # alternative value. For a sentinel like "#blank" it means the
                # filter and the branch list agree, which is what you want -- so
                # this is reported as a note, not a failure.
                if kind == "match" and vals <= covered:
                    notes.append((layer["id"], attr,
                                  "fallback never reached (filter and branches agree)"))
    print("checked %d national layers with data-driven paint/layout" % checked)
    if notes:
        print("  (%d fallbacks never reached -- filter and branch list agree, no action)" % len(notes))
    if problems:
        print()
        for lid, attr, kind, msg in problems:
            print("  %-46s %s on %-10s %s" % (lid, kind, attr, msg))
    else:
        print("no unreachable branches")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
