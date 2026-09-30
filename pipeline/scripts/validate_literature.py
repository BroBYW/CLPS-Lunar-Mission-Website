"""Illumination and Earth visibility at published points, like for like (PLAN.md Â§12 item 4; VALIDATION.md Â§4).

Each point uses its study's observer height and time span (hourly, exact SPICE vectors, not the shipped
2026-2030 file) and every definition the studies use: mean visible fraction of the solar disk, % of time any
part is visible, % of time the whole disk is visible, and the same for Earth. Also samples the PGDA
average-visibility maps (Mazarico et al. method; % of time any part of the disk is visible, 60 m, 85 S to the pole).

Writes pipeline/validation/literature_comparison.csv and prints Markdown tables for VALIDATION.md.
"""

import csv
import json

import numpy as np
import rasterio

from clps.dem import GDAL_HTTP_ENV, stack_for
from clps.horizon import horizon_mask
from clps.sites import extreme_within
from clps.ephem import body_vectors, ms_since_epoch, utc_grid, utc_to_et
from clps.geometry import R_EARTH_KM, R_SUN_KM, angular_radius_deg, azel, polar_stereo, site_vector
from clps.kernels import load_kernels
from clps.paths import VALIDATION_DIR
from clps.sites import load_validation_points
from clps.visibility import earth_visible, longest_run, sun_fraction

SPAN = ("2017-01-01T00:00:00", "2037-01-01T00:00:00")
SNAP_M = 250.0  # published coordinates are often given to 0.01 deg of latitude, about 300 m
CACHE = VALIDATION_DIR / "cache" / "ephem_2017_2037_hourly.npz"
# Tiled GeoTIFFs: sampled over HTTP range requests (only the tiles under the points are read)
PGDA_MAPS = {
    "sun": "https://pgda.gsfc.nasa.gov/data/MoonIllumination/AVGVISIB_85S_060M_201608.TIF",
    "earth": "https://pgda.gsfc.nasa.gov/data/MoonIllumination/AVGVISIB_85S_060M_201608_EARTH.TIF",
}


def span_ephemeris() -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    if CACHE.exists():
        z = np.load(CACHE)
        return z["t_ms"], z["sun"], z["earth"]
    times = utc_grid(*SPAN, 3600)
    ets = utc_to_et(times)
    sun, earth = body_vectors(ets, "SUN"), body_vectors(ets, "EARTH")
    t_ms = ms_since_epoch(times)
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    np.savez(CACHE, t_ms=t_ms, sun=sun, earth=earth)
    return t_ms, sun, earth


def point_stats(lat, lon, height_m, mask, sun, earth, chunk=40_000) -> dict:
    s = site_vector(lat, lon, height_m)
    f_sun, f_earth, e_center = [], [], []
    for a in range(0, len(sun), chunk):
        st, et = sun[a:a + chunk] - s, earth[a:a + chunk] - s
        s_az, s_el = azel(st, lat, lon)
        e_az, e_el = azel(et, lat, lon)
        s_r = angular_radius_deg(R_SUN_KM, np.linalg.norm(st, axis=1))
        e_r = angular_radius_deg(R_EARTH_KM, np.linalg.norm(et, axis=1))
        f_sun.append(sun_fraction(mask, s_az, s_el, s_r, e_az, e_el, e_r))
        f_earth.append(sun_fraction(mask, e_az, e_el, e_r))  # the same disk algorithm, applied to Earth
        e_center.append(earth_visible(mask, e_az, e_el))
    fs, fe, ec = np.concatenate(f_sun), np.concatenate(f_earth), np.concatenate(e_center)
    dark_h, _ = longest_run(fs <= 0)
    return {
        "sun_mean": fs.mean() * 100, "sun_any": (fs > 0).mean() * 100, "sun_full": (fs >= 1 - 1e-6).mean() * 100,
        "longest_dark_h": float(dark_h),
        "earth_any": (fe > 0).mean() * 100, "earth_full": (fe >= 1 - 1e-6).mean() * 100, "earth_center": ec.mean() * 100,
    }


