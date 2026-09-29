"""Python vs JPL Horizons: 3 sites x 5 dates x Sun and Earth (PLAN.md §12, item 2).

Writes pipeline/validation/horizons_comparison.csv and prints a Markdown table for VALIDATION.md.
Three Python methods are compared with Horizons:
  spice   - spkpos LT+S from the Moon's center, minus the site vector (the pipeline method)
  azlcpo  - SPICE azlcpo, light time and aberration computed from the site itself
  browser - the shipped hourly float32 ephemeris, linearly interpolated (what the web app does)
"""

import csv

import numpy as np
import spiceypy as sp

from clps.ephem import Ephemeris, body_vectors, ms_since_epoch, utc_to_et
from clps.geometry import azel, site_vector
from clps.horizons import moon_azel
from clps.kernels import load_kernels
from clps.paths import VALIDATION_DIR

SITES = [
    ("Connecting ridge", -89.4398, -137.17),
    ("Malapert Massif", -85.98, -1.67),
    ("Nobile Rim 2", -83.9, 58.7),
]
TIMES = ["2026-03-03T11:30:00", "2027-06-21T00:00:00", "2028-10-05T06:45:00", "2029-12-20T22:15:00", "2030-08-14T13:05:00"]


def wrap(d: np.ndarray) -> np.ndarray:
    return (d + 180.0) % 360.0 - 180.0


def main() -> None:
    load_kernels()
    eph = Ephemeris.load()
    times = np.array(TIMES, dtype="datetime64[s]")
    ets = utc_to_et(times)
    t_ms = ms_since_epoch(times)
    rows = []
    for name, lat, lon in SITES:
        s = site_vector(lat, lon, 0.0)
        sun_i, earth_i = eph.sample(t_ms)
        for body, target, interp in (("sun", "SUN", sun_i), ("earth", "EARTH", earth_i)):
            h = moon_azel(body, lon, lat, 0.0, [t.replace("T", " ") for t in TIMES])
            az_s, el_s = azel(body_vectors(ets, target) - s, lat, lon)
            az_b, el_b = azel(interp - s, lat, lon)
            for i, et in enumerate(ets):
                azl, _ = sp.azlcpo("ELLIPSOID", target, et, "LT+S", False, True, s, "MOON", "MOON_ME")
                az_l, el_l = np.degrees(azl[1]) % 360.0, np.degrees(azl[2])
                _, h_az, h_el = h[i]
                rows.append({
                    "site": name, "lat": lat, "lon": lon, "utc": TIMES[i] + "Z", "body": body,
                    "horizons_az": h_az, "horizons_el": h_el,
                    "spice_az": float(az_s[i]), "spice_el": float(el_s[i]),
                    "azlcpo_az": float(az_l), "azlcpo_el": float(el_l),
                    "browser_az": float(az_b[i]), "browser_el": float(el_b[i]),
                })

    out = VALIDATION_DIR / "horizons_comparison.csv"
    with open(out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        for r in rows:
            w.writerow({k: (f"{v:.9f}" if isinstance(v, float) else v) for k, v in r.items()})
    print(f"wrote {out} ({len(rows)} rows)\n")

    def delta(method: str, q: str) -> np.ndarray:
        a = np.array([r[f"{method}_{q}"] for r in rows])
        b = np.array([r[f"horizons_{q}"] for r in rows])
        return np.abs(wrap(a - b)) if q == "az" else np.abs(a - b)

    print("| Method | Max abs Δaz | Max abs Δel |")
    print("|---|---|---|")
    for m in ("spice", "azlcpo", "browser"):
        print(f"| {m} | {delta(m, 'az').max():.2e}° | {delta(m, 'el').max():.2e}° |")
    print()
    print("| Site | UTC | Body | Horizons az / el (°) | Pipeline Δaz / Δel (°) | Browser Δaz / Δel (°) |")
    print("|---|---|---|---|---|---|")
    for r in rows:
        d_s = (wrap(r["spice_az"] - r["horizons_az"]), r["spice_el"] - r["horizons_el"])
        d_b = (wrap(r["browser_az"] - r["horizons_az"]), r["browser_el"] - r["horizons_el"])
        print(f"| {r['site']} | {r['utc'][:16].replace('T', ' ')} | {r['body'].capitalize()} | "
              f"{r['horizons_az']:.4f} / {r['horizons_el']:.4f} | "
              f"{d_s[0]:+.1e} / {d_s[1]:+.1e} | {d_b[0]:+.1e} / {d_b[1]:+.1e} |")


if __name__ == "__main__":
    main()
