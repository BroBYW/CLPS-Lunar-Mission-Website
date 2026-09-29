"""Shared geometry. The browser (web/src/lib/astro.ts) implements the same definitions (PLAN.md §4.2)."""

import numpy as np

R_MOON_KM = 1737.4  # LOLA reference sphere and pck00011 BODY301_RADII
R_SUN_KM = 695_700.0  # IAU 2015 nominal solar radius
R_EARTH_KM = 6_378.137  # equatorial radius
AU_KM = 149_597_870.7
SOLAR_CONSTANT_W_M2 = 1361.0


def site_vector(lat_deg: float, lon_deg: float, height_m: float = 0.0) -> np.ndarray:
    """Moon-centered MOON_ME position (km) of a point height_m above the 1737.4 km sphere."""
    lat, lon = np.radians(lat_deg), np.radians(lon_deg)
    r = R_MOON_KM + height_m / 1000.0
    return r * np.array([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)])


def enu_basis(lat_deg: float, lon_deg: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Local east, north, up unit vectors in MOON_ME. North points toward the north pole."""
    lat, lon = np.radians(lat_deg), np.radians(lon_deg)
    east = np.array([-np.sin(lon), np.cos(lon), 0.0])
    north = np.array([-np.sin(lat) * np.cos(lon), -np.sin(lat) * np.sin(lon), np.cos(lat)])
    up = np.array([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)])
    return east, north, up


def azel(topo: np.ndarray, lat_deg: float, lon_deg: float) -> tuple[np.ndarray, np.ndarray]:
    """Azimuth (deg, clockwise from north, 0-360) and elevation (deg) of topocentric vectors (..., 3)."""
    east, north, up = enu_basis(lat_deg, lon_deg)
    ve, vn, vu = topo @ east, topo @ north, topo @ up
    el = np.degrees(np.arctan2(vu, np.hypot(ve, vn)))
    az = np.degrees(np.arctan2(ve, vn)) % 360.0
    return az, el


def angular_radius_deg(body_radius_km: float, distance_km: np.ndarray) -> np.ndarray:
    return np.degrees(np.arcsin(body_radius_km / distance_km))


def destination(lat_deg: float, lon_deg: float, az_deg: np.ndarray, dist_km: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Great-circle destination on the sphere: start point, initial azimuth, arc length. Returns degrees."""
    lat1, lon1 = np.radians(lat_deg), np.radians(lon_deg)
    az = np.radians(az_deg)
    delta = dist_km / R_MOON_KM
    sin_lat2 = np.sin(lat1) * np.cos(delta) + np.cos(lat1) * np.sin(delta) * np.cos(az)
    lat2 = np.arcsin(np.clip(sin_lat2, -1.0, 1.0))
    lon2 = lon1 + np.arctan2(np.sin(az) * np.sin(delta) * np.cos(lat1), np.cos(delta) - np.sin(lat1) * sin_lat2)
    return np.degrees(lat2), (np.degrees(lon2) + 180.0) % 360.0 - 180.0


def polar_stereo(lat_deg: np.ndarray, lon_deg: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """South polar stereographic on the 1737.4 km sphere, true scale at the pole (the LOLA DEM grid). Metres."""
    lat, lon = np.radians(lat_deg), np.radians(lon_deg)
    rho = 2.0 * R_MOON_KM * 1000.0 * np.tan(np.pi / 4.0 + lat / 2.0)
    return rho * np.sin(lon), rho * np.cos(lon)


def polar_stereo_inverse(x_m: np.ndarray, y_m: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    rho = np.hypot(x_m, y_m)
    lat = 2.0 * np.arctan(rho / (2.0 * R_MOON_KM * 1000.0)) - np.pi / 2.0
    lon = np.arctan2(x_m, y_m)
    return np.degrees(lat), np.degrees(lon)
