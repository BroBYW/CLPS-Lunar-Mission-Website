"""Check the sunlight model against LROC Wide Angle Camera photos of the south pole (VALIDATION.md §10).

From September 2009 to December 2011 LRO's Wide Angle Camera photographed the south pole about every two hours.
LROC published each photo map-projected (polar stereographic, 100 m per pixel, 80-90°S, in I/F): the WAC polar
movie frames of Speyerer & Robinson (2013). Every photo shows where the Sun was shining at one moment, so it is an
independent check of the horizon masks.

  browse  For every eighth frame, download LROC's 400 m browse image (about 130 kB; 0 marks no data) and read it
          at every site.
  check   Predict the visible fraction of the Sun at each site at that moment from its 2 m horizon mask (Sun from
          SPICE), and count how often the photo agrees (see stage_check for when a photo can tell).
  crops   The check, then for two frames per site the 48 × 48 km around the site at full resolution (one byte range
          of the I/F image), for the Plan view's side-by-side comparison with the app's own lit terrain.

check and crops use the browse images read so far; all runs every stage. The archive's CDN blocks an address after a
burst of requests (it asks for an hour), so requests go out one at a time, a few seconds apart, and the script stops,
keeping what it has, if it is blocked anyway. Downloads are cached in pipeline/raw/lroc/ (about 450 MB in all, most
of it the crops' byte ranges).
Writes web/public/data/lro/photos.json and lro/*.webp, and pipeline/validation/lro_check.json.

    uv run python scripts/lro_photos.py [browse|check|crops|all]
"""

import datetime as dt
import gzip
import json
import sys
import time

import numpy as np
import requests
from PIL import Image

from clps.ephem import body_vectors, utc_to_et
from clps.geometry import R_SUN_KM, angular_radius_deg, azel, polar_stereo, polar_stereo_inverse, site_vector
from clps.kernels import load_kernels
from clps.paths import RAW_DIR, USER_AGENT, VALIDATION_DIR, WEB_DATA_DIR
from clps.visibility import horizon_at, sun_fraction

ODE = "https://oderest.rsl.wustl.edu/live2/"
# The LROC archive (pds.lroc.im-ldi.com) redirects every file here; asking the store directly halves the requests
STORE = "https://pds.mcp.nasa.gov/data/store/img/lunar_reconnaissance_orbiter/pds4/lroc/lro-l-lroc-5-rdr/LROLRC_2001/"
PUBLIC = "https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/"
IMAGES = "DATA/BDR/WAC_POLE/WAC_POLE_MOVIE_SOUTH/"
BROWSE = "EXTRAS/BROWSE/WAC_POLE/WAC_POLE_MOVIE_SOUTH/"
CACHE = RAW_DIR / "lroc"
OUT_DIR = WEB_DATA_DIR / "lro"
PACE_S = 4.0  # between requests to the archive

N = 6080  # frame width and height, pixels
PIXEL_M = 100.0
UL_M = 303_950.0  # centre of the upper-left pixel is at x = -UL_M, y = +UL_M
HEADER_BYTES = 24_320  # the attached PDS3 label, one row long
BROWSE_N = 1520  # browse images are the frames shrunk 4 times: 400 m pixels
SAMPLE_EVERY = 8
EYE_M = 2.0  # the masks' observer height
CROP = 480  # 48 km at 100 m: the extent of the terrain patches' 120 m grid
PER_SITE = 2
STRETCH_IOF = 0.08  # crops store DN = 255·sqrt(I/F / STRETCH_IOF), so the browser can recover I/F
# A pixel counts as sunlit above this I/F: the valley between the shadow peak (scattered light, about 3e-4) and the
# sunlit peak (about 0.03) in the photos' own histograms, chosen before comparing with the model
IOF_LIT = 0.003
# Browse images are a linear stretch of I/F, the same in every frame: against the full-resolution I/F of frames from
# December 2010, April 2010 and July 2011, DN = 4235·I/F + 0.5 (±0.3), saturating at I/F 0.06
BROWSE_DN_PER_IOF = 4235.0
DN_LIT = BROWSE_DN_PER_IOF * IOF_LIT
# I/F per unit of Lommel–Seeliger brightness, μ0/(μ0 + μ): the median of the scales fitted to the full-resolution
# photos (web/scripts/lro-vs-model.ts)
K_IOF = 0.14


