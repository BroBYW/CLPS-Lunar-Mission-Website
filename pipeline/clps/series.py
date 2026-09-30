"""Time series of Sun and Earth visibility for one site, computed the way the browser does it
(hourly float32 ephemeris, linear interpolation). Used for fixtures and validation."""

import numpy as np

from .ephem import Ephemeris
from .geometry import R_EARTH_KM, R_SUN_KM, angular_radius_deg, azel, site_vector
from .visibility import earth_visible, sun_fraction


def time_grid(start_ms: float, end_ms: float, step_ms: float) -> np.ndarray:
    """Samples at start + i * step for i in [0, n), n = floor((end - start) / step). Each covers [t, t + step)."""
    n = int(np.floor((end_ms - start_ms) / step_ms))
    return start_ms + np.arange(n) * step_ms


def site_series(
    eph: Ephemeris,
    lat: float,
    lon: float,
    height_m: float,
    mask: np.ndarray,
    t_ms: np.ndarray,
    earth_margin_deg: float = 0.0,
    chunk: int = 50_000,
) -> dict[str, np.ndarray]:
    s = site_vector(lat, lon, height_m)
    out: dict[str, list[np.ndarray]] = {}
    for a in range(0, len(t_ms), chunk):
        t = t_ms[a:a + chunk]
        sun, earth = eph.sample(t)
        sun_t, earth_t = sun - s, earth - s
        s_az, s_el = azel(sun_t, lat, lon)
        e_az, e_el = azel(earth_t, lat, lon)
        s_dist = np.linalg.norm(sun_t, axis=1)
        s_r = angular_radius_deg(R_SUN_KM, s_dist)
        e_r = angular_radius_deg(R_EARTH_KM, np.linalg.norm(earth_t, axis=1))
        part = {
            "sun_az": s_az, "sun_el": s_el, "sun_r": s_r, "sun_dist_km": s_dist,
            "earth_az": e_az, "earth_el": e_el, "earth_r": e_r,
            "f_sun": sun_fraction(mask, s_az, s_el, s_r, e_az, e_el, e_r),
            "earth_vis": earth_visible(mask, e_az, e_el, earth_margin_deg),
        }
        for k, v in part.items():
            out.setdefault(k, []).append(v)
    return {k: np.concatenate(v) for k, v in out.items()} | {"t_ms": t_ms}
