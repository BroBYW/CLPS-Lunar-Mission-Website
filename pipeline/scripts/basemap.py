"""South pole hillshade basemap for the site map (PLAN.md §5 step 6), rendered from the LOLA 80 m map."""

import json

import numpy as np
from PIL import Image

from clps.dem import FAR_FILES, Raster
from clps.paths import WEB_DATA_DIR

HALF_M = 220_000.0  # map extent: +-220 km from the pole (about 82.8 S on the axes)
SIZE_PX = 1600
# Palette endpoints from the design tokens: Shadow (#1a1916) to Dust (#b8b2a7)
DARK = np.array([0x1A, 0x19, 0x16], float)
LIGHT = np.array([0xB8, 0xB2, 0xA7], float)


def hillshade(z: np.ndarray, res: float, azimuth_deg: float = 315.0, altitude_deg: float = 35.0, zf: float = 2.0) -> np.ndarray:
    dy, dx = np.gradient(z * zf, res)
    slope = np.arctan(np.hypot(dx, dy))
    aspect = np.arctan2(dy, -dx)
    az = np.radians(360.0 - azimuth_deg + 90.0)
    alt = np.radians(altitude_deg)
    shade = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    return np.clip(shade, 0, 1)


def main() -> None:
    far80 = Raster.open(FAR_FILES["far80"][1])
    t = far80.transform
    res = t.a
    c0 = int(round((-HALF_M - t.c) / res))
    r0 = int(round((t.f - HALF_M) / res))
    n = int(round(2 * HALF_M / res))
    z = far80.data[r0:r0 + n, c0:c0 + n].astype(np.float64)
    z = np.where(np.isnan(z), np.nanmean(z), z)
    # Image rows run from +Y (top, toward 0 deg longitude) to -Y, matching the GeoTIFF row order.
    shade = hillshade(z, res)
    shade = 0.15 + 0.85 * shade ** 0.9
    rgb = (DARK + (LIGHT - DARK) * shade[..., None]).astype(np.uint8)
    img = Image.fromarray(rgb, "RGB").resize((SIZE_PX, SIZE_PX), Image.LANCZOS)
    out = WEB_DATA_DIR / "basemap-south.webp"
    img.save(out, "WEBP", quality=78, method=6)
    meta = {
        "description": "Hillshade of LOLA heights (PGDA LDEM_80S_80MPP_ADJ), south polar stereographic",
        "proj": "+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +R=1737400 +units=m",
        "extent_m": [-HALF_M, -HALF_M, HALF_M, HALF_M],
        "width": SIZE_PX, "height": SIZE_PX,
        "up": "+Y, toward 0 deg longitude (the Earth-facing meridian)",
        "light": "from the upper left, 35 deg altitude, 2x vertical exaggeration",
    }
    (WEB_DATA_DIR / "basemap-south.json").write_text(json.dumps(meta, indent=2) + "\n", newline="\n")
    print(f"wrote {out.name}: {out.stat().st_size / 1e3:.0f} kB")


if __name__ == "__main__":
    main()
