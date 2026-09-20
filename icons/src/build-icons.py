#!/usr/bin/env python3
"""Generate the full Kliq icon set from the master 1024px PNG (design A)."""
import struct
import sys
from pathlib import Path

from PIL import Image

REPO = Path.home() / "Documents/ChatGPT/record"
SRC = REPO / "work/icon-design/A-dark-rings.png"

PNG_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
APP_ICON_SIZES = [16, 32, 64, 128, 256, 512, 1024]
ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

ICNS_MAP = {
    "icon_16x16.png": 16,
    "icon_16x16@2x.png": 32,
    "icon_32x32.png": 32,
    "icon_32x32@2x.png": 64,
    "icon_128x128.png": 128,
    "icon_128x128@2x.png": 256,
    "icon_256x256.png": 256,
    "icon_256x256@2x.png": 512,
    "icon_512x512.png": 512,
    "icon_512x512@2x.png": 1024,
}


def main() -> None:
    master = Image.open(SRC).convert("RGBA")
    assert master.size == (1024, 1024), master.size

    # sanity: corners must be fully transparent (squircle on transparent canvas)
    for xy in [(0, 0), (1023, 0), (0, 1023), (1023, 1023)]:
        a = master.getpixel(xy)[3]
        if a != 0:
            sys.exit(f"FATAL: corner {xy} alpha={a}, expected transparent")

    rendered = {}

    def resized(size: int) -> Image.Image:
        if size not in rendered:
            rendered[size] = master.resize((size, size), Image.LANCZOS)
        return rendered[size]

    # 1. electron-builder linux/png set
    png_dir = REPO / "icons/icons/png"
    png_dir.mkdir(parents=True, exist_ok=True)
    for s in PNG_SIZES:
        resized(s).save(png_dir / f"{s}x{s}.png", optimize=True)
    print(f"[ok] {png_dir} ({len(PNG_SIZES)} files)")

    # 2. macOS icns via iconset
    iconset = REPO / "work/icon-design/icon.iconset"
    iconset.mkdir(parents=True, exist_ok=True)
    for name, s in ICNS_MAP.items():
        resized(s).save(iconset / name, optimize=True)
    print(f"[ok] {iconset}")

    # 3. in-app / tray / favicon set (public/app-icons)
    app_dir = REPO / "public/app-icons"
    app_dir.mkdir(parents=True, exist_ok=True)
    for s in APP_ICON_SIZES:
        img = resized(s)
        img.save(app_dir / f"kliq-{s}.png", optimize=True)
        img.save(app_dir / f"kliqmac-{s}.png", optimize=True)
    print(f"[ok] {app_dir} (kliq-*/kliqmac-* x{len(APP_ICON_SIZES)})")

    # 4. website favicon/logo (512)
    site = REPO / "cloudflare/pages/icon.png"
    resized(512).save(site, optimize=True)
    print(f"[ok] {site}")

    # 5. Windows ico (PNG-compressed entries, Vista+)
    ico_path = REPO / "icons/icons/win/icon.ico"
    pngs = [resized(s) for s in ICO_SIZES]
    buf = bytearray()
    buf += struct.pack("<HHH", 0, 1, len(pngs))
    offset = 6 + 16 * len(pngs)
    for img in pngs:
        s = img.size[0]
        data = img.tobytes()  # placeholder to force encode below
        import io

        b = io.BytesIO()
        img.save(b, "PNG", optimize=True)
        data = b.getvalue()
        wh = 0 if s >= 256 else s
        buf += struct.pack("<BBBBHHII", wh, wh, 0, 0, 1, 32, len(data), offset)
        buf += data
        offset += len(data)
    ico_path.write_bytes(bytes(buf))
    print(f"[ok] {ico_path} ({len(ICO_SIZES)} entries, {len(buf)} bytes)")


if __name__ == "__main__":
    main()
