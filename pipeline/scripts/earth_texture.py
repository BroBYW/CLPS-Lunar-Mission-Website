"""Earth texture for the 3D views: Cesium's bundled Natural Earth II tiles (public domain) stitched into one
equirectangular image, latitude 90..-90 top to bottom and longitude 0..360 east from the left edge (the texture
coordinates of Cesium's EllipsoidGeometry start at 0 degrees). Writes web/public/data/earth.jpg."""

from PIL import Image

from clps.paths import REPO_DIR, WEB_DATA_DIR

TILES = REPO_DIR / "web" / "node_modules" / "cesium" / "Build" / "Cesium" / "Assets" / "Textures" / "NaturalEarthII" / "2"


def main() -> None:
    nx, ny, size = 8, 4, 256  # TMS level 2, geodetic profile: 8 x 4 tiles, row 0 at the south
    img = Image.new("RGB", (nx * size, ny * size))
    for x in range(nx):
        for y in range(ny):
            tile = Image.open(TILES / str(x) / f"{y}.jpg").convert("RGB")
            img.paste(tile, (x * size, (ny - 1 - y) * size))
    # The tiles start at -180 degrees; start the image at 0 degrees instead
    w = img.width
    rolled = Image.new("RGB", img.size)
    rolled.paste(img.crop((w // 2, 0, w, img.height)), (0, 0))
    rolled.paste(img.crop((0, 0, w // 2, img.height)), (w // 2, 0))
    out = WEB_DATA_DIR / "earth.jpg"
    rolled.resize((1024, 512), Image.LANCZOS).save(out, "JPEG", quality=85, optimize=True)
    print(f"wrote {out.name}: {out.stat().st_size / 1e3:.0f} kB")


if __name__ == "__main__":
    main()
