"""Write web/public/data/ephemeris.bin (+ .json): hourly Sun and Earth vectors seen from the Moon, 2026-2030."""

import datetime as dt
import json

import numpy as np
import spiceypy as sp

from clps.ephem import (
    ABCORR, END_UTC, EPHEMERIS_BIN, EPHEMERIS_JSON, FRAME, OBSERVER, START_UTC, STEP_S,
    body_vectors, utc_grid, utc_to_et,
)
from clps.kernels import kernel_names, load_kernels


def main() -> None:
    load_kernels()
    times = utc_grid()
    ets = utc_to_et(times)
    sun = body_vectors(ets, "SUN")
    earth = body_vectors(ets, "EARTH")
    data = np.concatenate([sun, earth], axis=1).astype("<f4")

    EPHEMERIS_BIN.parent.mkdir(parents=True, exist_ok=True)
    data.tofile(EPHEMERIS_BIN)
    meta = {
        "description": "Moon-centered apparent positions of the Sun and Earth, hourly on the UTC grid",
        "format": "float32 little-endian, row-major (count x 6)",
        "columns": ["sun_x", "sun_y", "sun_z", "earth_x", "earth_y", "earth_z"],
        "units": "km",
        "frame": FRAME,
        "abcorr": ABCORR,
        "observer": OBSERVER,
        "t0_utc": START_UTC + "Z",
        "t_end_utc": END_UTC + "Z",
        "step_s": STEP_S,
        "count": int(data.shape[0]),
        "kernels": kernel_names(),
        "toolkit": sp.tkvrsn("TOOLKIT"),
        "generated_utc": dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    EPHEMERIS_JSON.write_text(json.dumps(meta, indent=2) + "\n")

    # Float32 rounding check against the float64 source
    err_sun = np.max(np.linalg.norm(data[:, 0:3] - sun, axis=1) / np.linalg.norm(sun, axis=1))
    err_earth = np.max(np.linalg.norm(data[:, 3:6] - earth, axis=1) / np.linalg.norm(earth, axis=1))
    print(f"wrote {EPHEMERIS_BIN.name}: {data.shape[0]} samples, {EPHEMERIS_BIN.stat().st_size / 1e6:.2f} MB")
    print(f"float32 direction error: Sun {np.degrees(err_sun) * 3600:.4f} arcsec, "
          f"Earth {np.degrees(err_earth) * 3600:.4f} arcsec")
    dist_sun = np.linalg.norm(sun, axis=1)
    dist_earth = np.linalg.norm(earth, axis=1)
    print(f"Sun distance {dist_sun.min() / 1.495978707e8:.4f}-{dist_sun.max() / 1.495978707e8:.4f} AU, "
          f"Earth distance {dist_earth.min():.0f}-{dist_earth.max():.0f} km")


if __name__ == "__main__":
    main()
