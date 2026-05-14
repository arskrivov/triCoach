"""Render the TriCoach SVG logo into all the PNG variants the app needs.

Outputs (overwriting if present):
  - assets/images/icon.png            1024x1024  (iOS app icon source)
  - assets/images/adaptive-icon.png   1024x1024  (Android adaptive icon foreground; transparent bg)
  - assets/images/splash-icon.png     1024x1024  (Splash screen — square, transparent bg)
  - assets/images/favicon.png         48x48      (Web favicon)

The iOS icon must NOT have an alpha channel. Adaptive icon and splash use a
transparent background so the OS can place them on the configured fill colour.
"""

from __future__ import annotations

import os
from pathlib import Path

import cairosvg
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SVG_PATH = ROOT / "assets" / "images" / "logo.svg"
ASSETS_DIR = ROOT / "assets" / "images"


def render_svg_to_png(svg_path: Path, output_size: int) -> bytes:
    return cairosvg.svg2png(
        url=str(svg_path),
        output_width=output_size,
        output_height=output_size,
    )


def write_png(data: bytes, path: Path) -> None:
    path.write_bytes(data)
    print(f"  wrote {path.relative_to(ROOT)}  ({path.stat().st_size:>7} bytes)")


def flatten_to_rgb(src_path: Path, dst_path: Path, bg: str = "#0F1729") -> None:
    """Strip alpha by compositing onto a solid background — required for iOS icons."""
    img = Image.open(src_path).convert("RGBA")
    bg_img = Image.new("RGB", img.size, bg)
    bg_img.paste(img, mask=img.split()[3])
    bg_img.save(dst_path, "PNG", optimize=True)
    print(
        f"  wrote {dst_path.relative_to(ROOT)}  "
        f"(no alpha, bg={bg}, {dst_path.stat().st_size} bytes)"
    )


def render_transparent_subject(
    svg_path: Path, output_size: int, dst_path: Path, padding: float = 0.18
) -> None:
    """Render only the foreground (no background rectangles) at given size,
    centred with padding. Used for adaptive icon foreground and splash."""
    # Read the SVG, drop the <rect width="1024"> background fills so the
    # output PNG is transparent except for the actual triathlon symbols.
    svg_text = svg_path.read_text(encoding="utf-8")
    # The background rects are the only <rect> elements that fill the whole
    # 1024x1024 canvas — strip them out.
    transparent_svg = svg_text.replace(
        '<rect width="1024" height="1024" fill="#0F1729"/>', ""
    ).replace(
        '<rect width="1024" height="1024" fill="url(#bg-glow)"/>', ""
    )
    tmp = svg_path.with_suffix(".tmp.svg")
    tmp.write_text(transparent_svg, encoding="utf-8")
    try:
        # Render foreground at smaller size to leave padding around it.
        inner = int(output_size * (1.0 - 2 * padding))
        png_bytes = cairosvg.svg2png(
            url=str(tmp),
            output_width=inner,
            output_height=inner,
        )
        from io import BytesIO
        inner_img = Image.open(BytesIO(png_bytes)).convert("RGBA")
        canvas = Image.new("RGBA", (output_size, output_size), (0, 0, 0, 0))
        offset = (output_size - inner) // 2
        canvas.paste(inner_img, (offset, offset), inner_img)
        canvas.save(dst_path, "PNG", optimize=True)
        print(
            f"  wrote {dst_path.relative_to(ROOT)}  "
            f"(transparent, {dst_path.stat().st_size} bytes)"
        )
    finally:
        tmp.unlink(missing_ok=True)


def main() -> None:
    if not SVG_PATH.exists():
        raise SystemExit(f"missing source SVG: {SVG_PATH}")

    print(f"rendering from {SVG_PATH.relative_to(ROOT)}")

    # 1) iOS icon — solid background, NO alpha.
    icon_with_alpha = ASSETS_DIR / ".icon-tmp-rgba.png"
    icon_with_alpha.write_bytes(render_svg_to_png(SVG_PATH, 1024))
    flatten_to_rgb(icon_with_alpha, ASSETS_DIR / "icon.png")
    icon_with_alpha.unlink()

    # 2) Android adaptive icon foreground — transparent, padded.
    render_transparent_subject(SVG_PATH, 1024, ASSETS_DIR / "adaptive-icon.png")

    # 3) Splash screen icon — transparent, padded a bit more.
    render_transparent_subject(
        SVG_PATH, 1024, ASSETS_DIR / "splash-icon.png", padding=0.22
    )

    # 4) Web favicon.
    favicon_data = render_svg_to_png(SVG_PATH, 48)
    write_png(favicon_data, ASSETS_DIR / "favicon.png")

    print("done.")


if __name__ == "__main__":
    main()
