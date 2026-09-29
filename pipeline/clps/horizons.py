"""Minimal JPL Horizons API client for topocentric az/el from a point on the Moon.

API usage rules (https://ssd-api.jpl.nasa.gov/): one request at a time, cache results, identify the client.
"""

import hashlib
import json
import time

import requests

from .paths import USER_AGENT, VALIDATION_DIR

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
CACHE_DIR = VALIDATION_DIR / "cache"
BODY_CODES = {"sun": "10", "earth": "399"}


def _quote(v: str) -> str:
    return f"'{v}'"


def moon_azel(body: str, lon_deg: float, lat_deg: float, alt_km: float, times_utc: list[str]) -> list[tuple[str, float, float]]:
    """Apparent (azimuth, elevation) in degrees of the Sun or Earth from a lunar surface point.

    times_utc: calendar strings like "2026-03-03 11:30:00". Returns (horizons_time, az, el) per epoch.
    """
    params = {
        "format": "json",
        "COMMAND": _quote(BODY_CODES[body]),
        "OBJ_DATA": _quote("NO"),
        "MAKE_EPHEM": _quote("YES"),
        "EPHEM_TYPE": _quote("OBSERVER"),
        "CENTER": _quote("coord@301"),
        "COORD_TYPE": _quote("GEODETIC"),
        "SITE_COORD": _quote(f"{lon_deg},{lat_deg},{alt_km}"),
        "TLIST": " ".join(_quote(t) for t in times_utc),
        "TLIST_TYPE": _quote("CAL"),
        "TIME_TYPE": _quote("UT"),
        "QUANTITIES": _quote("4"),
        "ANG_FORMAT": _quote("DEG"),
        "EXTRA_PREC": _quote("YES"),
        "CSV_FORMAT": _quote("YES"),
    }
    key = hashlib.sha1(json.dumps(params, sort_keys=True).encode()).hexdigest()[:16]
    cache = CACHE_DIR / f"{key}.json"
    if cache.exists():
        result = json.loads(cache.read_text())["result"]
    else:
        for attempt in range(4):
            r = requests.get(API, params=params, timeout=60, headers={"User-Agent": USER_AGENT})
            if r.status_code == 200:
                break
            time.sleep(2 ** attempt)
        r.raise_for_status()
        payload = r.json()
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(payload))
        result = payload["result"]
        time.sleep(1.0)  # be polite: sequential requests only
    return _parse(result)


def _parse(result: str) -> list[tuple[str, float, float]]:
    if "$$SOE" not in result:
        raise ValueError("Horizons returned no ephemeris:\n" + result[-2000:])
    block = result.split("$$SOE", 1)[1].split("$$EOE", 1)[0]
    rows = []
    for line in block.strip().splitlines():
        cols = [c.strip() for c in line.split(",")]
        # Date, solar-presence flag, lunar-presence flag, azimuth, elevation
        rows.append((cols[0], float(cols[3]), float(cols[4])))
    return rows
