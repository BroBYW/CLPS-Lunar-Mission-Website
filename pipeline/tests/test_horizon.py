"""Horizon masks on synthetic terrain with known answers (VALIDATION.md §3)."""

import numpy as np
from rasterio.transform import from_origin

from clps.dem import DemStack, Raster
from clps.geometry import R_MOON_KM, polar_stereo
from clps.horizon import N_AZ, horizon_mask


def flat(half_km: float, res_m: float) -> Raster:
    n = int(2 * half_km * 1000 / res_m)
    return Raster(np.zeros((n, n), np.float32), from_origin(-half_km * 1000, half_km * 1000, res_m, res_m), "flat")


def test_smooth_sphere_dip():
    stack = DemStack([flat(400, 1000.0)])
    for h_obs in (2.0, 10.0):
        mask = horizon_mask(stack, -88.0, 45.0, 0.0, (h_obs,), max_km=300.0)[0]
        expected = -np.degrees(np.arccos(R_MOON_KM / (R_MOON_KM + h_obs / 1000.0)))
        assert mask.shape == (N_AZ,)
        assert np.allclose(mask, expected, atol=2e-4), (h_obs, mask.min(), mask.max(), expected)
    # PLAN.md numbers: 0.0869 deg at 2 m, 0.1944 deg at 10 m
    assert abs(np.degrees(np.arccos(R_MOON_KM / (R_MOON_KM + 0.002))) - 0.0869) < 1e-4
    assert abs(np.degrees(np.arccos(R_MOON_KM / (R_MOON_KM + 0.010))) - 0.1944) < 1e-4


def test_mesa_elevation_angle():
    # Site at 89 S, 0 E lies on the +Y axis. A 1000 m high mesa starts 20 km further out (azimuth 0, "north").
    res = 25.0
    fine = flat(60, res)
    x_site, y_site = (float(v) for v in polar_stereo(np.array(-89.0), np.array(0.0)))
    t = fine.transform
    cols = np.arange(fine.data.shape[1]) * res + t.c + res / 2
    rows = t.f - (np.arange(fine.data.shape[0]) * res + res / 2)
    xx, yy = np.meshgrid(cols, rows)
    d_start = 20_000.0
    fine.data[(np.abs(xx - x_site) < 3000) & (yy > y_site + d_start) & (yy < y_site + d_start + 5000)] = 1000.0
    stack = DemStack([fine, flat(400, 1000.0)])
    mask = horizon_mask(stack, -89.0, 0.0, 0.0, (2.0,), max_km=300.0)[0]
    delta = (d_start / 1000.0) / R_MOON_KM
    r_t, r_o = R_MOON_KM + 1.0, R_MOON_KM + 0.002
    expected = np.degrees(np.arctan2(r_t * np.cos(delta) - r_o, r_t * np.sin(delta)))
    assert abs(mask[0] - expected) < 0.02, (mask[0], expected)
    # Well away from the mesa the horizon is the smooth-sphere dip
    assert abs(mask[1800] + 0.0869) < 1e-3
