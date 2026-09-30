"""Resolve sites.yaml anchors to the points used for horizons (PLAN.md §5 step 4). Writes sites_resolved.json.

Rules, applied in the order listed in sites.yaml:
  footprint: <label>          -> highest LOLA point inside that region footprint (NASA Moon Trek polygons)
  highest_within_km: <r>      -> highest LOLA point within r km of the anchor (regions without a footprint)
  snap_to_min_within_km: <r>  -> lowest LOLA point within r km of the anchor (crater floor)
  otherwise                   -> the anchor itself
Run scripts/fetch_dems.py afterwards so the resolved points get full 10 m coverage.
"""

import datetime as dt
import json

import numpy as np

from clps.dem import stack_for
from clps.geometry import polar_stereo
from clps.sites import RESOLVED_JSON, extreme_within, footprint_ring, highest_in_footprint, load_sites


def main() -> None:
    out = []
    for s in load_sites():
        r = {k: v for k, v in s.items() if k not in ("snap_to_min_within_km", "highest_within_km")}
        r["anchor"] = {"lat": s["lat"], "lon": s["lon"]}
        stack = stack_for(s["lat"], s["lon"])
        if "footprint" in s:
            ring = footprint_ring(s["footprint"])
            r["lat"], r["lon"], h = highest_in_footprint(stack, ring)
            r["footprint_lonlat"] = [[round(float(a), 5), round(float(b), 5)] for a, b in ring]
        elif "highest_within_km" in s:
            r["lat"], r["lon"], h = extreme_within(stack, s["lat"], s["lon"], s["highest_within_km"], highest=True)
        elif "snap_to_min_within_km" in s:
            r["lat"], r["lon"], h = extreme_within(stack, s["lat"], s["lon"], s["snap_to_min_within_km"], highest=False)
        else:
            x, y = polar_stereo(np.array(s["lat"]), np.array(s["lon"]))
            h = float(stack.sample(np.atleast_1d(x), np.atleast_1d(y))[0])
        ax, ay = polar_stereo(np.array(s["lat"]), np.array(s["lon"]))
        bx, by = polar_stereo(np.array(r["lat"]), np.array(r["lon"]))
        moved_km = float(np.hypot(bx - ax, by - ay)) / 1000
        r["height_m"] = round(h, 1)
        out.append(r)
        print(f"{s['id']:22s} ({r['lat']:9.4f}, {r['lon']:9.4f})  h={h:7.1f} m  moved {moved_km:5.2f} km from anchor")
    doc = {"generated_utc": dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ"), "sites": out}
    RESOLVED_JSON.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    print(f"wrote {RESOLVED_JSON.name}")


if __name__ == "__main__":
    main()
