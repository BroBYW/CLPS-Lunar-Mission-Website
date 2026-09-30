"""Build horizon masks and sites.json (PLAN.md §5 step 5). Run scripts/sites.py first.

Outputs:
  web/public/data/sites.json          sites with coordinates, sources, terrain heights and footprints
  web/public/data/horizons.bin/.json  float32 [site][observer height][3600 azimuths], degrees
  pipeline/validation/masks/*.png     one plot per site (for eyeballing)
  pipeline/validation/validation_masks.npz  masks for the literature points (Python only)
"""

import datetime as dt
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

from clps.dem import DemStack, stack_for
from clps.geometry import polar_stereo
from clps.horizon import AZ_STEP_DEG, N_AZ, horizon_mask, ray_distances_km
from clps.paths import VALIDATION_DIR, WEB_DATA_DIR
from clps.sites import load_resolved_sites, load_validation_points

HEIGHTS_M = (2.0, 10.0)
MAX_KM = 300.0


def terrain_height(stack: DemStack, lat: float, lon: float) -> float:
    x, y = polar_stereo(np.array(lat), np.array(lon))
    return float(stack.sample(np.atleast_1d(x), np.atleast_1d(y))[0])


def near_coverage_km(stack: DemStack, lat: float, lon: float) -> float:
    """Distance from the point to the edge of its finest (10 m) raster."""
    x, y = (float(v) for v in polar_stereo(np.array(lat), np.array(lon)))
    b = stack.rasters[0].bounds
    return round(min(x - b[0], b[2] - x, y - b[1], b[3] - y) / 1000, 1)


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
    sites = load_resolved_sites()
    masks = np.empty((len(sites), len(HEIGHTS_M), N_AZ), dtype=np.float64)
    plot_dir = VALIDATION_DIR / "masks"
    plot_dir.mkdir(parents=True, exist_ok=True)
    out_sites = []
    for i, s in enumerate(sites):
        stack = stack_for(s["lat"], s["lon"])
        h_site = terrain_height(stack, s["lat"], s["lon"])
        masks[i] = horizon_mask(stack, s["lat"], s["lon"], h_site, HEIGHTS_M, MAX_KM)
        s_out = dict(s)
        s_out.update({"height_m": round(h_site, 1), "dem_10m_radius_km": near_coverage_km(stack, s["lat"], s["lon"]),
                      "mask_index": i})
        out_sites.append(s_out)
        plot_mask(s_out, masks[i], plot_dir / f"{s['id']}.png")
        print(f"{s['id']:22s} h={h_site:7.1f} m  horizon 2 m: {masks[i, 0].min():6.2f} .. {masks[i, 0].max():6.2f} deg"
              f"  (10 m data to {s_out['dem_10m_radius_km']} km)", flush=True)

    WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)
    masks.astype("<f4").tofile(WEB_DATA_DIR / "horizons.bin")
    generated = dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    meta = {
        "description": "Terrain horizon elevation (deg) per site, observer height and azimuth bin",
        "format": "float32 little-endian, [site][height][azimuth]",
        "az_step_deg": AZ_STEP_DEG, "az_count": N_AZ, "heights_m": list(HEIGHTS_M),
        "sites": [s["id"] for s in out_sites],
        "ray_length_km": MAX_KM, "ray_samples": int(ray_distances_km(MAX_KM).size),
        "dems": ["PGDA LDEM_83S_10MPP_ADJ (10 m, +-20 km window)", "PGDA LDEM_80S_20MPP_ADJ (20 m, +-40-60 km window)",
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
    vmasks, vheights = [], []
    for p in vpoints:
        stack = stack_for(p["lat"], p["lon"])
        h_site = terrain_height(stack, p["lat"], p["lon"])
        vmasks.append(horizon_mask(stack, p["lat"], p["lon"], h_site, (float(p["height_m"]),), MAX_KM)[0])
        vheights.append(h_site)
    np.savez_compressed(VALIDATION_DIR / "validation_masks.npz", masks=np.array(vmasks),
                        ids=np.array([p["id"] for p in vpoints]), site_heights=np.array(vheights))
    print(f"wrote validation_masks.npz ({len(vpoints)} points)")


if __name__ == "__main__":
    main()