class Blocked(Exception):
    pass


session = requests.Session()
session.headers["User-Agent"] = USER_AGENT
_last = [0.0]


def get(url: str, paced: bool = True, **kw) -> requests.Response:
    for attempt in range(5):
        if paced:
            time.sleep(max(0.0, _last[0] + PACE_S - time.monotonic()))
            _last[0] = time.monotonic()
        try:
            r = session.get(url, timeout=600, **kw)
        except requests.RequestException:
            time.sleep(10 * (attempt + 1))
            continue
        if r.status_code == 429:
            raise Blocked(f"the archive asked us to wait {r.headers.get('Retry-After', '?')} s")
        if r.status_code in (200, 206):
            return r
        if r.status_code == 404:
            r.raise_for_status()
        time.sleep(10 * (attempt + 1))
    raise RuntimeError(f"giving up on {url}")


def frame_time(name: str) -> np.datetime64:
    """Middle of the observation: names carry the start minute, and a pass from 80°S over the pole and back to
    80°S takes about six minutes."""
    s = name.removeprefix("WAC_MOVIE_S")
    return np.datetime64(f"{s[0:4]}-{s[4:6]}-{s[6:8]}T{s[9:11]}:{s[11:13]}:00") + np.timedelta64(3, "m")


def list_frames() -> list[str]:
    path = CACHE / "frames.json"
    if path.exists():
        return json.loads(path.read_text())
    names: set[str] = set()
    for offset in range(0, 9000, 1000):
        params = {"query": "product", "results": "p", "output": "JSON", "target": "moon", "ihid": "LRO", "iid": "LROC",
                  "pt": "BDRWMV", "maxlat": -70, "limit": 1000, "offset": offset}
        products = get(ODE, paced=False, params=params).json()["ODEResults"].get("Products", {})
        items = products.get("Product", []) if isinstance(products, dict) else []
        names |= {p["Product_title"] for p in (items if isinstance(items, list) else [items])}
    out = sorted(n for n in names if n.startswith("WAC_MOVIE_S"))
    CACHE.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out))
    return out


def load_sites() -> tuple[list[dict], np.ndarray]:
    meta = json.loads((WEB_DATA_DIR / "horizons.json").read_text())
    sites = json.loads((WEB_DATA_DIR / "sites.json").read_text(encoding="utf-8"))["sites"]
    masks = np.fromfile(WEB_DATA_DIR / "horizons.bin", dtype="<f4").astype(float).reshape(len(meta["sites"]), 2, -1)
    for s in sites:
        x, y = (float(v) for v in polar_stereo(s["lat"], s["lon"]))
        s["xy"] = (x, y)
        s["pixel"] = (int(round((UL_M - y) / PIXEL_M)), int(round((x + UL_M) / PIXEL_M)))
        # Browse pixel (j, i) averages full pixels 4j..4j+3, 4i..4i+3: its centre is 150 m in from theirs
        s["browse"] = (int(round((UL_M - 150 - y) / 400)), int(round((x + UL_M - 150) / 400)))
    return sites, masks


