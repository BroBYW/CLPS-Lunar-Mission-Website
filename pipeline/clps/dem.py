"""LOLA elevation maps (PGDA, Barker et al. 2023). Heights are metres above the 1737.4 km sphere.

Four tiers, finest first (PLAN.md §4.3):
  near10  10 m window, +-20 km around each point  (LDEM_83S_10MPP_ADJ, read over HTTP, never downloaded whole)
  mid20   20 m window, +-60 km around each point  (LDEM_80S_20MPP_ADJ, read over HTTP)
  far80   80 m, +-304 km from the pole            (LDEM_80S_80MPP_ADJ, downloaded whole)
  far240  240 m, +-931.2 km from the pole         (LDEM_60S_240MPP_ADJ, downloaded whole)
"""

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import Affine
from rasterio.windows import from_bounds
from scipy.ndimage import map_coordinates

from .paths import RAW_DIR, USER_AGENT

PGDA_20MPP = "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/"
PGDA_10M_URL = PGDA_20MPP + "LDEM_83S_10MPP_ADJ.TIF"
PGDA_20M_URL = PGDA_20MPP + "LDEM_80S_20MPP_ADJ.TIF"
PGDA_80M_URL = PGDA_20MPP + "LDEM_80S_80MPP_ADJ.TIF"
PGDA_240M_URL = PGDA_20MPP + "LDEM_60S_240MPP_ADJ.TIF"

FAR_FILES = {
    "far80": (PGDA_80M_URL, RAW_DIR / "LDEM_80S_80MPP_ADJ.TIF"),
    "far240": (PGDA_240M_URL, RAW_DIR / "LDEM_60S_240MPP_ADJ.TIF"),
}
WINDOW_TIERS = {
    # name: (url, half-size of the window around each point in metres, resolution in metres)
    "near10": (PGDA_10M_URL, 20_000.0, 10.0),
    "mid20": (PGDA_20M_URL, 60_000.0, 20.0),
}
WINDOW_DIR = RAW_DIR / "windows"

GDAL_HTTP_ENV = {
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
    "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".TIF,.tif",
    "GDAL_HTTP_USERAGENT": USER_AGENT,
    "GDAL_HTTP_MAX_RETRY": "5",
    "GDAL_HTTP_RETRY_DELAY": "2",
    "GDAL_HTTP_MERGE_CONSECUTIVE_RANGES": "YES",
    "GDAL_HTTP_MULTIPLEX": "YES",
    "GDAL_NUM_THREADS": "ALL_CPUS",
    "VSI_CACHE": "TRUE",
    "VSI_CACHE_SIZE": str(512 * 1024 * 1024),
}

Box = tuple[float, float, float, float]  # xmin, ymin, xmax, ymax (polar stereographic metres)


def _area(b: Box) -> float:
    return max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])


def _union(a: Box, b: Box) -> Box:
    return (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))


def merge_boxes(boxes: list[Box]) -> list[Box]:
    """Greedily merge boxes while the union costs no more area than the two boxes read separately."""
    boxes = list(boxes)
    while True:
        best = None
        for i in range(len(boxes)):
            for j in range(i + 1, len(boxes)):
                waste = _area(_union(boxes[i], boxes[j])) - _area(boxes[i]) - _area(boxes[j])
                if waste <= 0 and (best is None or waste < best[0]):
                    best = (waste, i, j)
        if best is None:
            return boxes
        _, i, j = best
        merged = _union(boxes[i], boxes[j])
        boxes = [b for k, b in enumerate(boxes) if k not in (i, j)] + [merged]


def snap_box(b: Box, res: float, limit: float) -> Box:
    """Align to the pixel grid (grids are centered on the pole) and clip to +-limit."""
    lo = lambda v: max(-limit, np.floor(v / res) * res)
    hi = lambda v: min(limit, np.ceil(v / res) * res)
    return (lo(b[0]), lo(b[1]), hi(b[2]), hi(b[3]))


def window_path(tier: str, box: Box) -> Path:
    x0, y0, x1, y1 = (int(round(v / 1000)) for v in box)
    return WINDOW_DIR / f"{tier}_{x0}_{y0}_{x1}_{y1}.tif"


def fetch_window(url: str, box: Box, dest: Path) -> Path:
    """Read box from a remote COG (HTTP range requests) and save it as a compressed local GeoTIFF."""
    if dest.exists():
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.Env(**GDAL_HTTP_ENV), rasterio.open("/vsicurl/" + url) as src:
        win = from_bounds(*box, transform=src.transform).round_offsets().round_lengths()
        data = src.read(1, window=win)
        profile = {
            "driver": "GTiff", "dtype": "float32", "count": 1, "crs": src.crs, "nodata": np.nan,
            "width": data.shape[1], "height": data.shape[0], "transform": src.window_transform(win),
            "compress": "deflate", "predictor": 3, "tiled": True, "blockxsize": 512, "blockysize": 512,
        }
    part = dest.with_suffix(".part.tif")
    with rasterio.open(part, "w", **profile) as dst:
        dst.write(data, 1)
    part.replace(dest)
    return dest


@dataclass
class Raster:
    """An in-memory elevation grid with bilinear sampling in polar stereographic metres."""

    data: np.ndarray
    transform: Affine
    name: str

    @classmethod
    def open(cls, path: Path, name: str | None = None) -> "Raster":
        with rasterio.open(path) as src:
            return cls(src.read(1).astype(np.float32), src.transform, name or path.stem)

    @property
    def bounds(self) -> Box:
        t = self.transform
        h, w = self.data.shape
        return (t.c, t.f + t.e * h, t.c + t.a * w, t.f)

    @property
    def res(self) -> float:
        return self.transform.a

    def contains(self, x: np.ndarray, y: np.ndarray, margin_px: float = 1.0) -> np.ndarray:
        b = self.bounds
        m = margin_px * self.res
        return (x >= b[0] + m) & (x <= b[2] - m) & (y >= b[1] + m) & (y <= b[3] - m)

    def sample(self, x: np.ndarray, y: np.ndarray) -> np.ndarray:
        t = self.transform
        col = (x - t.c) / t.a - 0.5
        row = (y - t.f) / t.e - 0.5
        return map_coordinates(self.data, [row, col], order=1, mode="constant", cval=np.nan, prefilter=False)


class DemStack:
    """Samples the finest raster that covers each point; NaN gaps fall through to coarser rasters."""

    def __init__(self, rasters: list[Raster]):
        self.rasters = sorted(rasters, key=lambda r: r.res)

    def sample(self, x: np.ndarray, y: np.ndarray) -> np.ndarray:
        out = np.full(x.shape, np.nan, dtype=np.float64)
        for r in self.rasters:
            todo = np.isnan(out)
            if not todo.any():
                break
            inside = todo & r.contains(x, y)
            if inside.any():
                out[inside] = r.sample(x[inside], y[inside])
        return out
