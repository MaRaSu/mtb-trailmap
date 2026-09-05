# Style checks

Checks for `style_base_v2.json`, written while adding the Swedish, Estonian,
Norwegian and Danish national layers. Each one exists because a real bug got
through review: they are not general linting, they catch the specific ways a
layer cloned from another country goes wrong silently.

    python3 checks/run_all.py             # everything
    python3 checks/run_all.py --offline   # only the checks that need no network

Exit code 0 means clean.

## What each one catches

| script | catches |
|---|---|
| `lint_filters.py` | A filter mixing legacy and expression syntax. MapLibre decides once for the whole filter, so `["all", ["==","$type","Polygon"], ["in",["get","class"],…]]` fails validation with *"string expected, array found"*. |
| `check_zorder.py` | A clone that landed in the wrong band of the stack. Compares each clone against the layer whose position it should mirror, across structural landmarks. Found Estonian depth contours drawn under the sea, and power lines in the wrong order. |
| `check_dead_branches.py` | A clone that narrowed its filter but kept a `case`/`match` on the attribute it narrowed, so a branch is unreachable and every feature silently takes the fallback. Found Swedish ditches drawing at stream width — wider than the largest river. |
| `check_geomtype.py` | A layer whose type does not match the geometry it draws — most importantly a point-placed symbol layer over LineString data, which gives one label per tile the line crosses. Found "Søborg Kanal" labelled eight times. |
| `check_hits.py` | A layer whose filter matches nothing in the real tiles: a typo in a class value, or a class that does not exist in that country's data. |
| `check_dupe_labels.py` | A name drawn twice, once from OSM and once from the national source. Walks every zoom because OSM gates classes by zoom inside the tiles — `hamlet` appears at z11, `isolated_dwelling` only at z14, so a two-zoom sample proves nothing. |
| `validate_all.py` | Takes two style files and confirms the countries that must not change select exactly the same layers, across every style variant. Also checks sources, source-layers, sprites and filter attributes against the live TileJSON. Usage: `python3 checks/validate_all.py <before.json> <after.json>` |
| `verify_build.py` | Library. A Python port of `buildMapStyleV2`'s layer selection, used by the checks above to ask "what would the app actually draw here". |
| `mvt.py` | Library. Minimal Mapbox Vector Tile reader — attributes, geometry type and line length. No dependencies. |

## Notes

- The network checks read live tiles from `vector.trailmap.fi` and
  `tiles.trailmap.fi`. They compare the style against the data as deployed, which
  is the point — a style can be perfectly valid and still filter on an attribute
  the tiles stopped carrying.
- `zorder_map.json` records, for each national layer, the layer whose stack
  position it should mirror. Most entries are the layer it was cloned from; a few
  name a different one on purpose, where the template was picked for its paint
  rather than its position. Add an entry when a national layer is added.
- MapLibre's own spec validation is JavaScript and is not run from here. See the
  docstring in `run_all.py` for the one-liner.
