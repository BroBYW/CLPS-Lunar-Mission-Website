"""Fetch the LOLA elevation data needed for horizon masks (PLAN.md §5 step 3).

  uv run python scripts/fetch_dems.py --dry-run   # print what is missing and its estimated size
  uv run python scripts/fetch_dems.py             # fetch only what is missing

Points are the resolved sites (sites_resolved.json, else the sites.yaml anchors) plus the validation points.
A point is covered when a window already on disk contains its required box, so re-runs only top up.
"""

import argparse
import json
import time

import numpy as np

from clps.dem import (
    COG_LIMITS, FAR_FILES, MANIFEST, WINDOW_DIR, WINDOW_TIERS,
    box_inside, fetch_window, load_manifest, merge_boxes, required_box, snap_box, window_path,
)
from clps.download import download
from clps.geometry import polar_stereo
from clps.sites import load_resolved_sites, load_validation_points


def all_points() -> list[tuple[str, float, float]]:
    pts = [(s["id"], s["lat"], s["lon"]) for s in load_resolved_sites()]
    _, vpoints = load_validation_points()
    return pts + [(p["id"], p["lat"], p["lon"]) for p in vpoints]


def missing_windows(manifest: dict) -> dict[str, list[tuple[float, float, float, float]]]:
    out = {}
    for tier, (_, half, res, _) in WINDOW_TIERS.items():
        have = [tuple(w["box"]) for w in manifest.get(tier, [])]
        new = []
        for _, lat, lon in all_points():
            x, y = (float(v) for v in polar_stereo(np.array(lat), np.array(lon)))
            if not any(box_inside(required_box(tier, x, y), b) for b in have):
                new.append(snap_box((x - half, y - half, x + half, y + half), res, COG_LIMITS[tier]))
        out[tier] = [snap_box(b, res, COG_LIMITS[tier]) for b in merge_boxes(new)]
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    manifest = load_manifest()
    todo = missing_windows(manifest)
    for tier, boxes in todo.items():
        res = WINDOW_TIERS[tier][2]
        px = sum((b[2] - b[0]) / res * (b[3] - b[1]) / res for b in boxes)
        print(f"{tier}: {len(boxes)} new windows, {px / 1e6:.0f} Mpx (~{px * 2 / 1e9:.2f} GB compressed transfer)")
    missing_far = [name for name, (_, path) in FAR_FILES.items() if not path.exists()]
    print(f"far files missing: {', '.join(missing_far) or 'none'}")
    if args.dry_run:
        return

    for name, (url, dest) in FAR_FILES.items():
        download(url, dest)
    for tier, boxes in todo.items():
        url = WINDOW_TIERS[tier][0]
        for i, box in enumerate(boxes):
            dest = window_path(tier, box)
            t0 = time.time()
            fetch_window(url, box, dest)
            print(f"ok   {tier} {i + 1}/{len(boxes)} {dest.name} "
                  f"({dest.stat().st_size / 1e6:.0f} MB on disk, {time.time() - t0:.0f} s)", flush=True)
            manifest.setdefault(tier, []).append({"box": list(box), "file": dest.name})
            WINDOW_DIR.mkdir(parents=True, exist_ok=True)
            MANIFEST.write_text(json.dumps(manifest, indent=1), newline="\n")


if __name__ == "__main__":
    main()
