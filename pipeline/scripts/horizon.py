"""Build horizon masks and sites.json (PLAN.md §5 steps 4-5).

Outputs:
  web/public/data/sites.json          sites with coordinates, sources and terrain heights
  web/public/data/horizons.bin/.json  float32 [site][observer height][3600 azimuths], degrees
  pipeline/validation/masks/*.png     one plot per site (for eyeballing)
  pipeline/validation/validation_masks.npz  masks for the literature points (Python only)
"""

import datetime as dt
import json
from functools import lru_cache
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

from clps.dem import FAR_FILES, WINDOW_DIR, DemStack, Raster
from clps.geometry import polar_stereo, polar_stereo_inverse
from clps.horizon import AZ_STEP_DEG, N_AZ, horizon_mask, ray_distances_km
from clps.paths import VALIDATION_DIR, WEB_DATA_DIR
from clps.sites import load_sites, load_validation_points

HEIGHTS_M = (2.0, 10.0)
MAX_KM = 300.0


@lru_cache(maxsize=1)
def far_rasters() -> tuple[Raster, ...]:
    return tuple(Raster.open(path, name) for name, (_, path) in FAR_FILES.items())


def window_boxes() -> list[tuple[str, tuple[float, float, float, float], Path]]:
    manifest = json.loads((WINDOW_DIR / "manifest.json").read_text())
    return [(tier, tuple(w["box"]), WINDOW_DIR / w["file"]) for tier, ws in manifest.items() for w in ws]


@lru_cache(maxsize=4)
def open_window(path: Path) -> Raster:
    return Raster.open(path)


def stack_for(lat: float, lon: float) -> DemStack:
    """The near and mid windows that contain this point, plus the two far rasters."""
    x, y = (float(v) for v in polar_stereo(np.array(lat), np.array(lon)))
    chosen = {}
    for tier, box, path in window_boxes():
        if box[0] <= x <= box[2] and box[1] <= y <= box[3]:
            # prefer the window in which the point sits most centrally
            margin = min(x - box[0], box[2] - x, y - box[1], box[3] - y)
            if tier not in chosen or margin > chosen[tier][0]:
                chosen[tier] = (margin, path)
    rasters = [open_window(p) for _, p in chosen.values()] + list(far_rasters())
    return DemStack(rasters)


def snap_to_minimum(stack: DemStack, lat: float, lon: float, radius_km: float) -> tuple[float, float]:
    """Lowest terrain point within radius_km (10 m grid search)."""
    x0, y0 = (float(v) for v in polar_stereo(np.array(lat), np.array(lon)))
    r = radius_km * 1000.0
    g = np.arange(-r, r + 1, 10.0)
    xx, yy = np.meshgrid(x0 + g, y0 + g)
    inside = np.hypot(xx - x0, yy - y0) <= r
    h = np.where(inside, stack.sample(xx.ravel(), yy.ravel()).reshape(xx.shape), np.inf)
    i = np.unravel_index(np.nanargmin(h), h.shape)
    lat2, lon2 = polar_stereo_inverse(np.array(xx[i]), np.array(yy[i]))
    return round(float(lat2), 5), round(float(lon2), 5)


def plot_mask(site: dict, masks: np.ndarray, out: Path) -> None:
    az = np.arange(N_AZ) * AZ_STEP_DEG
    fig, ax = plt.subplots(figsize=(12, 3), dpi=110)
    ax.fill_between(az, -6, masks[0], color="#5e5950", lw=0)
    ax.plot(az, masks[0], color="#1a1916", lw=0.8, label="2 m")
    ax.plot(az, masks[1], color="#c07a00", lw=0.8, label="10 m")
    ax.set_xlim(0, 360)
    ax.set_ylim(min(-5, masks.min() - 0.5), max(15, masks.max() + 1))
    ax.set_xticks(range(0, 361, 45))
    ax.set_xlabel("Azimuth (deg, clockwise from north)")
    ax.set_ylabel("Elevation (deg)")
    ax.set_title(f"{site['name']}  ({site['lat']:.4f}, {site['lon']:.4f}), terrain {site['height_m']:.0f} m")
    ax.grid(alpha=0.3)
    ax.legend(loc="upper right")
    fig.tight_layout()
    fig.savefig(out)
    plt.close(fig)


