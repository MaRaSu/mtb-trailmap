#!/usr/bin/env python3
"""Run every style check and report a single pass/fail.

    python3 checks/run_all.py [--offline]

--offline skips the checks that read live tiles from vector.trailmap.fi and
tiles.trailmap.fi. Everything else works from style_base_v2.json alone.

The MapLibre style-spec validation is not here because it is JavaScript; run it
separately where @maplibre/maplibre-gl-style-spec is installed:

    node -e "const s=require('@maplibre/maplibre-gl-style-spec'), \\
      st=require('./style_base_v2.json'); \\
      console.log(s.validateStyleMin(st).map(e=>e.message).join('\\n')||'0 errors')"
"""

import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

# (script, needs the network)
CHECKS = [
    ("lint_filters.py", False),
    ("check_zorder.py", False),
    ("check_dead_branches.py", False),
    ("check_geomtype.py", True),
    ("check_hits.py", True),
    ("check_dupe_labels.py", True),
]


def main():
    offline = "--offline" in sys.argv
    failed = []
    for script, needs_net in CHECKS:
        if offline and needs_net:
            print("== %-24s skipped (needs live tiles)" % script)
            continue
        print("== %s" % script)
        r = subprocess.run([sys.executable, os.path.join(HERE, script)])
        if r.returncode != 0:
            failed.append(script)
        print()
    if failed:
        print("FAILED: %s" % ", ".join(failed))
        return 1
    print("all checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
