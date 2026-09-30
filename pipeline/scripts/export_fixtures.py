"""Export fixtures for the Vitest checks in web/src/lib (PLAN.md §12, item 1).

  azel.json      exact SPICE az/el; the browser's interpolated values must agree within 0.01 deg
  fraction.json  visible solar-disk fractions (with Earth eclipses) for given inputs; same algorithm, must agree
  metrics.json   P0 metrics for two sites over a quarter at 10-minute steps; the browser recomputes the series
"""

import datetime as dt
import json

import numpy as np
import spiceypy as sp

from clps.ephem import Ephemeris, body_vectors, ms_since_epoch, utc_to_et
from clps.geometry import R_EARTH_KM, R_SUN_KM, angular_radius_deg, azel, site_vector
from clps.kernels import load_kernels
from clps.paths import FIXTURE_DIR, WEB_DATA_DIR
from clps.series import site_series, time_grid
from clps.visibility import metrics

# Three sites spread in longitude (PLAN.md §7); heights exercise the height parameter.
AZEL_SITES = [
    ("connecting-ridge", -89.4398, -137.17, 1900.0),
    ("malapert-massif", -85.98, -1.67, 4000.0),
    ("nobile-rim-2", -83.9, 58.7, 0.0),
]
FRACTION_SITES = ["connecting-ridge", "de-gerlache-rim-2", "malapert-massif"]
METRICS_SITES = ["connecting-ridge", "shackleton-rim"]
METRICS_RANGE = ("2027-01-01T00:00:00", "2027-04-01T00:00:00")
STEP_MS = 10 * 60 * 1000


def fixture_epochs(n_random: int = 21) -> np.ndarray:
    """Grid start and end, one exact hour, and random second-resolution epochs in between."""
    rng = np.random.default_rng(42)
    t0, t1 = np.datetime64("2026-01-01T00:00:00", "s"), np.datetime64("2031-01-01T00:00:00", "s")
    span = int((t1 - t0) / np.timedelta64(1, "s"))
    random = t0 + np.sort(rng.integers(0, span, n_random)) * np.timedelta64(1, "s")
    fixed = np.array(["2026-01-01T00:00:00", "2028-06-15T12:00:00", "2031-01-01T00:00:00"], dtype="datetime64[s]")
    return np.sort(np.concatenate([fixed, random]))


def azel_cases() -> list[dict]:
    times = fixture_epochs()
    ets = utc_to_et(times)
    sun = body_vectors(ets, "SUN")
    earth = body_vectors(ets, "EARTH")
    t_ms = times.astype("datetime64[ms]").astype(np.int64)
    cases = []
    for site_id, lat, lon, height in AZEL_SITES:
        s = site_vector(lat, lon, height)
        for body, vectors, radius in (("sun", sun, R_SUN_KM), ("earth", earth, R_EARTH_KM)):
            topo = vectors - s
            az, el = azel(topo, lat, lon)
            dist = np.linalg.norm(topo, axis=1)
            for i in range(len(times)):
                cases.append({
                    "site": site_id, "lat": lat, "lon": lon, "height_m": height,
                    "utc": str(times[i]) + "Z", "t_ms": int(t_ms[i]), "body": body,
                    "az": round(float(az[i]), 9), "el": round(float(el[i]), 9),
                    "dist_km": round(float(dist[i]), 3),
                    "radius_deg": round(float(angular_radius_deg(radius, dist[i])), 9),
                })
    return cases


def load_web_masks() -> tuple[list[dict], np.ndarray, list[float]]:
    meta = json.loads((WEB_DATA_DIR / "horizons.json").read_text())
    sites = json.loads((WEB_DATA_DIR / "sites.json").read_text(encoding="utf-8"))["sites"]
    masks = np.fromfile(WEB_DATA_DIR / "horizons.bin", dtype="<f4").astype(np.float64)
    masks = masks.reshape(len(meta["sites"]), len(meta["heights_m"]), meta["az_count"])
    return sites, masks, meta["heights_m"]