def pgda_sample(which: str, latlons: list[tuple[float, float]]) -> list[float | None]:
    """% of time lit by any part of the disk, from the PGDA map (int16 x 4e-5 = fraction). None outside the map."""
    xy = [tuple(float(v) for v in polar_stereo(np.array(la), np.array(lo))) for la, lo in latlons]
    with rasterio.Env(**GDAL_HTTP_ENV), rasterio.open("/vsicurl/" + PGDA_MAPS[which]) as ds:
        b = ds.bounds
        inside = [b.left <= x <= b.right and b.bottom <= y <= b.top for x, y in xy]
        vals = iter(ds.sample([p for p, ok in zip(xy, inside) if ok]))
        out = []
        for ok in inside:
            dn = float(next(vals)[0]) if ok else None
            out.append(None if dn is None or dn == ds.nodata else dn * ds.scales[0] * 100)
    return out


def main() -> None:
    load_kernels()
    studies, points = load_validation_points()
    pgda = {k: pgda_sample(k, [(p["lat"], p["lon"]) for p in points]) for k in PGDA_MAPS}
    print("sampled PGDA maps", flush=True)
    z = np.load(VALIDATION_DIR / "validation_masks.npz")
    masks = {i: (m, h) for i, m, h in zip(z["ids"], z["masks"], z["site_heights"])}
    t_ms, sun, earth = span_ephemeris()

    rows = []
    for n, p in enumerate(points):
        st = studies[p["study"]]
        y0, y1 = st["span"]
        t0 = ms_since_epoch(np.array([f"{y0}-01-01T00:00:00"], dtype="datetime64[s]"))[0]
        t1 = ms_since_epoch(np.array([f"{y1}-01-01T00:00:00"], dtype="datetime64[s]"))[0]
        sel = (t_ms >= t0) & (t_ms < t1)
        mask, h_site = masks[p["id"]]
        ours = point_stats(p["lat"], p["lon"], h_site + p["height_m"], mask, sun[sel], earth[sel])
        ours["pgda_sun_any"] = pgda["sun"][n]
        ours["pgda_earth_any"] = pgda["earth"][n]
        # Coordinate-uncertainty test: the highest ground within SNAP_M of the published point
        stack = stack_for(p["lat"], p["lon"])
        s_lat, s_lon, s_h = extreme_within(stack, p["lat"], p["lon"], SNAP_M / 1000, highest=True)
        s_mask = horizon_mask(stack, s_lat, s_lon, s_h, (float(p["height_m"]),), 300.0)[0]
        snap = point_stats(s_lat, s_lon, s_h + p["height_m"], s_mask, sun[sel], earth[sel])
        ax, ay = polar_stereo(np.array(p["lat"]), np.array(p["lon"]))
        bx, by = polar_stereo(np.array(s_lat), np.array(s_lon))
        ours.update({f"snap_{k}": v for k, v in snap.items()} | {
            "snap_moved_m": float(np.hypot(bx - ax, by - ay)), "snap_rise_m": s_h - h_site})
        rows.append({"id": p["id"], "study": st["label"], "height_m": p["height_m"], "span": f"{y0}-{y1}", **{
            f"pub_{k}": p.get(k) for k in ("sun_mean", "sun_any", "sun_full", "sun_lit", "longest_dark_h", "earth_any", "earth_full")
        }, **{f"our_{k}": v for k, v in ours.items()}})
        print(f"{p['id']:28s} ours: mean {ours['sun_mean']:5.1f} any {ours['sun_any']:5.1f} dark {ours['longest_dark_h']:6.0f} h"
              f"  | high point {ours['snap_moved_m']:4.0f} m away (+{ours['snap_rise_m']:4.1f} m): mean {snap['sun_mean']:5.1f}"
              f" any {snap['sun_any']:5.1f} dark {snap['longest_dark_h']:6.0f} h", flush=True)

    out = VALIDATION_DIR / "literature_comparison.csv"
    with open(out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()), lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow({k: (f"{v:.2f}" if isinstance(v, float) else ("" if v is None else v)) for k, v in r.items()})
    (VALIDATION_DIR / "literature_comparison.json").write_text(json.dumps(rows, indent=1, default=float) + "\n", newline="\n")
    print(f"\nwrote {out}")


if __name__ == "__main__":
    main()
