"""Terrain horizon masks by ray casting on the sphere (PLAN.md §4.3)."""

import numpy as np

from .dem import DemStack
from .geometry import R_MOON_KM, destination, polar_stereo

AZ_STEP_DEG = 0.1
N_AZ = int(round(360 / AZ_STEP_DEG))


def ray_distances_km(max_km: float = 300.0) -> np.ndarray:
    """10 m steps to 20 km, 20 m steps to 60 km, 80 m steps beyond (matching the DEM tiers)."""
    near = np.arange(0.01, 20.0, 0.01)
    mid = np.arange(20.0, 60.0, 0.02)
    far = np.arange(60.0, max_km + 1e-9, 0.08)
    return np.concatenate([near, mid, far])


class CoverageError(RuntimeError):
    pass


def horizon_mask(
    stack: DemStack,
    lat: float,
    lon: float,
    site_height_m: float,
    observer_heights_m: tuple[float, ...] = (2.0, 10.0),
    max_km: float = 300.0,
    batch: int = 180,
) -> np.ndarray:
    """Horizon elevation (deg) per azimuth bin, shape (len(observer_heights_m), N_AZ).

    Azimuth bin k is centered on k * 0.1 deg, clockwise from north. Each terrain sample's elevation angle is
    atan2((R + h_t) cos(d/R) - (R + h_site + h_obs), (R + h_t) sin(d/R)); the horizon is the maximum over the ray.
    """
    d = ray_distances_km(max_km)
    delta = d / R_MOON_KM
    cos_d, sin_d = np.cos(delta), np.sin(delta)
    r_obs = [R_MOON_KM + (site_height_m + h) / 1000.0 for h in observer_heights_m]
    out = np.empty((len(observer_heights_m), N_AZ))
    az_all = np.arange(N_AZ) * AZ_STEP_DEG
    for start in range(0, N_AZ, batch):
        az = az_all[start:start + batch]
        lat2, lon2 = destination(lat, lon, az[:, None], d[None, :])
        x, y = polar_stereo(lat2, lon2)
        h_t = stack.sample(x.ravel(), y.ravel()).reshape(x.shape)
        if np.isnan(h_t).any():
            i, j = np.argwhere(np.isnan(h_t))[0]
            raise CoverageError(f"no elevation data at azimuth {az[i]:.1f} deg, distance {d[j]:.2f} km")
        r_t = R_MOON_KM + h_t / 1000.0
        horiz = r_t * sin_d
        for k, ro in enumerate(r_obs):
            out[k, start:start + batch] = np.degrees(np.arctan2(r_t * cos_d - ro, horiz)).max(axis=1)
    return out
