import numpy as np

from clps.geometry import R_MOON_KM, azel, destination, polar_stereo, polar_stereo_inverse, site_vector


def test_zenith_and_cardinal_directions():
    lat, lon = -85.0, 30.0
    s = site_vector(lat, lon)
    up = s / np.linalg.norm(s)
    _, el = azel(up * 1e5, lat, lon)
    assert abs(float(el) - 90.0) < 1e-9
    # A point slightly toward the north pole along the meridian has azimuth 0
    lat2, lon2 = destination(lat, lon, np.array(0.0), np.array(10.0))
    az, _ = azel(site_vector(float(lat2), float(lon2)) - s, lat, lon)
    assert abs((float(az) + 180) % 360 - 180) < 1e-6
    # ...and toward the east, azimuth 90
    lat3, lon3 = destination(lat, lon, np.array(90.0), np.array(10.0))
    az3, _ = azel(site_vector(float(lat3), float(lon3)) - s, lat, lon)
    assert abs(float(az3) - 90.0) < 1e-3


def test_destination_distance():
    lat2, lon2 = destination(-89.0, 45.0, np.array(123.0), np.array(100.0))
    a, b = site_vector(-89.0, 45.0), site_vector(float(lat2), float(lon2))
    arc = R_MOON_KM * np.arccos(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))
    assert abs(arc - 100.0) < 1e-6


def test_polar_stereo_round_trip_and_scale():
    x, y = polar_stereo(np.array(-84.0), np.array(90.0))
    assert abs(float(y)) < 1e-6 and abs(float(x) - 182_128.0) < 50  # lon 90E lies on +X
    lat, lon = polar_stereo_inverse(np.array(1234.5), np.array(-98765.4))
    x2, y2 = polar_stereo(lat, lon)
    assert abs(float(x2) - 1234.5) < 1e-6 and abs(float(y2) + 98765.4) < 1e-6
