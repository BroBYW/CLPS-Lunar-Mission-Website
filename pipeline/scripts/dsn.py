"""Moon elevation at the three Deep Space Network complexes, hourly (web/public/data/dsn.bin/.json).

For the DSN contact planner: a site can talk to Earth directly when Earth is above its skyline and a DSN complex has
the Moon above its antenna limit. The Moon's apparent position from Earth's centre in the Earth-fixed IAU_EARTH frame
(DE440, light time and stellar aberration), seen from each complex on the WGS84 ellipsoid, elevation above the
geodetic horizon. Stored as int8 whole degrees, [hour][complex], on the same UTC grid as ephemeris.bin.
"""

import datetime as dt
import json

import numpy as np
import spiceypy as sp

from clps.ephem import END_UTC, START_UTC, STEP_S, utc_grid, utc_to_et
from clps.kernels import load_kernels
from clps.paths import WEB_DATA_DIR

# Complex locations: the 70 m antenna at each (DSS-14, DSS-63, DSS-43), geodetic degrees and km
COMPLEXES = (
    ("Goldstone", 35.4259, -116.8895, 1.00),
    ("Madrid", 40.4313, -4.2481, 0.86),
    ("Canberra", -35.4024, 148.9813, 0.69),
)
WGS84_RE_KM = 6378.137
WGS84_F = 1 / 298.257223563
LIMIT_DEG = 10


def main() -> None:
    load_kernels()
    times = utc_grid()
    ets = utc_to_et(times)
    moon, _ = sp.spkpos("MOON", ets, "IAU_EARTH", "LT+S", "EARTH")
    moon = np.asarray(moon)
    el = np.empty((len(times), len(COMPLEXES)))
    for k, (_, lat, lon, alt) in enumerate(COMPLEXES):
        la, lo = np.radians(lat), np.radians(lon)
        station = np.array(sp.georec(lo, la, alt, WGS84_RE_KM, WGS84_F))
        up = np.array([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)])
        topo = moon - station
        el[:, k] = np.degrees(np.arcsin(topo @ up / np.linalg.norm(topo, axis=1)))
    out = WEB_DATA_DIR / "dsn.bin"
    np.round(el).astype(np.int8).tofile(out)
    meta = {
        "description": "Elevation of the Moon's centre at each Deep Space Network complex, hourly on the UTC grid",
        "format": "int8 whole degrees, row-major (count x complexes)",
        "complexes": [{"name": n, "lat": la, "lon": lo, "alt_km": a} for n, la, lo, a in COMPLEXES],
        "limit_deg": LIMIT_DEG,
        "t0_utc": START_UTC + "Z",
        "t_end_utc": END_UTC + "Z",
        "step_s": STEP_S,
        "count": int(len(times)),
        "frame": "IAU_EARTH, WGS84 geodetic horizon",
        "generated_utc": dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    (WEB_DATA_DIR / "dsn.json").write_text(json.dumps(meta, indent=2) + "\n", newline="\n")
    up = el >= LIMIT_DEG
    print(f"wrote {out.name} ({out.stat().st_size / 1e3:.0f} kB); Moon above {LIMIT_DEG} deg: "
          + ", ".join(f"{n} {100 * up[:, k].mean():.1f}%" for k, (n, *_) in enumerate(COMPLEXES))
          + f"; at least one {100 * up.any(axis=1).mean():.1f}%")


if __name__ == "__main__":
    main()
