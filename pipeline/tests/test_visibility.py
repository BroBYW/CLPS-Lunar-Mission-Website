import numpy as np

from clps.horizon import N_AZ
from clps.visibility import earth_visible, horizon_at, longest_run, metrics, runs, sun_fraction


def segment_fraction(d: float, r: float) -> float:
    """Exact visible fraction of a disk whose center is d above a flat horizon."""
    if d >= r:
        return 1.0
    if d <= -r:
        return 0.0
    hidden = r * r * np.arccos(d / r) - d * np.sqrt(r * r - d * d)
    return 1.0 - hidden / (np.pi * r * r)


def test_flat_horizon_matches_circular_segment():
    mask = np.full(N_AZ, 0.5)
    r = 0.2666
    for d in np.linspace(-0.3, 0.3, 25):
        f = sun_fraction(mask, np.array([123.4]), np.array([0.5 + d]), np.array([r]))[0]
        assert abs(f - segment_fraction(d, r)) < 3e-3, (d, f)


def test_horizon_interpolation_wraps_north():
    mask = np.zeros(N_AZ)
    mask[0], mask[N_AZ - 1] = 2.0, 1.0
    assert np.isclose(horizon_at(mask, np.array([359.95]))[0], 1.5)
    assert np.isclose(horizon_at(mask, np.array([0.0]))[0], 2.0)


def test_earth_covering_the_sun():
    mask = np.full(N_AZ, -5.0)
    sun = dict(az=np.array([10.0]), el=np.array([3.0]), radius=np.array([0.2666]))
    full = sun_fraction(mask, **sun, earth_az=np.array([10.1]), earth_el=np.array([3.2]), earth_radius=np.array([0.95]))
    none = sun_fraction(mask, **sun, earth_az=np.array([14.0]), earth_el=np.array([3.0]), earth_radius=np.array([0.95]))
    assert full[0] == 0.0
    assert np.isclose(none[0], 1.0)
    # Earth centered on the Sun's upper edge covers roughly half of it
    half = sun_fraction(mask, **sun, earth_az=np.array([10.0]), earth_el=np.array([3.0 + 0.95]), earth_radius=np.array([0.95]))
    assert 0.4 < half[0] < 0.6


def test_runs_and_metrics():
    flags = np.array([1, 1, 0, 0, 0, 1, 0, 1, 1], bool)
    assert runs(flags) == [(0, 2), (5, 6), (7, 9)]
    assert longest_run(~flags) == (3, False)
    assert longest_run(flags) == (2, True)
    f_sun = np.array([1, 1, 0.5, 0, 0, 0, 1, 1], float)
    earth = np.array([1, 0, 0, 1, 1, 1, 1, 0], bool)
    m = metrics(f_sun, earth, step_h=1.0)
    assert m["longest_dark_h"] == 3.0 and not m["longest_dark_at_edge"]
    assert m["longest_blackout_h"] == 2.0
    assert m["windows"] == 2 and m["longest_window_h"] == 1.0
    assert np.isclose(m["sun_mean_pct"], 4.5 / 8 * 100)
    assert earth_visible(np.zeros(N_AZ), np.array([5.0]), np.array([0.1]))[0]
