#!/usr/bin/env python3
"""Regenerate PWA / favicon / apple-touch icons with full-bleed backgrounds.

Root cause: Recraft opaque masters baked a rounded black tile onto a white
matte. iOS/Android then show that matte as a white ring around the mark.

Fix: composite the existing transparent Helmet Orbit marks (landing assets,
left untouched) onto solid full-bleed canvases, then resize into every
favicon / PWA / apple-touch / maskable size.

- Dark install icons → white helmet + purple GIQ/orbit on #000000
- Light scheme icons → dark helmet + purple GIQ/orbit on #FFFFFF
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / "public" / "icons"

DARK_BG = (0, 0, 0, 255)
LIGHT_BG = (255, 255, 255, 255)


def composite_mark(mark_path: Path, bg: tuple[int, int, int, int], size: int = 1024) -> Image.Image:
    """Center the transparent mark on a solid square canvas."""
    mark = Image.open(mark_path).convert("RGBA")
    # Normalize mark canvas to `size` first (masters are 1024).
    if mark.size != (size, size):
        mark = mark.resize((size, size), Image.Resampling.LANCZOS)
    base = Image.new("RGBA", (size, size), bg)
    base.alpha_composite(mark)
    return base


def resize_square(src: Image.Image, size: int) -> Image.Image:
    return src.convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)


def artwork_bbox_on_bg(im: Image.Image, bg: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    w, h = im.size
    px = im.load()
    assert px is not None
    br, bg_, bb, _ = bg
    min_x, min_y, max_x, max_y = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 10:
                continue
            if abs(r - br) + abs(g - bg_) + abs(b - bb) <= 18:
                continue
            if x < min_x:
                min_x = x
            if y < min_y:
                min_y = y
            if x > max_x:
                max_x = x
            if y > max_y:
                max_y = y
    if max_x < 0:
        return (0, 0, w, h)
    return (min_x, min_y, max_x + 1, max_y + 1)


def maskable_icon(src: Image.Image, size: int, bg: tuple[int, int, int, int], content_scale: float = 0.8) -> Image.Image:
    """Keep the mark inside the maskable safe zone; pad with solid bg."""
    base = Image.new("RGBA", (size, size), bg)
    bbox = artwork_bbox_on_bg(src, bg)
    mark = src.crop(bbox)
    target = max(1, int(round(size * content_scale)))
    mw, mh = mark.size
    scale = min(target / mw, target / mh)
    nw = max(1, int(round(mw * scale)))
    nh = max(1, int(round(mh * scale)))
    resized = mark.resize((nw, nh), Image.Resampling.LANCZOS)
    base.alpha_composite(resized, ((size - nw) // 2, (size - nh) // 2))
    return base


def save_png(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.convert("RGBA").save(path, format="PNG", optimize=True)
    print(f"wrote {path.relative_to(ROOT)} ({im.size[0]}x{im.size[1]})")


def save_ico(src: Image.Image, path: Path) -> None:
    icons = [src.resize(s, Image.Resampling.LANCZOS) for s in ((16, 16), (32, 32), (48, 48))]
    path.parent.mkdir(parents=True, exist_ok=True)
    icons[0].save(
        path,
        format="ICO",
        sizes=[(i.width, i.height) for i in icons],
        append_images=icons[1:],
    )
    print(f"wrote {path.relative_to(ROOT)} (ico)")


def assert_full_bleed(path: Path, expect_dark: bool) -> None:
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    corners = [
        im.getpixel((0, 0)),
        im.getpixel((w - 1, 0)),
        im.getpixel((0, h - 1)),
        im.getpixel((w - 1, h - 1)),
    ]
    for c in corners:
        r, g, b, a = c
        if expect_dark:
            if r > 5 or g > 5 or b > 5 or a < 250:
                raise SystemExit(f"{path} corner not full-bleed black: {c}")
        else:
            if r < 250 or g < 250 or b < 250 or a < 250:
                raise SystemExit(f"{path} corner not full-bleed white: {c}")
    # Outer margin must not contain a light matte/ring on dark icons.
    if expect_dark:
        px = im.load()
        assert px is not None
        margin = max(2, w // 20)
        for y in list(range(margin)) + list(range(h - margin, h)):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a > 200 and r > 40 and g > 40 and b > 40 and max(abs(r - g), abs(g - b), abs(r - b)) < 25:
                    raise SystemExit(f"{path} light ring pixel at {(x, y)}: {(r, g, b, a)}")
        for x in list(range(margin)) + list(range(w - margin, w)):
            for y in range(h):
                r, g, b, a = px[x, y]
                if a > 200 and r > 40 and g > 40 and b > 40 and max(abs(r - g), abs(g - b), abs(r - b)) < 25:
                    raise SystemExit(f"{path} light ring pixel at {(x, y)}: {(r, g, b, a)}")
    print(f"ok full-bleed {'black' if expect_dark else 'white'}: {path.relative_to(ROOT)}")


def main() -> None:
    dark_mark = ICONS / "helmet-orbit-mark-transparent-1024.png"
    light_mark = ICONS / "helmet-orbit-mark-transparent-light-1024.png"
    for p in (dark_mark, light_mark):
        if not p.exists():
            raise SystemExit(f"missing source mark {p}")

    dark = composite_mark(dark_mark, DARK_BG, 1024)
    light = composite_mark(light_mark, LIGHT_BG, 1024)

    # Canonical opaque 1024 masters (full-bleed) — replace white-matted Recraft exports
    save_png(dark, ICONS / "helmet-orbit-giq-dark-1024.png")
    save_png(dark, ICONS / "helmet-orbit-1024.png")
    save_png(light, ICONS / "helmet-orbit-giq-light-1024.png")
    save_png(light, ICONS / "helmet-orbit-mark-light-1024.png")

    for size in (128, 256, 512):
        frame = resize_square(dark, size)
        save_png(frame, ICONS / f"helmet-orbit-giq-dark-{size}.png")
        save_png(frame, ICONS / f"helmet-orbit-mark-{size}.png")

    for size in (128, 256, 512):
        frame = resize_square(light, size)
        save_png(frame, ICONS / f"helmet-orbit-giq-light-{size}.png")
        save_png(frame, ICONS / f"helmet-orbit-mark-light-{size}.png")
    save_png(resize_square(light, 2048), ICONS / "helmet-orbit-mark-light-2048.png")

    icon_512 = resize_square(dark, 512)
    icon_192 = resize_square(dark, 192)
    icon_32 = resize_square(dark, 32)
    icon_maskable = maskable_icon(dark, 512, DARK_BG, content_scale=0.8)
    apple = resize_square(dark, 180)

    save_png(icon_512, ICONS / "icon-512.png")
    save_png(icon_192, ICONS / "icon-192.png")
    save_png(icon_32, ICONS / "icon-32.png")
    save_png(icon_maskable, ICONS / "icon-512-maskable.png")
    save_png(apple, ICONS / "apple-touch-icon.png")
    save_png(apple, ROOT / "public" / "apple-touch-icon.png")

    save_png(resize_square(light, 512), ICONS / "icon-512-light.png")
    save_png(resize_square(light, 192), ICONS / "icon-192-light.png")
    save_png(resize_square(light, 32), ICONS / "icon-32-light.png")

    save_ico(icon_32, ROOT / "public" / "favicon.ico")
    save_ico(icon_32, ICONS / "favicon.ico")
    save_ico(icon_32, ROOT / "src" / "app" / "favicon.ico")

    for path in (
        ICONS / "icon-512.png",
        ICONS / "icon-192.png",
        ICONS / "icon-32.png",
        ICONS / "icon-512-maskable.png",
        ICONS / "apple-touch-icon.png",
        ROOT / "public" / "apple-touch-icon.png",
        ICONS / "helmet-orbit-giq-dark-1024.png",
        ICONS / "helmet-orbit-1024.png",
    ):
        assert_full_bleed(path, expect_dark=True)

    for path in (
        ICONS / "icon-512-light.png",
        ICONS / "icon-192-light.png",
        ICONS / "helmet-orbit-giq-light-1024.png",
    ):
        assert_full_bleed(path, expect_dark=False)

    # Landing transparent marks must remain byte-identical to git.
    print("done")


if __name__ == "__main__":
    main()
