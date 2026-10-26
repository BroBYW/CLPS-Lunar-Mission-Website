"""A coarse height grid of the south polar region, for "drop a pin" (web/public/data/pin-dem.bin.gz + .json).

The browser casts rough horizons from it for any point the user picks: 480 m spacing to +-560 km from the pole, so
rays 300 km long from anywhere within about 250 km of the pole stay on the grid. Each node is the mean of 3 x 3
samples of the 80 m map (the 240 m map beyond it). Stored like the terrain patches (scripts/terrain_patches.py):
int16 in 2 m steps as residuals of the planar predictor left + up - upleft, gzip (4.6 MB).
"""

import datetime as dt
import gzip
import json

import numpy as np

from clps.dem import DemStack, far_rasters
from clps.paths import WEB_DATA_DIR

SPACING_M = 480.0
HALF_M = 560_160.0  # a whole number of spacings: 1167 x 480 m
SUB = 3
UNIT_M = 2.0


def main() -> None:
    stack = DemStack(list(far_rasters()))
    n = int(round(2 * HALF_M / SPACING_M)) + 1
    xs = np.linspace(-HALF_M, HALF_M, n)
    offsets = (np.arange(SUB) - (SUB - 1) / 2) * (SPACING_M / SUB)
    h = np.zeros((n, n))
    for j0 in range(0, n, 256):
        ys = np.linspace(HALF_M, -HALF_M, n)[j0:j0 + 256]  # rows run from +Y (top) to -Y, like the images
        X, Y = np.meshgrid(xs, ys)
        acc = np.zeros(X.shape)
        for ox in offsets:
            for oy in offsets:
                acc += stack.sample((X + ox).ravel(), (Y + oy).ravel()).reshape(X.shape)
        h[j0:j0 + len(ys)] = acc / SUB**2
    if np.isnan(h).any():
        raise RuntimeError(f"no elevation data for {np.isnan(h).sum()} nodes")
    q = np.round(h / UNIT_M).astype(np.int64)
    p = np.pad(q, ((1, 0), (1, 0)))
    r = q - (p[1:, :-1] + p[:-1, 1:] - p[:-1, :-1])
    if np.abs(r).max() > 32767:
        raise ValueError("residual too large for int16")
    out = WEB_DATA_DIR / "pin-dem.bin.gz"
    out.write_bytes(gzip.compress(r.astype("<i2").tobytes(), compresslevel=9, mtime=0))
    meta = {
        "description": "South polar heights (m above the 1737.4 km sphere) for rough horizons at any point",
        "format": "gzip of int16 residuals of the predictor left + up - upleft, in unit_m, row 0 at +Y",
        "n": n, "spacing_m": SPACING_M, "half_m": HALF_M, "unit_m": UNIT_M, "base_m": 0.0, "samples": SUB * SUB,
        "proj": "+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +R=1737400 +units=m",
        "dems": ["PGDA LDEM_80S_80MPP_ADJ (80 m)", "PGDA LDEM_60S_240MPP_ADJ (240 m)"],
        "generated_utc": dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    (WEB_DATA_DIR / "pin-dem.json").write_text(json.dumps(meta, indent=2) + "\n", newline="\n")
    print(f"wrote {out.name}: {n} x {n} nodes, {out.stat().st_size / 1e6:.2f} MB; heights {h.min():.0f} .. {h.max():.0f} m")


if __name__ == "__main__":
    main()
