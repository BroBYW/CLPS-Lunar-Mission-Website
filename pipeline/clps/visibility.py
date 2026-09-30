"""Visible fraction of the Sun's disk, Earth visibility and run statistics (PLAN.md §4.4-4.5).

The browser implements the same algorithm in web/src/lib/visibility.ts and web/src/lib/metrics.ts;
fixtures exported from here keep the two in step.
"""

import numpy as np

from .horizon import AZ_STEP_DEG, N_AZ

N_STRIPS = 32


def horizon_at(mask: np.ndarray, az_deg: np.ndarray) -> np.ndarray:
    """Horizon elevation at arbitrary azimuths, linear between the 0.1 deg bins (bin k is centered on k * 0.1)."""
    x = np.mod(az_deg, 360.0) / AZ_STEP_DEG
    k = np.floor(x)
    w = x - k
    i0 = k.astype(np.int64) % N_AZ
    i1 = (i0 + 1) % N_AZ
    return mask[i0] * (1.0 - w) + mask[i1] * w


def az_diff(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    return np.mod(a - b + 180.0, 360.0) - 180.0


def sun_fraction(
    mask: np.ndarray,
    az: np.ndarray,
    el: np.ndarray,
    radius: np.ndarray,
    earth_az: np.ndarray | None = None,
    earth_el: np.ndarray | None = None,
    earth_radius: np.ndarray | None = None,
    n_strips: int = N_STRIPS,
) -> np.ndarray:
    """Visible fraction (0-1) of a disk above the terrain horizon, minus any part covered by Earth.

    All angles in degrees; arrays broadcast over time. The disk is cut into vertical strips in the local tangent
    plane; each strip's chord is compared with the horizon at the strip's azimuth (offsets scaled by 1/cos el).
    """
    az, el, radius = (np.atleast_1d(np.asarray(v, dtype=np.float64)) for v in (az, el, radius))
    m = (np.arange(n_strips) + 0.5) / n_strips * 2.0 - 1.0  # strip centers, units of the radius
    xs = m[None, :] * radius[:, None]
    half = radius[:, None] * np.sqrt(1.0 - m[None, :] ** 2)
    cos_el = np.cos(np.radians(el))[:, None]
    h = horizon_at(mask, az[:, None] + xs / cos_el)
    top = el[:, None] + half
    lo = np.maximum(el[:, None] - half, h)
    visible = np.clip(top - lo, 0.0, None)
    if earth_az is not None:
        ex = az_diff(np.atleast_1d(earth_az), az)[:, None] * cos_el
        ey = (np.atleast_1d(earth_el) - el)[:, None]
        er = np.atleast_1d(earth_radius)[:, None]
        dx = xs - ex
        inside = np.abs(dx) < er
        ce = np.sqrt(np.clip(er ** 2 - dx ** 2, 0.0, None))
        e_lo = el[:, None] + ey - ce
        e_hi = el[:, None] + ey + ce
        covered = np.clip(np.minimum(top, e_hi) - np.maximum(lo, e_lo), 0.0, None)
        visible = visible - np.where(inside, np.minimum(covered, visible), 0.0)
    return visible.sum(axis=1) / (2.0 * half).sum(axis=1)


def earth_visible(mask: np.ndarray, az: np.ndarray, el: np.ndarray, margin_deg: float = 0.0) -> np.ndarray:
    """Earth's center above the horizon at its azimuth plus a margin."""
    return np.asarray(el) > horizon_at(mask, np.asarray(az)) + margin_deg


def runs(flags: np.ndarray) -> list[tuple[int, int]]:
    """Maximal runs of True as (start, end_exclusive) index pairs."""
    f = np.concatenate([[False], np.asarray(flags, dtype=bool), [False]])
    d = np.diff(f.astype(np.int8))
    return list(zip(np.flatnonzero(d == 1).tolist(), np.flatnonzero(d == -1).tolist()))


def longest_run(flags: np.ndarray) -> tuple[int, bool]:
    """Length of the longest True run and whether it touches either end of the series."""
    best, touches = 0, False
    n = len(flags)
    for a, b in runs(flags):
        if b - a > best:
            best, touches = b - a, a == 0 or b == n
    return best, touches


def metrics(f_sun: np.ndarray, earth_vis: np.ndarray, step_h: float, dark_threshold: float = 0.0) -> dict:
    """The P0 metrics of PLAN.md §4.5 for one series."""
    dark = f_sun <= dark_threshold
    both = ~dark & earth_vis
    ld, ld_edge = longest_run(dark)
    lb, lb_edge = longest_run(~earth_vis)
    windows = runs(both)
    lw = max((b - a for a, b in windows), default=0)
    return {
        "sun_mean_pct": float(f_sun.mean() * 100),
        "sun_any_pct": float((f_sun > 0).mean() * 100),
        "sun_full_pct": float((f_sun >= 1.0 - 1e-6).mean() * 100),  # tolerance matches the browser's float32
        "longest_dark_h": ld * step_h, "longest_dark_at_edge": ld_edge,
        "earth_pct": float(earth_vis.mean() * 100),
        "longest_blackout_h": lb * step_h, "longest_blackout_at_edge": lb_edge,
        "both_pct": float(both.mean() * 100),
        "windows": len(windows), "longest_window_h": lw * step_h,
    }