def browse_frame(name: str, sites: list[dict]) -> dict:
    """The browse DN at each site the frame covers (the site's 3 × 3 browse pixels all have data), and how much of
    the site's 48 km crop has data."""
    path = CACHE / "browse" / f"{name}.png"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".part")
        tmp.write_bytes(get(STORE + BROWSE + f"{name}.BROWSE.PNG").content)
        tmp.replace(path)
    dn = np.asarray(Image.open(path))
    out = {}
    h = CROP // 8
    for s in sites:
        r, c = s["browse"]
        if not (1 <= r < BROWSE_N - 1 and 1 <= c < BROWSE_N - 1):
            continue
        win = dn[r - 1:r + 2, c - 1:c + 2]
        if (win == 0).any():
            continue
        box = dn[max(0, r - h):r + h, max(0, c - h):c + h]
        covered = box[box > 0]
        out[s["id"]] = {"dn": int(dn[r, c]), "win": [int(v) for v in win.ravel()], "coverage": round(float(covered.size) / (4 * h * h), 3),
                        "lit": round(float(np.mean(covered > DN_LIT)), 3)}
    return out


def stage_browse(sample: list[str], sites: list[dict]) -> dict:
    path = CACHE / "browse.json"
    seen = json.loads(path.read_text()) if path.exists() else {}
    todo = [n for n in sample if n not in seen]
    print(f"browse: {len(sample) - len(todo)} of {len(sample)} frames done, about {len(todo) * PACE_S / 60:.0f} min to go", flush=True)
    t0 = time.time()
    try:
        for k, n in enumerate(todo):
            seen[n] = browse_frame(n, sites)
            if k % 50 == 49:
                tmp = path.with_suffix(".tmp")
                tmp.write_text(json.dumps(seen))
                tmp.replace(path)
                print(f"  {k + 1}/{len(todo)} ({time.time() - t0:.0f} s)", flush=True)
    finally:
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(seen))
        tmp.replace(path)
    return seen


def predict(site: dict, mask: np.ndarray, sun: np.ndarray) -> dict:
    v = site_vector(site["lat"], site["lon"], site["height_m"] + EYE_M)
    topo = np.atleast_2d(sun) - v
    az, el = azel(topo, site["lat"], site["lon"])
    r = angular_radius_deg(R_SUN_KM, np.linalg.norm(topo, axis=-1))
    return {"az": az, "el": el, "r": r, "f": sun_fraction(mask, az, el, r), "margin": el - horizon_at(mask, az)}


def pixel_facets(site: dict) -> tuple[np.ndarray, np.ndarray]:
    """Unit normals and local verticals (Moon-fixed) of the 30 m terrain facets inside the site's 400 m browse pixel,
    from the site's finest-but-one terrain grid (scripts/terrain_patches.py)."""
    index = json.loads((WEB_DATA_DIR / "terrain" / "index.json").read_text())
    e = index["sites"][site["id"]]
    n = index["n"]
    gi = next(k for k, g in enumerate(index["grids"]) if g["name"] == "fine")
    g = index["grids"][gi]
    raw = np.frombuffer(gzip.decompress((WEB_DATA_DIR / "terrain" / e["file"]).read_bytes()), "<i2")
    res = raw[gi * n * n:(gi + 1) * n * n].reshape(n, n).astype(np.int64)
    # Undo the planar predictor (value = residual + left + up - upleft): a two-dimensional running sum
    h = np.cumsum(np.cumsum(res, axis=0), axis=1) * g["unit_m"] + e["base_m"]
    xs = e["center_m"][0] - g["half_m"] + np.arange(n) * g["spacing_m"]
    ys = e["center_m"][1] + g["half_m"] - np.arange(n) * g["spacing_m"]
    jb, ib = site["browse"]
    xb, yb = -UL_M + 150 + 400 * ib, UL_M - 150 - 400 * jb
    cols = np.flatnonzero(np.abs(xs - xb) <= 200)
    rows = np.flatnonzero(np.abs(ys - yb) <= 200)
    jj, ii = np.meshgrid(np.arange(rows[0] - 1, rows[-1] + 2), np.arange(cols[0] - 1, cols[-1] + 2), indexing="ij")
    lat, lon = polar_stereo_inverse(xs[ii], ys[jj])
    p = np.stack([site_vector(a, b, z) for a, b, z in zip(lat.ravel(), lon.ravel(), h[jj, ii].ravel())]).reshape(*jj.shape, 3)
    nor = np.cross(p[1:-1, 2:] - p[1:-1, :-2], p[:-2, 1:-1] - p[2:, 1:-1]).reshape(-1, 3)
    up = p[1:-1, 1:-1].reshape(-1, 3)
    up = up / np.linalg.norm(up, axis=1)[:, None]
    nor = nor / np.linalg.norm(nor, axis=1)[:, None]
    return np.where((np.sum(nor * up, axis=1) < 0)[:, None], -nor, nor), up


