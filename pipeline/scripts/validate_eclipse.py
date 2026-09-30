"""Eclipse check (VALIDATION.md §5): sunlight at sites during the 3 Mar 2026 total lunar eclipse, minute by minute.

From the Moon, a lunar eclipse is Earth passing in front of the Sun. NASA's contact times (UT, Espenak,
https://eclipse.gsfc.nasa.gov/OH/OH2026.html): P1 08:44, U1 09:50, U2 11:04, greatest 11:34, U3 12:03,
U4 13:17, P4 14:23. A site should start dimming after P1, lose the whole Sun around U2 to U3, and recover
before P4. Our model uses Earth's solid disk; NASA enlarges the shadow for the atmosphere, so small
offsets of a minute or two are expected.
"""

import json

import numpy as np

from clps.ephem import body_vectors, ms_since_epoch, utc_to_et
from clps.geometry import R_EARTH_KM, R_SUN_KM, angular_radius_deg, azel, site_vector
from clps.kernels import load_kernels
from clps.paths import VALIDATION_DIR, WEB_DATA_DIR
from clps.visibility import sun_fraction

NASA = {"P1": "08:44", "U1": "09:50", "U2": "11:04", "Greatest": "11:34", "U3": "12:03", "U4": "13:17", "P4": "14:23"}
SITES = ["malapert-massif", "nobile-rim-2", "mons-mouton"]


def main() -> None:
    load_kernels()
    meta = json.loads((WEB_DATA_DIR / "horizons.json").read_text())
    sites = {s["id"]: s for s in json.loads((WEB_DATA_DIR / "sites.json").read_text(encoding="utf-8"))["sites"]}
    masks = np.fromfile(WEB_DATA_DIR / "horizons.bin", dtype="<f4").astype(float).reshape(len(meta["sites"]), 2, -1)
    times = np.arange(np.datetime64("2026-03-03T08:00"), np.datetime64("2026-03-03T15:01"), np.timedelta64(1, "m"))
    ets = utc_to_et(times.astype("datetime64[s]"))
    sun, earth = body_vectors(ets, "SUN"), body_vectors(ets, "EARTH")
    hhmm = lambda i: str(times[i])[11:16]
    print("| Site | Sun above terrain | Dimming starts | Sun fully hidden | Sun back | Dimming ends |")
    print("|---|---|---|---|---|---|")
    for sid in SITES:
        s = sites[sid]
        mask = masks[s["mask_index"], 0]
        v = site_vector(s["lat"], s["lon"], s["height_m"] + 2.0)
        st, et = sun - v, earth - v
        s_az, s_el = azel(st, s["lat"], s["lon"])
        e_az, e_el = azel(et, s["lat"], s["lon"])
        s_r = angular_radius_deg(R_SUN_KM, np.linalg.norm(st, axis=1))
        e_r = angular_radius_deg(R_EARTH_KM, np.linalg.norm(et, axis=1))
        terrain = sun_fraction(mask, s_az, s_el, s_r)
        both = sun_fraction(mask, s_az, s_el, s_r, e_az, e_el, e_r)
        dim = np.flatnonzero(both < terrain - 1e-9)
        dark = np.flatnonzero((both <= 0) & (terrain > 0))
        lit = "yes" if terrain.min() >= 1 - 1e-6 else f"{terrain.min() * 100:.0f}-100%"
        row = [s["name"], lit, hhmm(dim[0]), hhmm(dark[0]) if len(dark) else "never",
               hhmm(dark[-1] + 1) if len(dark) else "never", hhmm(dim[-1] + 1)]
        print("| " + " | ".join(row) + " |")
    print("\nNASA contacts (UT): " + ", ".join(f"{k} {v}" for k, v in NASA.items()))


if __name__ == "__main__":
    main()
