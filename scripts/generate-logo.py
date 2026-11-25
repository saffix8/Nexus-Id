#!/usr/bin/env python3
"""NexusID logo mark: rounded square, accent fill (#3B6FE8), white bold "N" (DESIGN.md §10).

Pure standard library (no Pillow): scanline rasterizer with 4x4 supersampling + hand-written PNG/ICO
encoders, so it runs on any machine. Writes every size the web, extension and Android app use.

    python3 scripts/generate-logo.py
"""
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ACCENT = (0x3B, 0x6F, 0xE8)
WHITE = (0xFF, 0xFF, 0xFF)

# Geometry on a 128-unit grid. The N is a single polygon (two stems + diagonal), DM Sans 700 proportions.
N_POLY = [(36, 96), (36, 32), (53, 32), (75, 69), (75, 32), (92, 32), (92, 96), (75, 96), (53, 59), (53, 96)]
SQUARE_RADIUS = 28  # rounded square (≈22%), like the 8 px radius on a 32 px web mark

SVG = f"""<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="{SQUARE_RADIUS}" fill="#3B6FE8"/>
  <path d="M{' L'.join(f'{x} {y}' for x, y in N_POLY)} Z" fill="#FFFFFF"/>
</svg>
"""


def spans_polygon(poly, y):
    """x-intervals where the horizontal line at y is inside the polygon (even-odd)."""
    xs = []
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 <= y < y2) or (y2 <= y < y1):
            xs.append(x1 + (y - y1) * (x2 - x1) / (y2 - y1))
    xs.sort()
    return list(zip(xs[0::2], xs[1::2]))


def spans_rounded_rect(r, y, size=128.0):
    if y < 0 or y >= size:
        return []
    if y < r:
        dy = r - y
    elif y > size - r:
        dy = y - (size - r)
    else:
        return [(0.0, size)]
    dx = r - (max(r * r - dy * dy, 0.0)) ** 0.5
    return [(dx, size - dx)]


def spans_circle(y, size=128.0):
    c = size / 2
    dy = y - c
    if abs(dy) >= c:
        return []
    dx = (c * c - dy * dy) ** 0.5
    return [(c - dx, c + dx)]


def coverage(size, span_fn, ss=4):
    """Per-pixel coverage 0..1 for a shape given as a span function on the 128 grid."""
    cov = [[0.0] * size for _ in range(size)]
    scale = 128.0 / size
    sub = 1.0 / ss
    w = 1.0 / (ss * ss)
    for py in range(size):
        row = cov[py]
        for sy in range(ss):
            y = (py + (sy + 0.5) * sub) * scale
            for a, b in span_fn(y):
                for sx in range(ss):
                    off = (sx + 0.5) * sub
                    # pixel px is covered at this sub-column if a <= (px+off)*scale < b
                    p0 = max(0, int(-(-(a / scale - off) // 1)))
                    p1 = min(size, int(-(-(b / scale - off) // 1)))
                    for px in range(p0, p1):
                        row[px] += w
    return cov


def render(size, round_shape=False):
    bg = coverage(size, spans_circle if round_shape else (lambda y: spans_rounded_rect(SQUARE_RADIUS, y)))
    if round_shape:
        # Shrink the N a little so it sits inside the circle's safe zone.
        c = 64
        poly = [(c + (x - c) * 0.82, c + (y - c) * 0.82) for x, y in N_POLY]
    else:
        poly = N_POLY
    fg = coverage(size, lambda y: spans_polygon(poly, y))
    pixels = bytearray()
    for y in range(size):
        pixels.append(0)  # PNG filter: none
        for x in range(size):
            a_bg = min(bg[y][x], 1.0)
            a_fg = min(fg[y][x], 1.0)
            r = ACCENT[0] + (WHITE[0] - ACCENT[0]) * a_fg
            g = ACCENT[1] + (WHITE[1] - ACCENT[1]) * a_fg
            b = ACCENT[2] + (WHITE[2] - ACCENT[2]) * a_fg
            pixels += bytes((round(r), round(g), round(b), round(255 * a_bg)))
    return png(size, bytes(pixels))


def png(size, raw):
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def ico(images):
    """ICO with embedded PNGs (supported by every current browser)."""
    header = struct.pack("<HHH", 0, 1, len(images))
    entries, data = b"", b""
    offset = 6 + 16 * len(images)
    for size, blob in images:
        entries += struct.pack("<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32, len(blob), offset + len(data))
        data += blob
    return header + entries + data


def write(rel, content):
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    mode = "w" if isinstance(content, str) else "wb"
    with open(path, mode) as f:
        f.write(content)
    print("wrote", rel)


def main():
    cache = {}

    def mark(size, round_shape=False):
        key = (size, round_shape)
        if key not in cache:
            cache[key] = render(size, round_shape)
        return cache[key]

    # Web (Next.js app-dir file conventions: served as favicon / icon / apple-touch-icon)
    write("apps/web/app/icon.svg", SVG)
    write("apps/web/app/favicon.ico", ico([(16, mark(16)), (32, mark(32)), (48, mark(48))]))
    write("apps/web/app/apple-icon.png", mark(180))

    # Chrome extension
    for s in (16, 32, 48, 128):
        write(f"apps/extension/icons/icon{s}.png", mark(s))
        write(f"apps/extension/icons/icon{s}.svg", SVG)

    # Android launcher
    for folder, s in (("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)):
        write(f"apps/mobile/android/app/src/main/res/mipmap-{folder}/ic_launcher.png", mark(s))
        write(f"apps/mobile/android/app/src/main/res/mipmap-{folder}/ic_launcher_round.png", mark(s, True))


if __name__ == "__main__":
    main()