def tally(rows: list[dict]) -> dict:
    lit = [r for r in rows if r["expect"] == "lit"]
    dark = [r for r in rows if r["expect"] == "dark"]
    t = {"photos": len(rows), "not_called": len(rows) - len(lit) - len(dark),
         "lit_lit": sum(r["photo_lit"] for r in lit), "lit_dark": sum(not r["photo_lit"] for r in lit),
         "dark_dark": sum(not r["photo_lit"] for r in dark), "dark_lit": sum(r["photo_lit"] for r in dark)}
    called = len(lit) + len(dark)
    t["agree_pct"] = round(100.0 * (t["lit_lit"] + t["dark_dark"]) / called, 1) if called else None
    return t


def stage_check(sample: list[str], seen: dict, sites: list[dict], masks: np.ndarray, dn_lit: float) -> dict:
    """The photo sees the ground, not a mast: ground is visibly sunlit only if the Sun clears the skyline and also
    stands high enough over the ground's own slopes to light them brightly. So each photo gets the I/F its pixel would
    have in full sunlight: K_IOF times the Lommel–Seeliger brightness averaged over the 30 m facets in the pixel. A
    site counts as 'expected sunlit' when its 2 m mask gives the whole Sun and that I/F is at least twice IOF_LIT,
    'expected in shadow' when the mask gives no Sun, and is not called otherwise: part of the Sun, or light too
    grazing to tell from shadow (from a peak the Sun can be visible below the level horizon, where it barely lights
    the ground)."""
    times = np.array([frame_time(n) for n in sample])
    suns = body_vectors(utc_to_et(times.astype("datetime64[s]")), "SUN")
    rows = []
    for s in sites:
        mask = masks[s["mask_index"], 0]
        idx = [k for k, n in enumerate(sample) if s["id"] in seen.get(n, {})]
        if not idx:
            continue
        p = predict(s, mask, suns[idx])
        topo = suns[idx] - site_vector(s["lat"], s["lon"], s["height_m"])
        nor, up = pixel_facets(s)
        mu0 = (topo / np.linalg.norm(topo, axis=1)[:, None]) @ nor.T  # (photos, facets)
        mu = np.sum(nor * up, axis=1)
        lit_iof = K_IOF * np.where(mu0 > 0, mu0 / (np.maximum(mu0, 0) + mu), 0.0).mean(axis=1)
        for j, k in enumerate(idx):
            obs = seen[sample[k]][s["id"]]
            f = float(p["f"][j])
            # The terrain decides only if some of the Sun clears the lowest point of the skyline
            decided = bool(p["el"][j] + p["r"][j] > mask.min())
            bright = round(float(lit_iof[j]), 5)
            expect = "lit" if f >= 0.99 and bright >= 2 * IOF_LIT else "dark" if f <= 0.01 and decided else None
            rows.append({"frame": sample[k], "site": s["id"], "f": round(f, 4), "el": round(float(p["el"][j]), 3),
                         "az": round(float(p["az"][j]), 2), "margin": round(float(p["margin"][j]), 3),
                         "lit_iof": bright, "dn": obs["dn"], "photo_lit": obs["dn"] > dn_lit,
                         "coverage": obs["coverage"], "crop_lit": obs["lit"], "decided_by_terrain": decided, "expect": expect})
    decided = [r for r in rows if r["decided_by_terrain"]]
    # The photos' own histogram has a broad, flat valley from about I/F 0.002 to 0.007, so show other thresholds too
    sensitivity = {}
    for iof in (0.002, 0.003, 0.005):
        expect = lambda r: "lit" if r["f"] >= 0.99 and r["lit_iof"] >= 2 * iof else "dark" if r["f"] <= 0.01 else None
        t = tally([r | {"photo_lit": r["dn"] > BROWSE_DN_PER_IOF * iof, "expect": expect(r)} for r in decided])
        sensitivity[str(iof)] = {"called": t["photos"] - t["not_called"], "agree_pct": t["agree_pct"]}
    # The hardest calls: the Sun above the level horizon, hidden by terrain
    hidden = [r for r in decided if r["expect"] == "dark" and r["el"] > 0]
    check = {
        "description": "LROC WAC polar movie frames (every eighth, 400 m browse images) against the 2 m horizon "
                       "masks: is the ground at the site sunlit? Only photos where the terrain decides (some of the "
                       "Sun clears the lowest point of the site's skyline). Expected sunlit: the mask gives the whole "
                       "Sun and the ground would be at least twice the sunlit threshold in full sunlight (Lommel-Seeliger "
                       "over the 30 m facets in the pixel); expected in shadow: no Sun.",
        "frames": len(sample), "first": sample[0], "last": sample[-1], "pixel_m": 400.0,
        "dn_lit": dn_lit, "k_iof": K_IOF, "eye_m": EYE_M,
        "all": tally(decided), "near_skyline": tally([r for r in decided if abs(r["margin"]) <= 1.0]),
        # The first rule tried, before taking the ground's brightness into account: whole Sun means sunlit
        "simple_rule": tally([r | {"expect": "lit" if r["f"] >= 0.99 else "dark" if r["f"] <= 0.01 else None} for r in decided]),
        "hidden_above_level": {"photos": len(hidden), "photo_dark": sum(not r["photo_lit"] for r in hidden)},
        "agree_pct_by_threshold": sensitivity,
        "sites": {s["id"]: tally([r for r in decided if r["site"] == s["id"]]) for s in sites},
        "generated_utc": dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    # One line per photo and site keeps the record small enough to commit
    body = ",\n".join(json.dumps(r, separators=(",", ":")) for r in rows)
    (VALIDATION_DIR / "lro_check.json").write_text(json.dumps(check, indent=1)[:-2] + f',\n "rows": [\n{body}\n ]\n}}\n', newline="\n")

    print("\n| Site | Photos | Called | Agree | Sun expected, photo dark | Shadow expected, photo lit |")
    print("|---|---|---|---|---|---|")
    for s in sites:
        t = check["sites"][s["id"]]
        if t["photos"]:
            print(f"| {s['name']} | {t['photos']} | {t['photos'] - t['not_called']} | {t['agree_pct']}% | {t['lit_dark']} | {t['dark_lit']} |")
    for label, t in (("All", check["all"]), ("Sun within 1° of the skyline", check["near_skyline"])):
        print(f"{label}: {t['photos']} photos, {t['photos'] - t['not_called']} called, {t['agree_pct']}% agree "
              f"(Sun expected/photo dark {t['lit_dark']}, shadow expected/photo lit {t['dark_lit']})")
    t = check["simple_rule"]
    print(f"Without the brightness rule: {t['photos'] - t['not_called']} called, {t['agree_pct']}% agree (Sun expected/photo dark {t['lit_dark']})")
    h = check["hidden_above_level"]
    print(f"Sun above the level horizon but hidden by terrain: {h['photos']} photos, dark in {h['photo_dark']}")
    print("By sunlit threshold (I/F):", ", ".join(f"{k}: {v['agree_pct']}% of {v['called']}" for k, v in sensitivity.items()))
    return check | {"rows": rows}


def pick_photos(check: dict, sites: list[dict]) -> dict[str, list[dict]]:
    """Two photos per site, never chosen by whether photo and model agree: one where the mask expects the site
    sunlit and one where it expects shadow, the Sun from directions at least 60° apart when possible, the crop as
    fully covered as the frames allow (IM-1 lies at their edge), and the 48 km showing both light and shadow (by the
    browse image's sunlit share, up to 40%), then the Sun as high as possible."""
    picks = {}
    for s in sites:
        rows = [r for r in check["rows"] if r["site"] == s["id"]]
        best = max((r["coverage"] for r in rows), default=0.0)
        covered = [r for r in rows if r["coverage"] >= 0.98 * best]
        side = lambda r: "lit" if r["f"] >= 0.99 else "dark" if r["f"] <= 0.01 and r["decided_by_terrain"] else None
        cands = [r for r in covered if side(r) and abs(r["margin"]) <= 3.0]
        if not cands:  # the Sun never reaches the site (Shackleton's floor): the frames with the Sun highest there
            cands = sorted(covered, key=lambda r: -r["el"])[:20]
        chosen: list[dict] = []
        apart = lambda r: min((abs((r["az"] - c["az"] + 180) % 360 - 180) for c in chosen), default=180.0) >= 60
        for want in ("lit", "dark"):
            pool = [r for r in cands if side(r) == want]
            if pool:
                chosen.append(max(pool, key=lambda r: (apart(r), round(min(r["crop_lit"], 0.4) * 10), r["el"])))
        while len(chosen) < min(PER_SITE, len(cands)):
            chosen.append(max((r for r in cands if r not in chosen), key=lambda r: (apart(r), round(min(r["crop_lit"], 0.4) * 10), r["el"])))
        picks[s["id"]] = chosen[:PER_SITE]
    return picks


def label_times(name: str) -> tuple[np.datetime64, np.datetime64]:
    path = CACHE / "labels" / f"{name}.xml"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(get(STORE + IMAGES + f"{name}.xml").text, encoding="utf-8")
    text = path.read_text(encoding="utf-8")
    pick = lambda tag: np.datetime64(text.split(f"<{tag}>")[1].split("<")[0].rstrip("Z"))
    return pick("start_date_time"), pick("stop_date_time")


def read_rows(name: str, r0: int, count: int) -> np.ndarray:
    """Full-resolution I/F rows r0..r0+count-1 (clipped to the frame; NaN where there is no data), cached."""
    path = CACHE / "crops" / f"{name}-{r0}-{count}.npy"
    if path.exists():
        return np.load(path)
    lo, hi = max(0, r0), min(N, r0 + count)
    a = HEADER_BYTES + lo * N * 4
    data = get(STORE + IMAGES + f"{name}.IMG", headers={"Range": f"bytes={a}-{a + (hi - lo) * N * 4 - 1}"}).content
    v = np.frombuffer(data, "<f4").reshape(hi - lo, N)
    rows = np.full((count, N), np.nan, dtype=np.float32)
    rows[lo - r0:hi - r0] = np.where(v < -1e30, np.nan, v)  # LROC's special constants are all near -3.4e38
    path.parent.mkdir(parents=True, exist_ok=True)
    np.save(path, rows)
    return rows


def encode(iof: np.ndarray) -> Image.Image:
    dn = np.round(255.0 * np.sqrt(np.clip(np.nan_to_num(iof, nan=0.0), 0.0, STRETCH_IOF) / STRETCH_IOF)).astype(np.uint8)
    alpha = np.where(np.isnan(iof), 0, 255).astype(np.uint8)
    return Image.fromarray(np.dstack([dn, dn, dn, alpha]), "RGBA")


def stage_crops(check: dict, sites: list[dict], masks: np.ndarray) -> None:
    picks = pick_photos(check, sites)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_sites = {}
    for s in sites:
        r0, c0 = s["pixel"][0] - CROP // 2, s["pixel"][1] - CROP // 2
        photos = []
        for pick in sorted(picks[s["id"]], key=lambda r: r["frame"]):
            n = pick["frame"]
            stem = f"{s['id']}-{n.removeprefix('WAC_MOVIE_S').lower()}"
            out = OUT_DIR / f"{stem}.webp"
            iof = np.full((CROP, CROP), np.nan, dtype=np.float32)
            lo, hi = max(0, c0), min(N, c0 + CROP)
            iof[:, lo - c0:hi - c0] = read_rows(n, r0, CROP)[:, lo:hi]
            encode(iof).save(out, "WEBP", quality=90, alpha_quality=100, method=6)
            start, stop = label_times(n)
            mid = start + (stop - start) / 2
            sun = body_vectors(utc_to_et(np.array([mid]).astype("datetime64[s]")), "SUN")[0]
            p = predict(s, masks[s["mask_index"], 0], sun)
            centre = iof[CROP // 2 - 1:CROP // 2 + 2, CROP // 2 - 1:CROP // 2 + 2]
            photos.append({
                "frame": n, "file": out.name, "utc": str(mid.astype("datetime64[s]")) + "Z",
                "sun_km": [round(float(c), 1) for c in sun],
                "sun_el": round(float(p["el"][0]), 2), "sun_az": round(float(p["az"][0]), 1), "f": round(float(p["f"][0]), 3),
                "photo_lit": bool(np.nanmean(centre) > IOF_LIT),
                "url": PUBLIC + BROWSE + f"{n}.BROWSE.PNG",
            })
            lit = np.nanmean(iof > IOF_LIT) * 100
            print(f"  {out.name}: {out.stat().st_size / 1e3:.0f} kB, {np.mean(~np.isnan(iof)) * 100:.0f}% covered, {lit:.0f}% sunlit", flush=True)
        out_sites[s["id"]] = {"origin_m": [-UL_M + PIXEL_M * c0, UL_M - PIXEL_M * r0], "photos": photos, "check": check["sites"][s["id"]]}
    doc = {
        "description": "LROC WAC south polar movie frames around each site, for the Plan view's photo comparison",
        "credit": "NASA/GSFC/Arizona State University (LROC WAC polar movie frames, Speyerer & Robinson 2013)",
        "size": CROP, "pixel_m": PIXEL_M,
        "encoding": f"WebP; DN = 255·sqrt(I/F / {STRETCH_IOF}); alpha 0 where the frame has no data. Pixel (i, j) is "
                    "centred at origin_m + (100·i, -100·j), polar stereographic metres",
        "stretch_iof": STRETCH_IOF, "iof_lit": IOF_LIT,
        "check": {k: check[k] for k in ("frames", "first", "last", "pixel_m", "all", "near_skyline")},
        "sites": out_sites,
        "generated_utc": check["generated_utc"],
    }
    (OUT_DIR / "photos.json").write_text(json.dumps(doc, indent=1) + "\n", newline="\n")
    total = sum(p.stat().st_size for p in OUT_DIR.glob("*.webp"))
    print(f"wrote lro/photos.json and {sum(len(v['photos']) for v in out_sites.values())} photos ({total / 1e6:.2f} MB)")


def main() -> None:
    stage = sys.argv[1] if len(sys.argv) > 1 else "all"
    load_kernels()
    names = list_frames()
    sample = names[::SAMPLE_EVERY]
    print(f"{len(names)} frames, {names[0]} to {names[-1]}; using every {SAMPLE_EVERY}th: {len(sample)}", flush=True)
    sites, masks = load_sites()
    try:
        if stage in ("all", "browse"):
            seen = stage_browse(sample, sites)
            if stage == "browse":
                return
        else:  # check or crops: use the frames read so far
            path = CACHE / "browse.json"
            seen = json.loads(path.read_text()) if path.exists() else {}
        done = [n for n in sample if n in seen]
        check = stage_check(done, seen, sites, masks, DN_LIT)
        if stage in ("all", "crops"):
            stage_crops(check, sites, masks)
    except Blocked as e:
        print(f"stopped: {e}. Run again later; finished work is cached.")
        sys.exit(2)


if __name__ == "__main__":
    main()
