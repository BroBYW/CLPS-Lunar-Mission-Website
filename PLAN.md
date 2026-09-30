# CLPS Lunar Mission Browser: build plan

Draft for your approval, 29 Sep 2026. Nothing is built yet; this file is the only project work so far (plus the AI usage log).

## Status

- **Official challenge.** Only the summary is published so far ([challenge page](https://www.spaceappschallenge.org/2026/challenges/clps-lunar-mission-browser/)). It matches your summary in PROMPT.md: an intuitive tool for mission planners, educators and the public to compare landing sites and dates quickly, showing the Sun and Earth relative to the horizon to judge power and direct-to-Earth (DTE) communication windows. The full statement and resource list are due Oct 28, and the 2026 submission and judging guides are due Nov 13. I found no conflicts yet. When you paste the full statement into PROMPT.md §0, I'll re-map §8 against it.
- **Rules.** The [2026 participant FAQ](https://www.spaceappschallenge.org/resources/participant-faqs/) says teams may not begin work on challenges before the hackathon. You chose to build now, so §11 describes two working days rather than the event weekend.
- **This machine.** Node 22.14 is new enough for Vite 8, Vitest 5 and Cesium 1.145, and git has your identity set. uv 0.11 is installed, with CPython 3.11.15 already downloaded. `python` on PATH is a zero-byte stub, so every pipeline command runs through `uv run`. The Vercel CLI and GitHub CLI are not installed. D: has about 444 GB free.

## 1. The product

Pick a south pole site and a date range. Instantly see when it has sunlight, when it can see Earth, and how it compares to other sites.

| Audience | What they get | Where |
|---|---|---|
| Mission planners | Defined metrics, 2–3 site comparison, windows as CSV, share links | Planner mode (desktop) |
| Educators and students | A short guided story with animations, ending in a "find the best landing site" challenge | Explore mode (works on phones) |
| Public | The horizon panorama and a 3D fly-to as the first impression | Both |

## 2. Changes I propose to PROMPT.md

You asked me to challenge the architecture. The rest of PROMPT.md stays as written.

| # | PROMPT.md | Proposal | Why |
|---|---|---|---|
| 1 | Frames kernel `moon_de440_*.tf` | Use `moon_de440_250416.tf` | NAIF's readme still names `moon_de440_220930.tf`, but that file is superseded and sits in `a_old_versions/`. The current kernel defines `MOON_ME` as an alias of `MOON_ME_DE440_ME421`. |
| 2 | `elev = atan((h_t − h_o − d²/2R) / d)` | Exact spherical geometry along great-circle rays (formula in §4.3). Ray points are computed in lat/lon, then projected onto the DEM grid. | The approximation is off by 0.012° at 300 km. Measuring distance in polar-stereographic map units adds up to 1.7% scale error at 75°S. Same cost. |
| 3 | Rays every 0.5° of azimuth | Every 0.1° (3,600 rays) | At 50 km, rays 0.5° apart are 440 m apart and can miss a narrow peak. The Sun is only 0.53° wide. Costs seconds of compute and about 0.4 MB of data. |
| 4 | Rays to at least 150 km | 300 km, using coarse DEMs beyond ~30 km (80 m, then 240 m) | At 200 km a tall massif can still set a low horizon. At 300 km the curvature drop is 26 km, which no polar relief (−7.3 to +7.0 km) overcomes for horizons above −2.5°. The 240 m DEM reaches every ray end. |
| 5 | Hourly samples, linear interpolation | Keep hourly data, but compute metrics on a 10-minute interpolated grid | Hourly steps make every duration uncertain by ±1 h; 10-minute steps cut that to ±5 min. The Sun moves 0.5° of azimuth per hour, one disk width. |
| 6 | Terrain blocks the Sun | Also remove the part of the Sun covered by Earth (lunar eclipses) | Several lunar eclipses fall in 2026–2030, starting with the total eclipse of 3 Mar 2026. A near-side site loses the Sun for hours, which matters for battery sizing. Both vectors are already loaded, so it's cheap. |
| 7 | Battery = survive the longest darkness | Also run an energy-balance simulation: the battery must cover the largest cumulative deficit of load minus panel output. Show it next to the simple load × longest-darkness number. Include cos(elevation) for the vertical panel. | Weak partial sunlight before and after darkness changes the answer. The simple number can over- or under-size. |
| 8 | Moon Trek tiles for imagery | Render our own south pole hillshade basemap from the LOLA 80 m DEM in the pipeline (~0.5 MB WebP). Use Moon Trek imagery only on the 3D globe, with its polar tiles as an optional zoom layer. | The 2D map needs no runtime tile service and has no projection mismatch. It comes from the same data as the horizons. |
| 9 | CesiumJS plus Cesium ion Moon terrain | Keep Cesium but make ion optional. The default 3D view uses Moon Trek WAC imagery (no token) plus our computed horizon ring. ion's Moon tiles (asset 2684829) switch on when a token is present. | The [2026 Space Apps terms](https://www.spaceappschallenge.org/legal/) require non-NASA material to be freely available or OSI-licensed, and ion content is proprietary. A [May 2026 forum report](https://community.cesium.com/t/cesium-ion-moon-terrain-appears-2-5-km-higher-than-lola-sldem2015-dem-at-the-same-lon-lat/46282) also puts ion's Moon tile heights about 2.5 km off LOLA. Horizons always come from LOLA. |
| 10 | TypeScript | Pin TypeScript 6.0.x | npm's `latest` is now 7.0, the Go port. The Vite template and typescript-eslint support versions below 6.1. |
| 11 | Python venv | uv venv on the CPython 3.11 you already have | No new installs. The newest numpy, rasterio and pyproj need Python 3.12+, so we get the previous minor versions, which is fine here. Answer Q5 if you'd rather I install 3.13. |
| 12 | Deploy a preview first | Deploy a one-page placeholder first, then the real app as previews | Vercel makes the first deployment of a new project production ([docs](https://vercel.com/docs/cli/deploy)). |
| 13 | Demo video | DEMO_SCRIPT.md targets 30 s, with a 7-slide backup deck | 2025 rules capped the demo at a 30 s video or 7 slides. The 2026 guide isn't out yet. |
| 14 | (new, P2) | DSN coverage: a fourth timeline row showing whether any Deep Space Network complex has the Moon above 10° | A real DTE window needs Earth in the site's sky and a ground station that can see the Moon. Precomputing it is cheap (~0.3 MB). |

## 3. Architecture

```
 OFFLINE: Python pipeline (/pipeline, uv venv, run once)       ONLINE: static site (/web, Vite + React, on Vercel)
 ┌──────────────────────────────────────────────────────┐      ┌───────────────────────────────────────────────────────┐
 │ NAIF kernels ─► ephemeris.py ────────────────────────┼─────►│ ephemeris.bin   Sun + Earth, MOON_ME, hourly           │
 │ (de440s, moon_pa_de440, fk, pck, lsk)                │      │                                                       │
 │                                                      │      │  main thread: React 19 + Zustand store (URL-synced)   │
 │ LOLA DEMs ─► horizon.py ─────────────────────────────┼─────►│ horizons.bin    3,600 az × sites × 2 heights           │
 │ (fine near each site, coarse to 300 km)              │      │   ├─ Site list + polar map (SVG over basemap)         │
 │                                                      │      │   ├─ Horizon panorama (SVG, disks moved per frame)    │
 │ sites.yaml (cited) ─► sites.py ──────────────────────┼─────►│ sites.json     ├─ Time controls (UTC)                  │
 │                                                      │      │   ├─ Timeline strip (canvas + text alternative)       │
 │ coarse LOLA DEM ─► basemap.py ───────────────────────┼─────►│ basemap.webp   └─ Metrics, compare, battery, CSV      │
 │                                                      │      │                                                       │
 │ reference math (same as browser) ─► export_fixtures ─┼─────►│ Vitest fixtures  metrics.worker.ts (Comlink):         │
 │                                                      │      │   interpolation, az/el, disk fraction, eclipse,       │
 │ validate_horizons.py ◄──► JPL Horizons API           │      │   runs, windows, battery simulation                   │
 │   (tables for VALIDATION.md)                         │      │                                                       │
 └──────────────────────────────────────────────────────┘      │ 3D view (lazy chunk): CesiumJS, Moon ellipsoid,       │
                                                               │   Moon Trek imagery | optional ion Moon tiles         │
                                                               └───────────────────────────────────────────────────────┘
```

Nothing runs on a server. Horizons and WebGeocalc are used only offline for validation; neither allows browser calls.

```
Nasa/
├── PROMPT.md  PLAN.md  README.md  DATA_SOURCES.md  VALIDATION.md  DEMO_SCRIPT.md  AI_USAGE.md  LICENSE (MIT)
├── .gitignore                      # kernels, raw DEMs, .venv, node_modules, dist, .env.local, .vercel
├── pipeline/
│   ├── pyproject.toml  uv.lock
│   ├── kernels/                    # gitignored; fetched by script; lunar.tm meta-kernel is committed
│   ├── raw/                        # gitignored; DEM downloads and crops
│   ├── sites.yaml                  # source of truth: coordinates + citation + exact/approximate
│   ├── clps/                       # package: geometry.py, dem.py, horizon.py, visibility.py, metrics.py
│   ├── scripts/                    # fetch_kernels, fetch_dems, ephemeris, sites, horizon, basemap,
│   │                               # export_fixtures, validate_horizons, (dsn)
│   ├── validation/                 # Horizons responses (cached), comparison CSVs, mask plots
│   └── tests/                      # pytest: synthetic DEMs, frames, fraction geometry
└── web/
    ├── package.json  vite.config.ts  tsconfig.json  vercel.json
    ├── .env.local                  # gitignored: VITE_CESIUM_ION_TOKEN (optional)
    ├── public/data/                # derived data only, ~2 MB, committed
    └── src/
        ├── lib/                    # astro.ts, horizon.ts, fraction.ts, metrics.ts, battery.ts, time.ts
        │   └── __fixtures__/       # exported by Python
        ├── workers/metrics.worker.ts
        ├── state/store.ts          # Zustand + URL sync
        ├── components/             # Panorama, TimeControls, Timeline, SiteMap, SiteList, Metrics,
        │                           # CompareTable, BatteryCalc, WindowsTable
        ├── views/                  # Planner, Compare, Explore, Globe3D (lazy), About, Credits
        └── styles/                 # Tailwind v4 theme tokens
```

## 4. Method

### 4.1 Ephemeris

- `spkpos(target, et, 'MOON_ME', 'LT+S', 'MOON')` for SUN and EARTH, every hour on the UTC grid from 2026-01-01T00:00 to 2031-01-01T00:00 (43,825 samples).
- The frame is evaluated at `et`, because its center is the observer, so no light-time lag applies.
- Corrections are computed at the Moon's center and the site is subtracted in the browser. For Earth's elevation this errs by about 0.055″ (0.000015°), checked against a true topocentric solution in WebGeocalc.
- The data is stored as Float32 km, `[sun xyz, earth xyz]` per sample. Float32 rounding is at most 8 km at the Sun's distance, or 0.000003° of direction.
- Leap seconds: `naif0012.tls` is current until at least 2027-07-01, since no leap second is scheduled for end-2026. Later dates assume none, as Horizons does.

### 4.2 Topocentric azimuth and elevation (one definition, shared by Python and the browser)

- Site vector `s = (1737.4 km + h_site + h_obs) · (cos φ cos λ, cos φ sin λ, sin φ)`, using planetocentric latitude φ and east longitude λ in MOON_ME.
- Topocentric vector `v = b(t) − s`, where `b(t)` is interpolated linearly between hourly samples.
- Local axes: `e = (−sin λ, cos λ, 0)`, `n = (−sin φ cos λ, −sin φ sin λ, cos φ)`, `u = ŝ`.
- `el = atan2(v·u, √((v·e)² + (v·n)²))`.
- `az = atan2(v·e, v·n)`, taken mod 360°. It is measured clockwise from north (away from the pole), matching Horizons and SPICE `azlcpo`.
- Angular radius of a disk: `asin(R_body / |v|)`, with R_sun = 695,700 km and R_earth = 6,378.1 km. That is about 0.53° across for the Sun and 1.8–2.1° for Earth.

### 4.3 Horizon masks

- For each site at observer heights of 2 m and 10 m: 3,600 azimuths (every 0.1°), cast along great circles to 300 km.
- Samples are spaced at the pixel size of the finest DEM covering each point and read with bilinear interpolation. The terrain profile is shared by both heights.
- Elevation angle of a terrain point: `ε = atan2((R + h_t)·cos δ − (R + h_site + h_obs), (R + h_t)·sin δ)`, with `δ = d / R` and R = 1737.4 km. The horizon at each azimuth is the maximum over the ray.
- DEM stack along each ray: the 10 m window (±30 km around the site), then 80 m out to ±304 km from the pole, then 240 m beyond. Sites south of 87°S can optionally add 5 m for the innermost 8 km.
- The script fails loudly if any ray point is outside every DEM, so coverage reaches the end of every ray.
- Self-test: on a smooth sphere, the horizon dips 0.0869° at 2 m and 0.1944° at 10 m.

### 4.4 Visible fraction of a disk

- The disk is split into 32 vertical strips. Each strip's chord is compared with the horizon at that azimuth, interpolating linearly between 0.1° bins and scaling azimuth offsets by 1/cos(el).
- Visible fraction = visible area / disk area.
- For eclipses, the part of each strip covered by Earth's disk is removed as well.
- Python implements the same algorithm, and the fixtures compare the two.

### 4.5 Metric definitions

All metrics use UTC, cover the selected date range and are computed on the 10-minute grid.

| Metric | Definition | Default |
|---|---|---|
| Solar illumination % | Time average of the visible solar-disk fraction f(t), where 0 ≤ f ≤ 1 | — |
| Dark | f(t) ≤ T, the darkness threshold | T = 0: dark only when no part of the Sun is visible |
| Longest continuous darkness | Longest run of dark time, in hours. A run cut off by the edge of the date range is shown as "≥". | — |
| Earth visible | Earth's center is above the horizon at its azimuth plus a margin M | M = 0° |
| Earth visibility % | Share of time with Earth visible | — |
| Longest communication blackout | Longest run with Earth not visible, in hours ("≥" at range edges) | — |
| Overlap windows | Maximal intervals that are not dark and have Earth visible. Shows count, total %, longest window, and a list of UTC start and end times. | — |

### 4.6 Power and battery (P1)

- Panel: vertical, turning to face the Sun. `P(t) = 1361 W/m² × (1 AU / r)² × η × A × f(t) × cos(el)`. At these sites cos(el) is at least 0.99; it is included so the formula is exact.
- Daily energy: the mean and minimum Wh per UTC day over the range.
- Battery: the smallest capacity that never runs empty, starting full, which is the largest drop of the cumulative net-energy curve ∫(P − L) dt. Shown as usable Wh, and as nameplate Wh after depth of discharge.
- Shown alongside: the simple estimate, load × longest darkness.

## 5. Data pipeline

| Step | Script | Output | Size | Run time |
|---|---|---|---|---|
| 1 | `fetch_kernels.py` | `pipeline/kernels/` (gitignored) plus the `lunar.tm` meta-kernel | 45.7 MB download | < 1 min |
| 2 | `ephemeris.py` | `web/public/data/ephemeris.bin` + `.json` manifest | 1.05 MB | ~10 s |
| 3 | `fetch_dems.py`: reads a ±30 km window per site from the 10 m COG over HTTP range requests; downloads the 80 m and 240 m DEMs whole, plus the illumination maps and region GeoJSON | `pipeline/raw/` (gitignored) | ~1–1.5 GB total; no single file over 1 GB (largest: 219 MB) | 10–30 min depending on bandwidth; runs in the background during M1 |
| 4 | `sites.py` (sites.yaml → JSON, site heights sampled from the DEM) | `web/public/data/sites.json` | ~6 KB | seconds |
| 5 | `horizon.py` | `web/public/data/horizons.bin` + manifest | ~0.4 MB | 2–5 min |
| 6 | `basemap.py` (hillshade of 83°S–90°S, polar stereographic) | `web/public/data/basemap-south.webp` + projection JSON | ~0.5 MB | ~30 s |
| 7 | `export_fixtures.py` | `web/src/lib/__fixtures__/*.json` | ~200 KB | seconds |
| 8 | `validate_horizons.py` (one request at a time, cached, custom User-Agent) | `pipeline/validation/*.csv` | ~50 KB | ~1 min |
| 9 | `dsn.py` (P2) | `web/public/data/dsn.bin` | ~0.3 MB | ~20 s |

- The kernel download is 45.7 MB: de440s.bsp (32.7 MB), moon_pa_de440_200625.bpc (12.9 MB), pck00011.tpc, moon_de440_250416.tf and naif0012.tls.
- The data the site ships totals about 2 MB, so first load stays well under 3 s on broadband.

## 6. Data sources (verified 29 Sep 2026)

DATA_SOURCES.md is written in M0 from this list, with a citation for every item.

- **SPICE kernels**, all from [NAIF generic_kernels](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/):
  - `lsk/naif0012.tls`: still the latest.
  - `spk/planets/de440s.bsp`: covers 1849–2150 and includes the Sun, EMB, Moon and Earth segments.
  - `pck/pck00011.tpc`: sets the Moon's radius to 1737.4 km on all axes.
  - `pck/moon_pa_de440_200625.bpc`: covers 1550–2650.
  - `fk/satellites/moon_de440_250416.tf`: defines MOON_PA, MOON_ME, MOON_PA_DE440 and MOON_ME_DE440_ME421. ME and PA differ by 0.0289° (about 875 m), so the choice matters.
  - DE442 exists but has no lunar orientation update, so we stay on DE440.
- **SPICE tooling:** spiceypy 8.2.0 (MIT) bundles CSPICE N0067. Its `azlcpo` gives an independent az/el check inside Python.
- **Validation references:**
  - [JPL Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html): `CENTER='coord@301'`, `COORD_TYPE='GEODETIC'`, `SITE_COORD='E-lon,lat,alt km'`, `QUANTITIES='4'`, `EXTRA_PREC='YES'`. For Moon sites it uses mean-Earth coordinates, effectively MOON_ME.
  - [NAIF WebGeocalc API](https://wgc2.jpl.nasa.gov/webgeocalc/documents/api-info.html) as a second reference. In a spot test at 89.9°S, 0°E on 2026-01-01 00:00 UTC, it agreed with Horizons to 3×10⁻⁷°.
- **LOLA elevation maps.** All are on the 1737.4 km sphere, polar stereographic centered on the south pole, in the DE421 mean-Earth frame. In the research agent's spot checks, PGDA and PDS heights agreed to about 0.1–0.2 m.
  - **Near terrain:** PGDA `LDEM_83S_10MPP_ADJ.TIF`, from Barker et al. 2023, PSJ 4:183 ([PGDA product 90](https://pgda.gsfc.nasa.gov/products/90)). It is 10 m/px and reaches ±216 km from the pole. The file is a 5.1 GB cloud-optimized GeoTIFF (float32 metres, NaN nodata, 512 px tiles, overviews). We only read windows of it through HTTP range requests and never download it whole.
  - **Far terrain:** PGDA `LDEM_80S_80MPP_ADJ.TIF` (80 m, ±304 km, 189 MB) and `LDEM_60S_240MPP_ADJ.TIF` (240 m, ±931 km, 219 MB), downloaded whole. The 240 m grid covers every 300 km ray, even from 83.6°S.
  - **Optional innermost 5 m:** the PGDA 87–90°S mosaic `ldem_87s_5mpp.tif` ([product 81](https://pgda.gsfc.nasa.gov/products/81); tiled, readable in windows) and the Barker et al. 2021 site DEMs ([product 78](https://pgda.gsfc.nasa.gov/products/78)).
  - **Backup:** the PDS LOLA polar GDRs ([PDS Geosciences](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/)), stored as int16 × 0.5 m. Their lossless JP2 copies are all under 1 GB but need a sign check. GDAL's PDS driver adds the 1737.4 km offset, so heights read that way come out as radii.
  - **Illumination maps** (Mazarico et al. 2011 method): [PGDA product 69](https://pgda.gsfc.nasa.gov/products/69) GeoTIFFs `AVGVISIB_85S_060M_201608.TIF` (Sun, 34 MB) and `..._EARTH.TIF` (25 MB), at 60 m, covering 85°S to the pole. Used for validation and the P2 overlay.
- **Moon Trek south-polar tiles.** These are WMTS tiles in the same projection, with CORS enabled: `https://trek.nasa.gov/tiles/Moon/SP/{Layer}/1.0.0/default/default028mm/{z}/{row}/{col}.png`.
  - Useful layers: `LRO_LOLA_ClrShade_SPole75_30mp_v04` (to zoom 6) and `LRO_NAC_Mosaic_SPole85.5_1mp` (to zoom 11).
  - Layer metadata says "Use_Constraints: None". The credits name the LOLA team (NASA GSFC), the LROC team and NASA's LMMP team.
- **Artemis region polygons:** Moon Trek's [`A3_Named_regions_SP` GeoJSON](https://trek.nasa.gov/moon/trekarcgis2/rest/services/A3_Named_regions_SP/MapServer/0/query?where=1%3D1&outFields=*&f=geojson). In M2 I'll check whether it holds the 2024 list of nine or the 2022 list of thirteen. The USGS data release is the cross-check.
- **Imagery for the 3D globe:** Moon Trek LRO WAC global mosaic, served as WMTS with CORS enabled (`https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/{z}/{y}/{x}.jpg`).
- **Optional Cesium Moon** (ion asset 2684829): LOLA terrain refining to 5 m poleward of 87.5°S, with LROC imagery. Attribution is "NASA and the USGS Astrogeology Science Center" plus the Cesium ion logo. The free Community plan covers non-commercial and educational use.
- **Sites:** see §7. The sources are:
  - NASA Artemis releases
  - the USGS footprint data release
  - LROC NAC region-of-interest mosaics
  - the IAU Gazetteer of Planetary Nomenclature
  - LROC landing images
  - the VIPER PSJ paper
- **Illumination and Earth-visibility literature:**
  - Bussey et al. 2010: Kaguya DEM at 474 m/px, surface level, 12 h steps
  - Mazarico et al. 2011: Icarus 211; 240 m/px, 6 h steps over several 18.6-year cycles
  - Speyerer & Robinson 2013: image-based, WAC at 100 m/px, 1 year
  - Gläser et al. 2014: Icarus 243; 20 m/px, 1 h steps over 19 years
  - Gläser et al. 2018: 20 m/px, hourly 2017–2037
  - Bryant 2009: Goldstone radar DEM at 40 m, 2 m observer
  - [PGDA Earth-visibility maps](https://pgda.gsfc.nasa.gov/products/69): hourly over 18.6 years, 60–240 m, where Earth counts as visible if any part of its disk shows

## 7. Sites

There are 13 sites (P0 needs 8), all using planetocentric latitude and east longitude. Slater Plain is on hold: its only official footprint is in the USGS release, which blocks automated downloads. `pipeline/sites.yaml` holds each site with its source and a label: **exact** for a published point, **approx** for a representative point chosen to stand for a region.

**Artemis candidate landing regions.** NASA named these nine in Oct 2024 for Artemis III. In May 2026 NASA made Artemis III an Earth-orbit test for 2027, so Artemis IV is now the first landing ([NASA](https://www.nasa.gov/missions/artemis/artemis-3/nasa-outlines-preliminary-artemis-iii-mission-plans/)). I found no revised region list. NASA has never published center points; the official footprints are in a USGS data release ([McClernan 2024, doi:10.5066/P1MEQ6UK](https://www.usgs.gov/data/down-selected-artemis-iii-candidate-landing-site-navigational-grids)).

**Updated in M2.** Moon Trek's polygons turned out to be the 2022 list, which covers six of the nine regions. A footprint's centroid can land on a slope, so each approximate site now uses the highest LOLA point inside its footprint. Peak near Cabeus B and Mons Mouton Plateau have no footprint, so they use the highest point within 7.5 km of their LROC mosaic center. The table below keeps the declared anchors; VALIDATION.md §3 lists how far each point moved and why.

| Site | Lat | Lon | Point used now | Source |
|---|---|---|---|---|
| Peak near Cabeus B | −83.6 | −68.8 | Center of the LROC NAC mosaic of the region | LROC NAC ROI `CABEUSPKLO1_P836S2912` |
| Haworth | −86.7 | −23.7 | LROC mosaic center | `HAWORTH_LO1_P867S3363` |
| Malapert Massif | −85.98 | −1.67 | IAU center of Mons Malapert | [Gazetteer 16338](https://planetarynames.wr.usgs.gov/Feature/16338) |
| Mons Mouton Plateau | −84.3 | 30.6 | LROC mosaic center (a large region; contains IM-2) | `MOUTNPLTLO1_P843S0306` |
| Mons Mouton | −85.4596 | 31.7805 | ESA "Leibnitz β Plateau" region-of-interest center (LP1) | [arXiv 1208.5587, Table 2](https://arxiv.org/pdf/1208.5587) |
| Nobile Rim 1 | −85.4 | 35.3 | Center of the LROC mosaic "Nobile Rim 1 and Mons Mouton" | `MTMOUTONLO1_P854S0353` |
| Nobile Rim 2 | −83.9 | 58.7 | LROC mosaic center | `NOBILE02LO1_P839S0587` |
| de Gerlache Rim 2 | −88.5 | −66.7 | Center of the LROC "de Gerlache Rim" mosaic (may span Rims 1 and 2) | `DEGERRIMLO1_P885S2933` |
| Slater Plain | pending | pending | No published point on the plain. The IAU Slater center (−88.08, 111.29) is inside the crater, so I won't use it. | Needs the USGS footprint |

LROC mosaic READMEs are under the [LROC PDS NAC_ROI directory](https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/DATA/BDR/NAC_ROI/).

**High-illumination points (exact, published).**

| Site | Lat | Lon | Published result | Source |
|---|---|---|---|---|
| Connecting ridge (Gläser C1) | −89.4398 | −137.17 | 88.0% mean solar disk visible, 2 m observer, 2017–2037 | [Gläser et al. 2018](https://ntrs.nasa.gov/api/citations/20170007365/downloads/20170007365.pdf) (same point as Gläser et al. 2014 CR1 spot 2: 87.9%) |
| Shackleton rim (Gläser) | −89.6866 | −162.81 | 85.5%, 2 m observer | Gläser et al. 2018 |

**CLPS landing sites (exact).**

| Site | Lat | Lon | Notes | Source |
|---|---|---|---|---|
| IM-2 Athena, as landed | −84.7906 | 29.1957 | Landed 6 Mar 2025, on its side in a 20 m crater | [LROC](https://lroc.im-ldi.com/images/1408) |
| VIPER planned area (center) | −85.42088 | 31.6218 | VIPER is now CLPS task order CS-7 on Blue Origin's second Blue Moon MK1, late 2027. NASA says only "South Pole region", so it's unconfirmed whether this site is kept. | [PSJ paper](https://iopscience.iop.org/article/10.3847/PSJ/ae061a), [NASA](https://www.nasa.gov/news-release/nasa-selects-blue-origin-to-deliver-viper-rover-to-moons-south-pole/) |

Upcoming CLPS missions with no published coordinates appear as notes on the nearest site, never as invented points:
- Griffin-1: Nobile crater region, 2026
- Blue Moon MK1 pathfinder: Shackleton connecting ridge, NASA event page says Jan 2027
- IM-4: Mons Mouton, 2027
- IM-5: Mons Malapert

**Contrast site for Explore mode.** Shackleton crater floor, permanently shadowed, labeled approx. The pipeline picks the lowest LOLA point within 3 km of the IAU crater center (89.67°S, 129.78°E). The IAU center itself is disputed by some sources, which is why I derive the point from the DEM.

**Validation points.** These stay in Python only and aren't shipped. Each has published illumination or Earth-visibility numbers:
- [Bussey et al. 2010](https://spudislunarresources.nss.org/Bibliography/p/98.pdf) points A–D and M1/M2
- Gläser 2018 C1, C2 and Shackleton, plus their surface-level variants
- Mazarico et al. 2011 C1 and Shackleton, as tabulated by Gläser 2018
- [Gläser 2014](https://elib.dlr.de/94242/1/EPSC2014-136-1.pdf) CR1 spots 2 (2 m) and 4 (10 m)
- [Speyerer & Robinson 2013](https://www.hou.usra.edu/meetings/leag2014/pdf/3066.pdf) stations 2 and 5
- [Bryant 2009](https://ipnpr.jpl.nasa.gov/progress_report/42-176/176C.pdf) B1, C1, MA and LB, which include Earth visibility (e.g. Malapert peak MA: Earth 100% any-part / 94.68% full disk)

## 8. Features, priorities and official requirements

Until the full statement is out, I've numbered the requirements in the official summary:

- **R1:** intuitive for planners, educators and the public
- **R2:** compare landing sites and dates quickly
- **R3:** show Sun and Earth positions relative to the horizon
- **R4:** assess power generation potential
- **R5:** assess direct-to-Earth communication windows

The 2025 judging criteria were Impact, Creativity, Validity, Relevance (including how deeply NASA data is used) and Presentation.

| Priority | Feature | Serves | Milestone |
|---|---|---|---|
| P0 | 1. Site picker: ≥ 8 cited sites as a list and on a polar map | R1, R2 | M3 |
| P0 | 2. Horizon panorama: azimuth 0–360°, elevation −5° to +15° (extends automatically for crater floors), terrain outline, Sun and Earth paths, disks at the current time, clear "blocked" state | R3 | M3 |
| P0 | 3. Time controls: date range within 2026–2030, scrubber, play/pause, speed, UTC labels | R2, R3 | M3 |
| P0 | 4. Metrics: illumination %, longest darkness, Earth visibility %, longest blackout, overlap windows | R4, R5 | M4 |
| P0 | 5. Timeline strip: sunlit, Earth visible, both | R2, R4, R5 | M4 |
| P1 | 6. Compare 2–3 sites: metrics table and aligned timelines | R2 | M4 |
| P1 | 7. 3D view: globe, fly to site, ground-level view lit by our Sun vector, Earth in the sky | R1, R3 | M5 |
| P1 | 8. Power and battery calculator | R4 | M4 |
| P1 | 9. Observer height toggle, 2 m / 10 m | R4, R5 | M4 |
| P1 | 10. Explore mode story and mini-challenge | R1 | M6 |
| P1 | 11. Share URL (site, dates, time) and CSV export of windows | R2, R5 | M4 |
| P1 | 11b. Earth-eclipse correction (new, §2 #6) | R4, Validity | M4 |
| P2 | 12. Drop a pin: rough horizon from a low-resolution DEM, computed in a worker | R2 | after M6 |
| P2 | 13. Average illumination and Earth-visibility map overlay (PGDA product 69, 85°S to the pole) | R1, R4, R5 | after M6 |
| P2 | 14. Mission date presets | R2 | after M6 |
| P2 | 15. DSN coverage row (new, §2 #14) | R5 | after M6 |

**Cut order if we fall behind:** all P2, then the 3D ground-level view (keeping the globe fly-to), then the rest of 3D, then the Explore mini-challenge. Compare, battery, observer height and URL/CSV are cheap once the worker exists, so they stay. P0 never breaks.

## 9. Design direction

This comes from the frontend design skill, applied to your brief: "mission control meets science museum", dark space theme, Sun yellow, Earth blue, never color alone.

**Subject.** The south pole under grazing light: a black, airless sky; grey regolith; a Sun that skims a jagged horizon and casts shadows kilometres long; and Earth hanging low and blue.

**Color (color means light).**

| Token | Hex | Use |
|---|---|---|
| Sky | `#000000` | Panorama sky and page background. The lunar sky really is black. |
| Shadow | `#1A1916` | Panels and raised surfaces |
| Regolith | `#5E5950` | Terrain silhouette, rules, inactive controls |
| Dust | `#B8B2A7` | Secondary text, axes, gridlines (10:1 on Sky) |
| Sunlight | `#FFC53D` | Sun disk and path, sunlit bars, "lit" states (13:1 on Sky) |
| Earthlight | `#5AB4FF` | Earth disk and path, Earth-visible bars, link states (9:1 on Sky) |

Primary text is `#EDE9E1`. "Both" is never a third hue: it is Sunlight and Earthlight together as stripes.

**Type.**
- Display: **Jost** (open-source, Futura lineage). The plaque Apollo 11 left on the Moon is set in Futura. Used only for view titles and site names.
- UI, data and body text: **Atkinson Hyperlegible Next**, from the Braille Institute. It keeps 0/O and 1/l/I distinct, which matters for coordinates and UTC times. It uses tabular figures wherever numbers line up; I'll check that the font supports them in M3 and fall back to IBM Plex Sans if not.
- Scale: ratio 1.25 (12, 14, 16, 20, 25, 31, 39 px). Nothing is set below 12 px.
- Everything is in sentence case, and Explore prose is capped at 68 characters per line.

**Layout.** Planner mode, desktop 1280 px and up. Every band shares one time cursor.

```
┌ CLPS Lunar Mission Browser        [ Plan | Explore ]           2027-03-14 06:00 UTC ┐
├──────────────┬──────────────────────────────────────────────────────────────────────┤
│ Sites        │ Horizon panorama (hero, full width)                                  │
│  Connecting… │   black sky, regolith silhouette, Sun ribbon, Earth ribbon,          │
│  Shackleton… │   disks at the cursor time, N E S W ticks, −5° … +15°                │
│  Malapert …  ├──────────────────────────────────────────────────────────────────────┤
│              │ ◀  ▶  1 h/s     ───────────●─────────────────────────  UTC scrubber  │
│ [polar map]  ├──────────────────────────────────────────────────────────────────────┤
│              │ Sunlight  ▮▮▮▮▯▯▮▮▮   Earth in view  ▨▨▨▯▨▨   Both  ▦▯▦▦            │
│ Compare (2/3)├───────────────────────────────┬──────────────────────────────────────┤
│              │ Metrics with plain meanings   │ Overlap windows, CSV, share link     │
└──────────────┴───────────────────────────────┴──────────────────────────────────────┘
```

Explore mode is phone-first: the panorama is a strip you drag to look around, with short story steps below it and a Next button. Text is left-aligned everywhere; numbers are right-aligned in tables.

**Principles.**
1. **Color is light.** Only sunlight and earthlight have color; everything else is regolith grey. Every colored element also has an icon and a label (a sun glyph, an Earth glyph), and timeline rows use patterns: solid, hatched and cross-hatched.
2. **The horizon is the interface.** The panorama leads every view, and the timeline and metrics follow its cursor.
3. **Give the number, then what it means.** For example: "Longest darkness 71.5 h: a battery must carry the load this long."
4. **One moment of motion.** On play, the Sun slides along the silhouette. There are no decorative animations, and reduced motion replaces playback with stepping.

**Checked against the generic default.** A default "space dashboard" would use a navy gradient, a starfield, neon cyan, a sci-fi display font and glass cards. I dropped all of them. Stars are left out on purpose (a daylit sky photographs black), and cards give way to one instrument panel on a shared time axis. The single bold element is the full-bleed panorama; everything around it stays quiet. Space Apps' own fonts (Fira Sans, Overpass) are used only on Space Apps-branded material such as the demo title card, following its brand guide. No NASA, CLPS or Artemis logos appear anywhere.

## 10. Milestones

After each one I run the tests, typecheck and build, check the app in the browser, commit, and send you a short summary covering what works, what's next and the risks.

| Milestone | Scope | Done when |
|---|---|---|
| M0 Setup | git init, .gitignore, MIT LICENSE; `/web` scaffold (Vite 8, React 19, TS 6.0, Tailwind 4, Zustand 5, Vitest 5); `/pipeline` uv project; kernels fetched; a test that rasterio can read a window of the 10 m COG over HTTP; DATA_SOURCES.md; AI_USAGE.md | Empty app builds and tests pass; spiceypy loads the meta-kernel; the window read returns heights |
| M1 Ephemeris and validation | ephemeris.bin; TS astro lib; fixtures; Horizons comparison | Vitest agrees with Python to ≤ 0.01°; Horizons agrees to ≤ 0.1° (I expect ≤ 0.001°); first VALIDATION.md table |
| M2 Horizon masks | DEM fetch and crops, sites.json, horizons.bin, basemap, pytest on synthetic terrain, one plot per mask | Smooth-sphere and synthetic-peak tests pass; every mask plotted and eyeballed; coverage check passes |
| M3 Picker, panorama, time | Site list and polar map, panorama, time controls | Pick a site, scrub and play: disks move along their paths, occlusion is visible, times are labeled UTC, everything works by keyboard |
| M4 Metrics, timelines, compare | Worker, metrics, timeline, compare, battery, observer height, URL and CSV, eclipse correction | Metrics match Python fixtures; 3-site compare works; CSV downloads; URL round-trips |
| M5 3D view | Lazy Cesium chunk: globe, fly-to, ground view with the Sun light direction, Earth, horizon ring | Works without a token; the Cesium chunk isn't loaded on first paint |
| M6 Explore and polish | Story, mini-challenge, phone layout, accessibility and performance pass | Works at 375 px; Lighthouse accessibility ≥ 95; reduced motion respected; first load < 3 s; 60 fps during playback |
| M7 Deploy and docs | README, About the method, Credits, VALIDATION.md, DEMO_SCRIPT.md, AI_USAGE.md | Vercel preview is live; production only after your OK; GitHub push only after your OK |

## 11. Schedule: two working days

**Day 1. Goal: a deployed P0 preview by evening.**

| Time | Work | Result |
|---|---|---|
| 09:00–09:30 | Re-read the official statement (if published); confirm answers to §14 | Final deltas |
| 09:30–10:30 | M0 setup; start DEM downloads in the background | Repo, app shell, venv, kernels |
| 10:30–12:00 | M1 ephemeris, fixtures, Horizons comparison | ephemeris.bin, first validation table |
| 12:00–12:30 | Break | |
| 12:30–14:30 | M2 sites.json, horizon masks, basemap, mask plots | horizons.bin, basemap |
| 14:30–17:30 | M3 site list and map, panorama, time controls | P0 features 1–3 |
| 17:30–18:00 | Break | |
| 18:00–20:30 | M4 part 1: metrics worker, timeline strip | P0 features 4–5 |
| 20:30–21:30 | Tests, typecheck, build, fixes; placeholder deploy, then the first preview | **Working P0 build, preview URL** |
| 21:30–22:30 | Literature sanity check, VALIDATION.md draft, Day 2 triage list | |

**Day 2. Goal: P1, polish, docs, demo.**

| Time | Work | Result |
|---|---|---|
| 08:00–08:30 | Fix the triage list | |
| 08:30–10:30 | M4 part 2: compare, observer height, URL and CSV, eclipse correction | P1 features 6, 9, 11 |
| 10:30–11:30 | Battery calculator | P1 feature 8 |
| 11:30–12:00 | Buffer | |
| 12:00–12:30 | Break | |
| 12:30–15:00 | M5 3D view. At 14:00, decide whether to stop at the token-free version. | P1 feature 7 |
| 15:00–17:00 | M6 Explore story and challenge, phone layout, accessibility, performance | P1 feature 10 |
| 17:00–17:30 | Break | |
| 17:30–19:00 | M7 README, About, Credits, validation, demo script, AI log; production deploy after your OK | Docs complete |
| 19:00–20:30 | Record the 30 s demo and build the 7-slide backup | Demo |
| 20:30–22:00 | Buffer: bugs, or P2 if ahead | |
| 22:00–23:00 | Final checks (public links, no login walls), submit | Submitted |

If you have teammates, split the work into three tracks: A, pipeline and validation; B, web UI; C, design, Explore copy, docs and demo.

## 12. Validation plan

All results go in VALIDATION.md.

1. **Browser vs Python (Vitest).**
   - Python exports fixtures for 3 sites × 24 epochs, including epochs between hourly samples.
   - The TS code must match every azimuth and elevation within 0.01°; I expect around 1e-5°.
   - Other tests cover: disk fraction against the analytic circular-segment formula for a flat horizon, run and window detection on synthetic series, and the battery drawdown on a hand-worked case.
2. **Python vs JPL Horizons.**
   - 3 sites spread in longitude × 5 dates across 2026–2030 × Sun and Earth, giving a table of Δaz and Δel. The target is ≤ 0.1°.
   - Both use mean-Earth lunar coordinates, so I expect ≤ 0.001°. Any residual is explained (DE441 vs DE440, gravitational deflection).
   - Plus a one-row WebGeocalc cross-check, and SPICE `azlcpo` as an internal check.
3. **Horizon masks.** pytest on a smooth sphere (dip of 0.0869° at 2 m, 0.1944° at 10 m) and on a synthetic cone of known height and distance. Every real mask is plotted and eyeballed against a hillshade.
4. **Illumination and Earth visibility against literature.** This runs on the validation points in §7.
   - **Like-for-like runs.** Python computes the ephemeris over each paper's own time span and observer height. For Gläser 2018 that is 2017–2037, hourly, at 2 m, so a gap can't come from a different period. The shipped app still covers 2026–2030 only.
   - **Matching definitions.** Illumination is reported as the mean visible disk fraction and as "any part visible". Earth visibility is reported as "any part", "full disk" and center-based, so each paper's definition has a matching number.
   - **Maps.** We also sample the PGDA Sun and Earth visibility maps at our sites. The 60 m maps cover 85°S to the pole. PDS also has 120 m and 240 m versions, which may cover the more northern sites; I'll check in M2.
   - **Target.** Within ~5 percentage points of the LOLA-based studies (Gläser, Mazarico). A larger gap gets explained, for example by DEM resolution (5–20 m vs 240 m) or pre-LOLA coordinates (Bussey used Kaguya data, Bryant used radar).
   - **Known inconsistencies.** Two conflicts in the sources are noted, not resolved: Speyerer & Robinson 2013 appears as both 94% and 92.1%, and Mazarico's rim darkness as both ~1.5 days and 141 h.
5. **Eclipse check.** On 3 Mar 2026, near-side sites should lose sunlight during the total lunar eclipse. Compare the timing with NASA's published eclipse contact times.
6. **Consistency.** The Sun disk crosses the horizon in the panorama at the same moments the timeline flips.
7. **Performance.** One site × 5 years at 10-minute steps runs in under 500 ms in the worker. Playback holds 60 fps in the Chrome performance panel.

## 13. Top risks and fallbacks

| Risk | Fallback |
|---|---|
| The 10 m DEM is 5 GB, and HTTP window reads through rasterio are untested on this machine | Test in M0. If they fail, download the PDS JP2 files whole instead (0.73 GB total, each under 1 GB, after a sign check), or use 20 m windows, and note each site's resolution |
| The Artemis regions have no published center points | Footprint centroids (or cited anchors), labeled "approx" (§7) |
| LOLA interpolation artifacts near the pole | Plot every mask; compare with literature; state it in the limitations |
| Cesium Moon trouble (token, license, 2.5 km height offset, shadow map fading at grazing Sun) | ion stays optional; a token-free globe with the horizon ring; place the camera from sampled tile height; `fadingEnabled = false`; 2.5 h timebox, then fall back to React Three Fiber (horizon ring plus a LOLA terrain patch) |
| Metrics too slow over 5 years | Worker, cache per (site, height, range), hourly mode for "rank all sites" |
| The full statement (Oct 28) adds requirements | Re-map §8; the architecture is generic |
| Horizons API limits | One request at a time, cached responses, custom User-Agent |
| Windows quirks (the `python` stub, a stray `PROJ_LIB`) | Always `uv run`; scripts clear `PROJ_LIB`/`PROJ_DATA` |
| Vercel's first deploy goes to production | Placeholder page first (§2 #12) |
| Demo limits (30 s or 7 slides in 2025) | Script written to 30 s, with a slide backup |
| Scope creep | The cut order in §8; P0 stays deployable at every commit |

## 14. Questions for you

1. **Team.** Solo, or who is on the team and what are their skills? This decides whether §11 runs as one track or three.
2. **Proposals in §2.** Approve all 14, or tell me which to drop.
3. **Sites.** Approve the 14 sites in §7, or add missions you care about. If Moon Trek's region GeoJSON turns out to be the 2022 list, I'll need the USGS data release. Its page showed my research agent a bot check, which I can't complete, so you might have to download that small file yourself.
4. **Downloads.** Approve about 1–1.5 GB of elevation data: two whole files (189 MB and 219 MB), roughly 70 MB of window reads per site, and 59 MB of illumination maps. No single download is over 1 GB.
5. **Python.** Use the CPython 3.11 you already have (my recommendation, no installs), or install 3.13 through uv? That would write to your user profile, outside this folder.
6. **Cesium ion.** Do you have an ion account? Should the submitted version default to the token-free 3D view (my recommendation, given the licensing rule), with ion as an extra?
7. **Vercel and GitHub.**
   - Will you log in to Vercel yourself (`npx vercel login`)? I'll add the Vercel CLI as a local dev dependency, so nothing is installed globally.
   - Are you OK with the placeholder-first deploy?
   - Will you create the GitHub repo in your browser, or may I install the GitHub CLI globally?
8. **Defaults.** Is a darkness threshold of 0% right (any sliver of Sun counts as light, so "dark" means fully dark)? Keep the Earth margin at 0°?
9. **Design.** Approve the direction in §9?
10. **Dates.** The UI covers 2026–2030, with ephemeris data to 2031-01-01. OK?
