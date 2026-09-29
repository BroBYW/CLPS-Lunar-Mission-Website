"""Fetch the LOLA elevation data needed for horizon masks (PLAN.md §5 step 3).

  uv run python scripts/fetch_dems.py --dry-run   # print the plan and estimated sizes
  uv run python scripts/fetch_dems.py             # fetch
"""

import argparse
import json
import time

import numpy as np

from clps.dem import FAR_FILES, WINDOW_DIR, WINDOW_TIERS, fetch_window, merge_boxes, snap_box, window_path
from clps.download import download
from clps.geometry import polar_stereo
from clps.sites import load_sites, load_validation_points

COG_LIMITS = {"near10": 216_400.0, "mid20": 304_000.0}


def all_points() -> list[tuple[str, float, float]]:
    pts = [(s["id"], s["lat"], s["lon"]) for s in load_sites()]
    _, vpoints = load_validation_points()
    pts += [(p["id"], p["lat"], p["lon"]) for p in vpoints]
    return pts


def plan() -> dict[str, list[tuple[float, float, float, float]]]:
    pts = all_points()
    out = {}
    for tier, (_, half, res) in WINDOW_TIERS.items():
        boxes = []
        for _, lat, lon in pts:
            x, y = (float(v) for v in polar_stereo(np.array(lat), np.array(lon)))
            boxes.append(snap_box((x - half, y - half, x + half, y + half), res, COG_LIMITS[tier]))
        out[tier] = [snap_box(b, res, COG_LIMITS[tier]) for b in merge_boxes(boxes)]
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    windows = plan()
    total_px = 0
    for tier, boxes in windows.items():
        res = WINDOW_TIERS[tier][2]
        px = sum((b[2] - b[0]) / res * (b[3] - b[1]) / res for b in boxes)
        total_px += px
        print(f"{tier}: {len(boxes)} windows, {px / 1e6:.0f} Mpx (~{px * 4 / 1e9:.2f} GB as float32, "
              f"~{px * 2 / 1e9:.2f} GB compressed transfer)")
    print(f"far80 + far240 whole files: 0.41 GB")
    if args.dry_run:
        return

    for name, (url, dest) in FAR_FILES.items():
        download(url, dest)
    manifest = {}
    for tier, boxes in windows.items():
        url = WINDOW_TIERS[tier][0]
        for i, box in enumerate(boxes):
            dest = window_path(tier, box)
            t0 = time.time()
            fetch_window(url, box, dest)
            print(f"ok   {tier} {i + 1}/{len(boxes)} {dest.name} "
                  f"({dest.stat().st_size / 1e6:.0f} MB on disk, {time.time() - t0:.0f} s)", flush=True)
            manifest.setdefault(tier, []).append({"box": box, "file": dest.name})
    (WINDOW_DIR / "manifest.json").write_text(json.dumps(manifest, indent=1), newline="\n")


if __name__ == "__main__":
    main()
