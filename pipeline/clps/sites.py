"""Site list: the declared anchors in sites.yaml, resolved to the points actually used (PLAN.md §7)."""

import json

import numpy as np
import yaml
from matplotlib.path import Path as PolyPath

from .geometry import polar_stereo, polar_stereo_inverse
from .paths import PIPELINE_DIR, RAW_DIR

RESOLVED_JSON = PIPELINE_DIR / "sites_resolved.json"
FOOTPRINTS_GEOJSON = RAW_DIR / "artemis_regions_trek.geojson"


def load_sites() -> list[dict]:
    return yaml.safe_load((PIPELINE_DIR / "sites.yaml").read_text(encoding="utf-8"))["sites"]


def load_validation_points() -> tuple[dict, list[dict]]:
    doc = yaml.safe_load((PIPELINE_DIR / "validation_points.yaml").read_text(encoding="utf-8"))
    return doc["studies"], doc["points"]


def load_resolved_sites() -> list[dict]:
    """Sites after scripts/sites.py has resolved them; falls back to the declared anchors."""
    if RESOLVED_JSON.exists():
        return json.loads(RESOLVED_JSON.read_text(encoding="utf-8"))["sites"]
    return load_sites()


def footprint_ring(label: str) -> np.ndarray:
    """(N, 2) lon/lat ring of a region footprint from the Moon Trek GeoJSON."""
    doc = json.loads(FOOTPRINTS_GEOJSON.read_text(encoding="utf-8"))
    for f in doc["features"]:
        if f["properties"]["label"] == label:
            return np.array(f["geometry"]["coordinates"][0], dtype=float)
    raise KeyError(f"footprint {label!r} not in {FOOTPRINTS_GEOJSON.name}")


def extreme_point(stack, xx: np.ndarray, yy: np.ndarray, inside: np.ndarray, highest: bool) -> tuple[float, float, float]:
    h = stack.sample(xx.ravel(), yy.ravel()).reshape(xx.shape)
    h = np.where(inside & ~np.isnan(h), h, -np.inf if highest else np.inf)
    i = np.unravel_index(np.argmax(h) if highest else np.argmin(h), h.shape)
    lat, lon = polar_stereo_inverse(np.array(xx[i]), np.array(yy[i]))
    return round(float(lat), 5), round(float(lon), 5), float(h[i])


def highest_in_footprint(stack, ring_lonlat: np.ndarray, step_m: float = 10.0) -> tuple[float, float, float]:
    x, y = polar_stereo(ring_lonlat[:, 1], ring_lonlat[:, 0])
    gx = np.arange(x.min(), x.max() + step_m, step_m)
    gy = np.arange(y.min(), y.max() + step_m, step_m)
    xx, yy = np.meshgrid(gx, gy)
    inside = PolyPath(np.column_stack([x, y])).contains_points(np.column_stack([xx.ravel(), yy.ravel()])).reshape(xx.shape)
    return extreme_point(stack, xx, yy, inside, highest=True)


def extreme_within(stack, lat: float, lon: float, radius_km: float, highest: bool, step_m: float = 10.0) -> tuple[float, float, float]:
    x0, y0 = (float(v) for v in polar_stereo(np.array(lat), np.array(lon)))
    g = np.arange(-radius_km * 1000, radius_km * 1000 + 1, step_m)
    xx, yy = np.meshgrid(x0 + g, y0 + g)
    inside = np.hypot(xx - x0, yy - y0) <= radius_km * 1000
    return extreme_point(stack, xx, yy, inside, highest=highest)