def main() -> None:
    sites = load_sites()
    masks = np.empty((len(sites), len(HEIGHTS_M), N_AZ), dtype=np.float64)
    plot_dir = VALIDATION_DIR / "masks"
    plot_dir.mkdir(parents=True, exist_ok=True)
    out_sites = []
    for i, s in enumerate(sites):
        stack = stack_for(s["lat"], s["lon"])
        if "snap_to_min_within_km" in s:
            s["lat"], s["lon"] = snap_to_minimum(stack, s["lat"], s["lon"], s["snap_to_min_within_km"])
            stack = stack_for(s["lat"], s["lon"])
        x, y = polar_stereo(np.array(s["lat"]), np.array(s["lon"]))
        h_site = float(stack.sample(np.atleast_1d(x), np.atleast_1d(y))[0])
        near_res = min(r.res for r in stack.rasters)
        masks[i] = horizon_mask(stack, s["lat"], s["lon"], h_site, HEIGHTS_M, MAX_KM)
        s_out = {k: v for k, v in s.items() if k != "snap_to_min_within_km"}
        s_out.update({"height_m": round(h_site, 1), "dem_near_res_m": near_res, "mask_index": i})
        out_sites.append(s_out)
        plot_mask(s_out, masks[i], plot_dir / f"{s['id']}.png")
        print(f"{s['id']:22s} h={h_site:7.1f} m  horizon 2 m: {masks[i, 0].min():6.2f} .. {masks[i, 0].max():6.2f} deg"
              f"  (near {near_res:.0f} m)", flush=True)

    WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)
    masks.astype("<f4").tofile(WEB_DATA_DIR / "horizons.bin")
    generated = dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    meta = {
        "description": "Terrain horizon elevation (deg) per site, observer height and azimuth bin",
        "format": "float32 little-endian, [site][height][azimuth]",
        "az_step_deg": AZ_STEP_DEG, "az_count": N_AZ, "heights_m": list(HEIGHTS_M),
        "sites": [s["id"] for s in out_sites],
        "ray_length_km": MAX_KM, "ray_samples": int(ray_distances_km(MAX_KM).size),
        "dems": ["PGDA LDEM_83S_10MPP_ADJ (10 m, +-20 km window)", "PGDA LDEM_80S_20MPP_ADJ (20 m, +-60 km window)",
                 "PGDA LDEM_80S_80MPP_ADJ (80 m)", "PGDA LDEM_60S_240MPP_ADJ (240 m)"],
        "generated_utc": generated,
    }
    (WEB_DATA_DIR / "horizons.json").write_text(json.dumps(meta, indent=2) + "\n", newline="\n")
    (WEB_DATA_DIR / "sites.json").write_text(
        json.dumps({"generated_utc": generated, "sites": out_sites}, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8", newline="\n")
    print(f"wrote horizons.bin ({(WEB_DATA_DIR / 'horizons.bin').stat().st_size / 1e3:.0f} kB) and sites.json")

    # Validation points: each at its study's observer height (Python only)
    _, vpoints = load_validation_points()
    vmasks, vinfo = [], []
    for p in vpoints:
        stack = stack_for(p["lat"], p["lon"])
        x, y = polar_stereo(np.array(p["lat"]), np.array(p["lon"]))
        h_site = float(stack.sample(np.atleast_1d(x), np.atleast_1d(y))[0])
        vmasks.append(horizon_mask(stack, p["lat"], p["lon"], h_site, (float(p["height_m"]),), MAX_KM)[0])
        vinfo.append({"id": p["id"], "height_m": h_site})
        print(f"validation {p['id']:28s} h={h_site:7.1f} m", flush=True)
    np.savez_compressed(VALIDATION_DIR / "validation_masks.npz", masks=np.array(vmasks),
                        ids=np.array([v["id"] for v in vinfo]), site_heights=np.array([v["height_m"] for v in vinfo]))


if __name__ == "__main__":
    main()
