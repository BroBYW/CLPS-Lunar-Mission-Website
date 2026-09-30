"""Tile every site's mask plot into one image for review: pipeline/validation/masks/_sheet.png"""

from PIL import Image

from clps.paths import VALIDATION_DIR
from clps.sites import load_resolved_sites


def main() -> None:
    d = VALIDATION_DIR / "masks"
    tiles = [Image.open(d / f"{s['id']}.png").convert("RGB") for s in load_resolved_sites()]
    w, h = tiles[0].size
    scale = 0.5
    tw, th = int(w * scale), int(h * scale)
    cols = 2
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGB", (tw * cols, th * rows), "white")
    for i, t in enumerate(tiles):
        sheet.paste(t.resize((tw, th), Image.LANCZOS), ((i % cols) * tw, (i // cols) * th))
    out = d / "_sheet.png"
    sheet.save(out)
    print(f"wrote {out} ({sheet.size[0]}x{sheet.size[1]})")


if __name__ == "__main__":
    main()
