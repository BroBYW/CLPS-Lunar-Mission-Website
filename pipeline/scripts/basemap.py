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


CAP_LAT = -80.0  # the polar cap image covers 80 S to the pole
CAP_W, CAP_H = 4096, 1024  # longitude x latitude pixels: about 300 m per pixel in latitude
CAP_DARK = np.array([0x2B, 0x28, 0x24], float)
CAP_LIGHT = np.array([0xD2, 0xCB, 0xBF], float)


def polar_cap(far80: Raster) -> None:
    """The same hillshade reprojected to longitude/latitude, to drape over the 3D globe's pole.

    The global Moon Trek mosaic streaks near the pole; this layer replaces it poleward of 81 S and fades out
    between 81 S and 80 S so it blends into the mosaic.
    """
    from scipy.ndimage import map_coordinates

    from clps.geometry import polar_stereo

    z = far80.data[::2, ::2].astype(np.float64)  # 160 m is plenty for a ~300 m image
    z = np.where(np.isnan(z), np.nanmean(z), z)
    t = far80.transform
    res = t.a * 2
    shade = hillshade(z, res) ** 1.2
    lon = -180.0 + (np.arange(CAP_W) + 0.5) * 360.0 / CAP_W
    lat = CAP_LAT - (np.arange(CAP_H) + 0.5) * (90.0 + CAP_LAT) / CAP_H
    LON, LAT = np.meshgrid(lon, lat)
    x, y = polar_stereo(LAT, LON)
    col = (x - t.c) / res - 0.5
    row = (t.f - y) / res - 0.5
    s = map_coordinates(shade, [row.ravel(), col.ravel()], order=1, mode="nearest").reshape(LAT.shape)
    rgb = CAP_DARK + (CAP_LIGHT - CAP_DARK) * s[..., None]
    alpha = np.clip((CAP_LAT - LAT) / 1.0, 0, 1) * 255  # 0 at 80 S, opaque from 81 S
    img = Image.fromarray(np.dstack([rgb, alpha]).astype(np.uint8), "RGBA")
    out = WEB_DATA_DIR / "polar-cap-south.webp"
    img.save(out, "WEBP", quality=80, method=6)
    meta = {
        "description": "LOLA hillshade (PGDA LDEM_80S_80MPP_ADJ) in equirectangular longitude/latitude, for the 3D globe",
        "rectangle_deg": {"west": -180, "south": -90, "east": 180, "north": CAP_LAT},
        "width": CAP_W, "height": CAP_H,
        "fade": "alpha fades from opaque at 81 S to transparent at 80 S",
    }
    (WEB_DATA_DIR / "polar-cap-south.json").write_text(json.dumps(meta, indent=2) + "\n", newline="\n")
    print(f"wrote {out.name}: {out.stat().st_size / 1e3:.0f} kB")


def main() -> None:
    far80 = Raster.open(FAR_FILES["far80"][1])
    polar_cap(far80)
    t = far80.transform
    res = t.a
    c0 = int(round((-HALF_M - t.c) / res))
    r0 = int(round((t.f - HALF_M) / res))
    n = int(round(2 * HALF_M / res))
    z = far80.data[r0:r0 + n, c0:c0 + n].astype(np.float64)
    z = np.where(np.isnan(z), np.nanmean(z), z)
    # Image rows run from +Y (top, toward 0 deg longitude) to -Y, matching the GeoTIFF row order.
    # Keep the map quiet: flat ground renders near Regolith grey, only sunward slopes reach Dust.
    shade = hillshade(z, res) ** 1.7
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
