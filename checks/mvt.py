#!/usr/bin/env python3
"""Minimal Mapbox Vector Tile reader -- attributes only, geometry skipped.

Enough to answer "what class/size values are actually in these tiles", which is
what the style filters have to match. No dependencies.
"""

import gzip
import urllib.request


def _varint(buf, i):
    result = 0
    shift = 0
    while True:
        byte = buf[i]
        i += 1
        result |= (byte & 0x7F) << shift
        if not byte & 0x80:
            return result, i
        shift += 7


def _fields(buf, start, end):
    """Yield (field_number, wire_type, value) where value is bytes or int."""
    i = start
    while i < end:
        key, i = _varint(buf, i)
        field, wire = key >> 3, key & 7
        if wire == 0:
            val, i = _varint(buf, i)
            yield field, wire, val
        elif wire == 1:
            yield field, wire, buf[i : i + 8]
            i += 8
        elif wire == 2:
            length, i = _varint(buf, i)
            yield field, wire, buf[i : i + length]
            i += length
        elif wire == 5:
            yield field, wire, buf[i : i + 4]
            i += 4
        else:
            raise ValueError("wire type %d" % wire)


def _value(buf):
    import struct

    for field, wire, val in _fields(buf, 0, len(buf)):
        if field == 1:
            return val.decode("utf-8", "replace")
        if field == 2:
            return struct.unpack("<f", val)[0]
        if field == 3:
            return struct.unpack("<d", val)[0]
        if field in (4, 5):
            return val
        if field == 6:  # sint64
            return (val >> 1) ^ -(val & 1)
        if field == 7:
            return bool(val)
    return None


def read_tile(raw):
    """-> {layer_name: [ {attr: value}, ... ]}"""
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    out = {}
    for field, _wire, val in _fields(raw, 0, len(raw)):
        if field != 3:
            continue
        name, keys, values, feats = None, [], [], []
        for f2, _w2, v2 in _fields(val, 0, len(val)):
            if f2 == 1:
                name = v2.decode()
            elif f2 == 2:
                feats.append(v2)
            elif f2 == 3:
                keys.append(v2.decode())
            elif f2 == 4:
                values.append(_value(v2))
        rows = []
        for feat in feats:
            tags = []
            for f3, w3, v3 in _fields(feat, 0, len(feat)):
                if f3 == 2 and w3 == 2:
                    i = 0
                    while i < len(v3):
                        num, i = _varint(v3, i)
                        tags.append(num)
            row = {}
            for j in range(0, len(tags) - 1, 2):
                ki, vi = tags[j], tags[j + 1]
                if ki < len(keys) and vi < len(values):
                    row[keys[ki]] = values[vi]
            rows.append(row)
        out.setdefault(name, []).extend(rows)
    return out


def fetch(archive, z, x, y, host="https://vector.trailmap.fi"):
    url = "%s/data/%s/%d/%d/%d.pbf" % (host, archive, z, x, y)
    return read_tile(urllib.request.urlopen(url, timeout=60).read())


def tile_xy(lat, lon, z):
    import math

    n = 2 ** z
    return (
        int((lon + 180.0) / 360.0 * n),
        int((1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n),
    )


def _geom_length(cmds, extent=4096):
    """Total line length in tile units from an MVT geometry command stream."""
    import math
    i, total = 0, 0.0
    cx = cy = 0.0
    px = py = None
    while i < len(cmds):
        cmd = cmds[i]; i += 1
        op, count = cmd & 0x7, cmd >> 3
        if op == 1:  # MoveTo
            for _ in range(count):
                dx = (cmds[i] >> 1) ^ -(cmds[i] & 1); i += 1
                dy = (cmds[i] >> 1) ^ -(cmds[i] & 1); i += 1
                cx += dx; cy += dy
                px, py = cx, cy
        elif op == 2:  # LineTo
            for _ in range(count):
                dx = (cmds[i] >> 1) ^ -(cmds[i] & 1); i += 1
                dy = (cmds[i] >> 1) ^ -(cmds[i] & 1); i += 1
                cx += dx; cy += dy
                if px is not None:
                    total += math.hypot(cx - px, cy - py)
                px, py = cx, cy
        else:
            break
    return total


def read_tile_lengths(raw, z):
    """-> {layer: [(attrs, length_metres), ...]} for line geometries."""
    import gzip, math
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    out = {}
    for field, _w, val in _fields(raw, 0, len(raw)):
        if field != 3:
            continue
        name, keys, values, feats, extent = None, [], [], [], 4096
        for f2, _w2, v2 in _fields(val, 0, len(val)):
            if f2 == 1: name = v2.decode()
            elif f2 == 2: feats.append(v2)
            elif f2 == 3: keys.append(v2.decode())
            elif f2 == 4: values.append(_value(v2))
            elif f2 == 5: extent = v2
        # metres per tile unit at this zoom (equator approximation)
        mpt = (40075016.686 / (2 ** z)) / extent
        rows = []
        for feat in feats:
            tags, geom, gtype = [], [], 0
            for f3, w3, v3 in _fields(feat, 0, len(feat)):
                if f3 == 2 and w3 == 2:
                    i = 0
                    while i < len(v3):
                        num, i = _varint(v3, i); tags.append(num)
                elif f3 == 3:
                    gtype = v3
                elif f3 == 4 and w3 == 2:
                    i = 0
                    while i < len(v3):
                        num, i = _varint(v3, i); geom.append(num)
            if gtype != 2:      # LineString only
                continue
            row = {}
            for j in range(0, len(tags) - 1, 2):
                ki, vi = tags[j], tags[j + 1]
                if ki < len(keys) and vi < len(values):
                    row[keys[ki]] = values[vi]
            rows.append((row, _geom_length(geom, extent) * mpt))
        if rows:
            out.setdefault(name, []).extend(rows)
    return out
