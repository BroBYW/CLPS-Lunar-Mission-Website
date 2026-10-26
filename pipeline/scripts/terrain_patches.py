"""Terrain patches for the 3D standing and terrain views (web/public/data/terrain/).

Each site gets six 401 x 401 height grids centred on it in the south polar stereographic plane:
  near    7.5 m spacing,  +-1.5 km  point samples of the 10 m map (the centre is the site's own height)
  fine    30 m spacing,   +-6 km    point samples
  mid     120 m spacing,  +-24 km   mean of 3 x 3 samples per node
  coarse  240 m spacing,  +-48 km   mean of 3 x 3 samples per node
  outer   600 m spacing,  +-120 km  mean of 5 x 5 samples per node
  far     1500 m spacing, +-300 km  mean of 5 x 5 samples per node (the horizon masks look 300 km out)
Each grid's half-width is a whole number of the next grid's spacing, so their edges share vertices. The mid and
outer grids keep the spacing from jumping more than 2.5 times between neighbours, so distant terrain stays sharp.
Heights (metres above the 1737.4 km sphere) come from the same LOLA tiers as the horizon masks. Each grid is
quantised to its unit relative to the site's rounded height (base_m), stored as int16 residuals of the planar
predictor left + up - upleft, and the grids are concatenated and gzip-compressed into <site>.bin.gz.
index.json describes the layout.
"""

import datetime as dt
import gzip
import json

import numpy as np

from clps.dem import stack_for
from clps.geometry import polar_stereo
from clps.paths import WEB_DATA_DIR
from clps.sites import load_resolved_sites

N = 401
GRIDS = [  # name, spacing (m), samples per side averaged into each node, stored unit (m)
    ("near", 7.5, 1, 0.1),
    ("fine", 30.0, 1, 0.25),
    ("mid", 120.0, 3, 0.5),
    ("coarse", 240.0, 3, 1.0),
    ("outer", 600.0, 5, 1.0),
    ("far", 1500.0, 5, 2.0),
]
OUT = WEB_DATA_DIR / "terrain"


def grid(stack, cx: float, cy: float, spacing: float, sub: int) -> np.ndarray:
    half = (N - 1) / 2 * spacing
    xs = cx + np.linspace(-half, half, N)
    ys = cy + np.linspace(half, -half, N)  # rows run from +Y (top) to -Y, like the images
    X, Y = np.meshgrid(xs, ys)
    offsets = (np.arange(sub) - (sub - 1) / 2) * (spacing / sub)
    h = np.zeros((N, N))
    for ox in offsets:
        for oy in offsets:
            h += stack.sample((X + ox).ravel(), (Y + oy).ravel()).reshape(N, N)
    h /= sub * sub
    if np.isnan(h).any():
        raise RuntimeError(f"no elevation data for {np.isnan(h).sum()} nodes")
    return h


def encode(h: np.ndarray, base: float, unit: float) -> bytes:
    q = np.round((h - base) / unit).astype(np.int64)
    p = np.pad(q, ((1, 0), (1, 0)))  # zeros above and to the left
    r = q - (p[1:, :-1] + p[:-1, 1:] - p[:-1, :-1])
    if np.abs(r).max() > 32767:
        raise ValueError("residual too large for int16")
    return r.astype("<i2").tobytes()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    index = {
        "description": "Per-site height grids, concatenated in the order listed: int16 residuals of the predictor left + up - upleft, in each grid's unit relative to the site's base_m, gzip",
        "n": N,
        "grids": [{"name": n, "spacing_m": s, "half_m": (N - 1) / 2 * s, "samples": k * k, "unit_m": u} for n, s, k, u in GRIDS],
        "proj": "+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +R=1737400 +units=m",
        "generated_utc": dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sites": {},
    }
    total = 0
    for s in load_resolved_sites():
        stack = stack_for(s["lat"], s["lon"])
        cx, cy = (float(v) for v in polar_stereo(np.array(s["lat"]), np.array(s["lon"])))
        grids = [grid(stack, cx, cy, spacing, sub) for _, spacing, sub, _ in GRIDS]
        base = float(np.round(grids[0][N // 2, N // 2]))
        payload = b"".join(encode(h, base, unit) for h, (_, _, _, unit) in zip(grids, GRIDS))
        path = OUT / f"{s['id']}.bin.gz"
        path.write_bytes(gzip.compress(payload, compresslevel=9, mtime=0))
        index["sites"][s["id"]] = {"file": path.name, "center_m": [round(cx, 2), round(cy, 2)], "base_m": base}
        total += path.stat().st_size
        print(f"{s['id']:22s} {path.stat().st_size / 1e3:6.0f} kB", flush=True)
    (OUT / "index.json").write_text(json.dumps(index, indent=1) + "\n", newline="\n")
    print(f"total terrain: {total / 1e3:,.0f} kB")


if __name__ == "__main__":
    main()