def fraction_cases(eph: Ephemeris) -> list[dict]:
    sites, masks, heights = load_web_masks()
    by_id = {s["id"]: s for s in sites}
    hourly = eph.t0_ms + np.arange(eph.data.shape[0] - 1) * eph.step_ms
    cases = []
    for sid in FRACTION_SITES:
        s = by_id[sid]
        mask = masks[s["mask_index"], 0]
        ser = site_series(eph, s["lat"], s["lon"], s["height_m"] + heights[0], mask, hourly)
        f = ser["f_sun"]
        partial = np.flatnonzero((f > 0) & (f < 1))
        full = np.flatnonzero(f >= 1)
        dark = np.flatnonzero(f <= 0)
        pick = np.concatenate([
            partial[np.linspace(0, len(partial) - 1, 20).astype(int)] if len(partial) else [],
            full[np.linspace(0, len(full) - 1, 3).astype(int)] if len(full) else [],
            dark[np.linspace(0, len(dark) - 1, 3).astype(int)] if len(dark) else [],
        ]).astype(int)
        for i in pick:
            cases.append({k: (round(float(ser[k][i]), 9) if k != "earth_vis" else bool(ser[k][i]))
                          for k in ("sun_az", "sun_el", "sun_r", "earth_az", "earth_el", "earth_r", "f_sun", "earth_vis")}
                         | {"site": sid, "mask_index": s["mask_index"], "height_index": 0, "t_ms": int(hourly[i])})
    # The 3 Mar 2026 total lunar eclipse, seen from Malapert: Earth covers the Sun
    s = by_id["malapert-massif"]
    t = ms_since_epoch(np.array(["2026-03-03T11:30:00"], dtype="datetime64[s]"))
    ser = site_series(eph, s["lat"], s["lon"], s["height_m"] + heights[0], masks[s["mask_index"], 0], t)
    cases.append({k: (round(float(ser[k][0]), 9) if k != "earth_vis" else bool(ser[k][0]))
                  for k in ("sun_az", "sun_el", "sun_r", "earth_az", "earth_el", "earth_r", "f_sun", "earth_vis")}
                 | {"site": "malapert-massif", "mask_index": s["mask_index"], "height_index": 0, "t_ms": int(t[0]),
                    "note": "total lunar eclipse"})
    return cases


def metrics_cases(eph: Ephemeris) -> list[dict]:
    sites, masks, heights = load_web_masks()
    by_id = {s["id"]: s for s in sites}
    start, end = (float(ms_since_epoch(np.array([v], dtype="datetime64[s]"))[0]) for v in METRICS_RANGE)
    t = time_grid(start, end, STEP_MS)
    out = []
    for sid in METRICS_SITES:
        s = by_id[sid]
        for hi, h in enumerate(heights):
            ser = site_series(eph, s["lat"], s["lon"], s["height_m"] + h, masks[s["mask_index"], hi], t)
            m = metrics(ser["f_sun"], ser["earth_vis"], STEP_MS / 3.6e6)
            out.append({"site": sid, "height_index": hi, "start_ms": start, "end_ms": end, "step_ms": STEP_MS,
                        "samples": len(t), "metrics": m})
    return out


def write(name: str, doc: dict) -> None:
    doc = {"generated_utc": dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")} | doc
    (FIXTURE_DIR / name).write_text(json.dumps(doc, indent=1) + "\n", newline="\n")
    print(f"wrote {name}: {len(doc['cases'])} cases")


def main() -> None:
    load_kernels()
    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    write("azel.json", {
        "description": "Exact SPICE az/el (spkpos LT+S at the epoch, minus the site vector). "
                       "The browser interpolates the hourly float32 ephemeris and must agree within 0.01 deg.",
        "toolkit": sp.tkvrsn("TOOLKIT"), "cases": azel_cases()})
    eph = Ephemeris.load()
    write("fraction.json", {
        "description": "Visible solar-disk fraction (terrain and Earth) from pipeline/clps/visibility.py for the given "
                       "angles and the site's mask in horizons.bin. The browser must return the same value.",
        "cases": fraction_cases(eph)})
    write("metrics.json", {
        "description": f"P0 metrics (threshold 0, margin 0) over {METRICS_RANGE[0]}..{METRICS_RANGE[1]} UTC at 10 min.",
        "cases": metrics_cases(eph)})


if __name__ == "__main__":
    main()
