"""Export fixtures for the Vitest checks in web/src/lib (PLAN.md §12, item 1)."""

import datetime as dt
import json

import numpy as np
import spiceypy as sp

from clps.ephem import body_vectors, utc_to_et
from clps.geometry import R_EARTH_KM, R_SUN_KM, angular_radius_deg, azel, site_vector
from clps.kernels import load_kernels
from clps.paths import FIXTURE_DIR

# Three sites spread in longitude (PLAN.md §7); heights exercise the height parameter.
AZEL_SITES = [
    ("connecting-ridge", -89.4398, -137.17, 1900.0),
    ("malapert-massif", -85.98, -1.67, 4000.0),
    ("nobile-rim-2", -83.9, 58.7, 0.0),
]


def fixture_epochs(n_random: int = 21) -> np.ndarray:
    """Grid start and end, one exact hour, and random second-resolution epochs in between."""
    rng = np.random.default_rng(42)
    t0, t1 = np.datetime64("2026-01-01T00:00:00", "s"), np.datetime64("2031-01-01T00:00:00", "s")
    span = int((t1 - t0) / np.timedelta64(1, "s"))
    random = t0 + np.sort(rng.integers(0, span, n_random)) * np.timedelta64(1, "s")
    fixed = np.array(["2026-01-01T00:00:00", "2028-06-15T12:00:00", "2031-01-01T00:00:00"], dtype="datetime64[s]")
    return np.sort(np.concatenate([fixed, random]))


def azel_cases() -> list[dict]:
    times = fixture_epochs()
    ets = utc_to_et(times)
    sun = body_vectors(ets, "SUN")
    earth = body_vectors(ets, "EARTH")
    t_ms = times.astype("datetime64[ms]").astype(np.int64)
    cases = []
    for site_id, lat, lon, height in AZEL_SITES:
        s = site_vector(lat, lon, height)
        for body, vectors, radius in (("sun", sun, R_SUN_KM), ("earth", earth, R_EARTH_KM)):
            topo = vectors - s
            az, el = azel(topo, lat, lon)
            dist = np.linalg.norm(topo, axis=1)
            for i in range(len(times)):
                cases.append({
                    "site": site_id, "lat": lat, "lon": lon, "height_m": height,
                    "utc": str(times[i]) + "Z", "t_ms": int(t_ms[i]), "body": body,
                    "az": round(float(az[i]), 9), "el": round(float(el[i]), 9),
                    "dist_km": round(float(dist[i]), 3),
                    "radius_deg": round(float(angular_radius_deg(radius, dist[i])), 9),
                })
    return cases


def main() -> None:
    load_kernels()
    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    doc = {
        "description": "Exact SPICE az/el (spkpos LT+S at the epoch, minus the site vector). "
                       "The browser interpolates the hourly float32 ephemeris and must agree within 0.01 deg.",
        "generated_utc": dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "toolkit": sp.tkvrsn("TOOLKIT"),
        "cases": azel_cases(),
    }
    out = FIXTURE_DIR / "azel.json"
    out.write_text(json.dumps(doc, indent=1) + "\n")
    print(f"wrote {out.name}: {len(doc['cases'])} cases")


if __name__ == "__main__":
    main()
