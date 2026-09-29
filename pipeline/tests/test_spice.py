"""SPICE smoke test against a JPL Horizons result fetched on 2026-09-29.

Horizons query: CENTER='coord@301', COORD_TYPE='GEODETIC', SITE_COORD='0,-89.9,0',
2026-01-01 00:00 UTC, QUANTITIES='4', EXTRA_PREC='YES'.
"""

import numpy as np
import pytest
import spiceypy as sp

from clps.geometry import azel, site_vector
from clps.kernels import kernel_path, KERNELS, load_kernels

pytestmark = pytest.mark.skipif(
    not all(kernel_path(rel).exists() for rel, _ in KERNELS), reason="kernels not downloaded"
)

HORIZONS = {
    "SUN": (32.520768768, 1.430067207),
    "EARTH": (358.720937772, 6.382390169),
}


@pytest.fixture(scope="module", autouse=True)
def kernels():
    load_kernels()
    yield
    sp.kclear()


def test_moon_me_alias_resolves():
    assert sp.namfrm("MOON_ME") == 31001
    # MOON_ME is a fixed offset from the DE440 principal-axis frame: about 0.0289 deg
    rot = sp.pxform("MOON_PA", "MOON_ME", sp.str2et("2026-01-01T00:00:00"))
    angle = np.degrees(np.arccos((np.trace(rot) - 1.0) / 2.0))
    assert 0.02 < angle < 0.04


@pytest.mark.parametrize("target", ["SUN", "EARTH"])
def test_matches_horizons(target):
    et = sp.str2et("2026-01-01T00:00:00")  # ISO "T" format is UTC
    pos, _ = sp.spkpos(target, et, "MOON_ME", "LT+S", "MOON")
    az, el = azel(np.asarray(pos) - site_vector(-89.9, 0.0), -89.9, 0.0)
    h_az, h_el = HORIZONS[target]
    assert abs(float(el) - h_el) < 1e-3
    assert abs((float(az) - h_az + 180) % 360 - 180) < 1e-3
