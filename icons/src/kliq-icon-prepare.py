#!/usr/bin/env python3
"""K-logo JPG -> 1024 master PNG (v2).

solid-pixel approach:
- solid = saturated color (red/teal arms) OR dark (squircle body / black pill)
- morphological close -> squircle silhouette; bbox from silhouette
- alpha = silhouette (erode 1px to cut white JPEG fringe, dilate 3px, feather)
- scale silhouette-side to 824, center on 1024 transparent canvas
"""
import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter

SRC = Path("/Users/wangwei/.workbuddy/clipboard-images/clipboard-2026-09-20T17-17-31-332Z-67277f5b.jpg")
OUT = Path.home() / "Documents/ChatGPT/record/work/icon-design/K-logo-master-1024.png"


def main() -> None:
    img = Image.open(SRC).convert("RGB")
    w, h = img.size
    px = img.load()

    solid = bytearray(w * h)
    for i in range(w * h):
        r, g, b = px[i % w, i // w]
        mx, mn = max(r, g, b), min(r, g, b)
        lum = (r + g + b) // 3
        if (mx - mn) > 60 or lum < 100:
            solid[i] = 1

    im_solid = Image.frombytes("L", (w, h), bytes(255 if v else 0 for v in solid))
    # close: dilate 13 then erode 13 (bridges the pill's light rim, smooths speckle)
    im_solid = im_solid.filter(ImageFilter.MaxFilter(25)).filter(ImageFilter.MinFilter(25))

    bbox = im_solid.getbbox()
    x0, y0, x1, y1 = bbox
    side = max(x1 - x0, y1 - y0)
    print(f"silhouette bbox={bbox} side={side}")
    if not (1400 < side < 1800):
        sys.exit(f"FATAL: unexpected squircle side {side}")

    # alpha: erode 1px (cut white fringe) -> dilate 3px -> feather
    alpha = im_solid.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(7))
    alpha = alpha.filter(ImageFilter.GaussianBlur(1.4))

    rgba = img.convert("RGBA")
    rgba.putalpha(alpha)

    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    half = side // 2 + 8
    crop = rgba.crop((cx - half, cy - half, cx - half + 2 * half, cy - half + 2 * half))
    inner = crop.resize((824, 824), Image.LANCZOS)

    master = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    master.paste(inner, (100, 100), inner)
    for xy in [(0, 0), (1023, 0), (0, 1023), (1023, 1023)]:
        if master.getpixel(xy)[3] != 0:
            sys.exit(f"FATAL: corner {xy} not transparent")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    master.save(OUT)
    print(f"[ok] {OUT}")


if __name__ == "__main__":
    main()
