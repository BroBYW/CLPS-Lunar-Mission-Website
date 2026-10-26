"""Horizon masks for taller masts, for the mast planner (web/public/data/horizons-mast.bin/.json).

The same ray casting as horizon.py (scripts/horizon.py writes the 2 m and 10 m masks every view uses), for more
observer heights. The masks are stored as int16 hundredths of a degree, [site][height][azimuth], to halve the file;
the app loads them only when the mast planner opens. Run after horizon.py.
"""

import datetime as dt
import json

import numpy as np

from clps.dem import stack_for
from clps.horizon import AZ_STEP_DEG, N_AZ, horizon_mask
from clps.paths import WEB_DATA_DIR
from clps.sites import load_resolved_sites

HEIGHTS_M = (2.0, 5.0, 10.0, 20.0, 30.0, 50.0)
MAX_KM = 300.0
UNIT_DEG = 0.01


def main() -> None:
    sites = json.loads((WEB_DATA_DIR / "sites.json").read_text(encoding="utf-8"))["sites"]
    resolved = {s["id"]: s for s in load_resolved_sites()}
    masks = np.empty((len(sites), len(HEIGHTS_M), N_AZ))
    for s in sites:
        r = resolved[s["id"]]
        stack = stack_for(r["lat"], r["lon"])
        masks[s["mask_index"]] = horizon_mask(stack, r["lat"], r["lon"], s["height_m"], HEIGHTS_M, MAX_KM)
        sun_side = ", ".join(f"{h:g} m: {masks[s['mask_index'], k].max():5.2f}" for k, h in enumerate(HEIGHTS_M))
        print(f"{s['id']:22s} highest horizon {sun_side} deg", flush=True)
    q = np.round(masks / UNIT_DEG)
    if np.abs(q).max() > 32767:
        raise ValueError("horizon out of int16 range")
    q.astype("<i2").tofile(WEB_DATA_DIR / "horizons-mast.bin")
    meta = {
        "description": "Terrain horizon elevation per site, observer height and azimuth bin, for the mast planner",
        "format": "int16 little-endian hundredths of a degree, [site][height][azimuth]",
        "unit_deg": UNIT_DEG, "az_step_deg": AZ_STEP_DEG, "az_count": N_AZ, "heights_m": list(HEIGHTS_M),
        "sites": [s["id"] for s in sorted(sites, key=lambda s: s["mask_index"])],
        "ray_length_km": MAX_KM,
        "generated_utc": dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    (WEB_DATA_DIR / "horizons-mast.json").write_text(json.dumps(meta, indent=2) + "\n", newline="\n")
    print(f"wrote horizons-mast.bin ({(WEB_DATA_DIR / 'horizons-mast.bin').stat().st_size / 1e3:.0f} kB)")


if __name__ == "__main__":
    main()
