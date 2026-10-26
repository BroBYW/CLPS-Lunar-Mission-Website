# Validation

This file records how we checked the numbers the app shows. Each section says what was compared, how, and the result. To reproduce, run the scripts named in each section from `pipeline/` (`uv run python scripts/<name>.py`) and `npm test` from `web/` (§8 names one opt-in test).

| Check | Target | Result | Status |
|---|---|---|---|
| 1. Browser vs Python az/el | ≤ 0.01° | 9.6e-5° | Pass |
| 2. Python vs JPL Horizons az/el | ≤ 0.1° | 8.9e-6° (pipeline), 5.8e-5° (browser) | Pass |
| 3. Horizon masks | Synthetic terrain exact | Sphere dip within 2e-4°, mesa within 0.02° | Pass |
| 4. Illumination and Earth visibility vs literature | Within ~5 points of LOLA-based studies | Gläser points within 1.54 points (mean) and 2.1 h (longest dark); Earth within 5 points of NASA's PGDA map at 17 of 21 | Pass |
| 5. Eclipse | Sunlight drops during the 3 Mar 2026 total lunar eclipse | Timings fall inside NASA's contact windows at 3 sites | Pass |
| 6. Performance | < 500 ms per site-range; first load < 3 s; 60 fps | 5 years in 104–148 ms; first load about 1 s; 142 fps playback | Pass |
| 7. Accessibility | WCAG 2.1 AA | axe-core: 0 violations on every view | Pass |
| 8. 3D terrain sunlight | Matches the horizon masks | Synthetic shadows exact; agrees with the masks 99.8% of the time, sunlight within 1.4 points at every site | Pass |
| 9. Planning tools | Same numbers as the Plan view | Window finder equals the metrics on every window; mast masks match the Plan view's at 2 m; 3D-print files are watertight; DSN contact rule tested; pins within 5 points of the sites' sunlight at 12 of 13; rover rays agree with the masks 99.8% | Pass |
| 10. LRO photos (2009–2011) | Sunlit or in shadow as photographed | Sites: 99.3% of 2,281 photos that can tell (115 of 117 terrain shadows confirmed); whole photos: 98.3% of 62,221 km² agree | Pass |

## 1. Browser vs Python

**What.** The app interpolates the hourly float32 ephemeris (`web/public/data/ephemeris.bin`) and converts to azimuth and elevation in TypeScript (`web/src/lib/astro.ts`). Python computes the same quantities exactly with SPICE at each epoch: `spkpos` with LT+S in MOON_ME, then the site vector is subtracted.

**Cases.** 3 sites (Connecting ridge, Malapert Massif, Nobile Rim 2) × 24 epochs × Sun and Earth, giving 144 comparisons. The epochs include the first and last grid points and 21 random epochs at one-second resolution, so most fall between hourly samples. Fixtures are exported by `pipeline/scripts/export_fixtures.py`; the test is `web/src/lib/astro.test.ts`.

**Result.**

| Quantity | Max abs difference |
|---|---|
| Azimuth | 9.6e-5° |
| Elevation | 9.0e-5° |
| Angular radius | 2.7e-6° |

The remaining difference comes from linear interpolation within the hour. Earth's libration curves its path in the lunar sky by about 1e-4° per hour, which matches the observed error. It is 100× below the requirement.

## 2. Python vs JPL Horizons

**What.** The [Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html) was queried with a topocentric observer on the Moon: `CENTER='coord@301'`, `COORD_TYPE='GEODETIC'`, `SITE_COORD='lon,lat,0'`, `QUANTITIES='4'`, `EXTRA_PREC='YES'`. Horizons uses mean-Earth lunar coordinates, the same frame as our `MOON_ME`. Script: `pipeline/scripts/validate_horizons.py`. Raw values: `pipeline/validation/horizons_comparison.csv`.

We compared three Python methods against Horizons over 3 sites × 5 dates × Sun and Earth (30 rows):

| Method | Max abs Δaz | Max abs Δel |
|---|---|---|
| Pipeline: `spkpos` from the Moon's center, minus the site | 7.1e-7° | 8.9e-6° |
| SPICE `azlcpo`: light time and aberration from the site itself | 4.8e-7° | 2.5e-7° |
| Browser method: hourly float32, interpolated | 5.8e-5° | 4.0e-5° |

**Why the small differences.**
- The pipeline applies light time and stellar aberration at the Moon's center, not at the site. For Earth this shifts elevation by up to 9e-6° (0.03″); `azlcpo`, which corrects from the site itself, removes it.
- What remains (below 1e-6°) comes from Horizons using DE441 plus gravitational light deflection, where we use DE440 without deflection.
- The browser adds interpolation within the hour (see §1).

All three are more than 1,000× inside the 0.1° target.

| Site | UTC | Body | Horizons az / el (°) | Pipeline Δaz / Δel (°) | Browser Δaz / Δel (°) |
|---|---|---|---|---|---|
| Connecting ridge | 2026-03-03 11:30 | Sun | 141.9871 / -0.5803 | -2.5e-08 / -2.4e-07 | -1.7e-06 / -1.2e-06 |
| Connecting ridge | 2027-06-21 00:00 | Sun | 116.1261 / -1.3468 | +7.8e-09 / -9.0e-10 | -1.2e-06 / -2.6e-08 |
| Connecting ridge | 2028-10-05 06:45 | Sun | 116.3169 / 1.3263 | +1.3e-09 / +2.9e-10 | +1.5e-06 / +1.1e-05 |
| Connecting ridge | 2029-12-20 22:15 | Sun | 133.6917 / -0.4674 | -9.3e-08 / -2.1e-07 | +9.5e-07 / -9.6e-07 |
| Connecting ridge | 2030-08-14 13:05 | Sun | 128.4615 / 1.1089 | +5.3e-09 / +1.9e-09 | +3.8e-07 / +4.3e-06 |
| Connecting ridge | 2026-03-03 11:30 | Earth | 141.9085 / -1.1911 | -3.2e-07 / +4.1e-07 | -5.7e-05 / +6.2e-06 |
| Connecting ridge | 2027-06-21 00:00 | Earth | 137.7938 / -3.1138 | -3.6e-07 / +8.9e-06 | -3.7e-07 / +9.0e-06 |
| Connecting ridge | 2028-10-05 06:45 | Earth | 133.9612 / 5.8143 | -5.0e-07 / +7.0e-06 | +1.7e-05 / -4.0e-05 |
| Connecting ridge | 2029-12-20 22:15 | Earth | 133.4349 / -1.0340 | -3.4e-07 / -1.9e-07 | +3.1e-05 / +2.8e-06 |
| Connecting ridge | 2030-08-14 13:05 | Earth | 142.6262 / 5.8250 | -5.6e-07 / +6.0e-06 | -2.2e-05 / -1.9e-05 |
| Malapert Massif | 2026-03-03 11:30 | Sun | 6.5040 / 3.8553 | -9.9e-08 / -2.4e-07 | -1.8e-06 / -1.2e-06 |
| Malapert Massif | 2027-06-21 00:00 | Sun | 340.6183 / 2.6925 | -6.0e-08 / -2.2e-09 | -1.3e-06 / -6.6e-08 |
| Malapert Massif | 2028-10-05 06:45 | Sun | 340.7237 / 5.3703 | -6.6e-08 / -2.3e-09 | +1.1e-06 / +1.1e-05 |
| Malapert Massif | 2029-12-20 22:15 | Sun | 358.1893 / 3.9376 | -1.7e-07 / -2.1e-07 | +8.8e-07 / -9.5e-07 |
| Malapert Massif | 2030-08-14 13:05 | Sun | 352.9219 / 5.4468 | -6.7e-08 / +1.7e-09 | +2.4e-07 / +4.3e-06 |
| Malapert Massif | 2026-03-03 11:30 | Earth | 6.4246 / 3.2449 | -4.6e-07 / +4.2e-07 | -5.8e-05 / +6.3e-06 |
| Malapert Massif | 2027-06-21 00:00 | Earth | 2.3100 / 1.3177 | -4.9e-07 / +8.9e-06 | -5.0e-07 / +9.0e-06 |
| Malapert Massif | 2028-10-05 06:45 | Earth | 358.4004 / 10.2241 | -6.3e-07 / +6.9e-06 | +1.8e-05 / -4.0e-05 |
| Malapert Massif | 2029-12-20 22:15 | Earth | 357.9350 / 3.3690 | -4.7e-07 / -1.8e-07 | +3.1e-05 / +3.1e-06 |
| Malapert Massif | 2030-08-14 13:05 | Earth | 7.1633 / 10.2620 | -7.1e-07 / +6.0e-06 | -2.3e-05 / -1.9e-05 |
| Nobile Rim 2 | 2026-03-03 11:30 | Sun | 305.9763 / 3.4529 | -7.9e-08 / -2.5e-07 | -1.7e-06 / -1.4e-06 |
| Nobile Rim 2 | 2027-06-21 00:00 | Sun | 280.3249 / -0.0088 | -1.5e-08 / -5.1e-10 | -1.2e-06 / -1.6e-07 |
| Nobile Rim 2 | 2028-10-05 06:45 | Sun | 280.2115 / 2.6687 | -2.1e-08 / -4.0e-09 | +2.3e-07 / +1.1e-05 |
| Nobile Rim 2 | 2029-12-20 22:15 | Sun | 297.6970 / 2.7629 | -1.3e-07 / -2.2e-07 | +9.8e-07 / -8.6e-07 |
| Nobile Rim 2 | 2030-08-14 13:05 | Sun | 292.3231 / 3.7888 | -4.0e-08 / -3.4e-09 | -1.2e-07 / +4.3e-06 |
| Nobile Rim 2 | 2026-03-03 11:30 | Earth | 305.9304 / 2.8366 | -4.5e-07 / +3.8e-07 | -5.8e-05 / +8.4e-07 |
| Nobile Rim 2 | 2027-06-21 00:00 | Earth | 302.0170 / 0.5337 | -4.7e-07 / +8.9e-06 | -4.8e-07 / +9.0e-06 |
| Nobile Rim 2 | 2028-10-05 06:45 | Earth | 297.2999 / 9.0400 | -5.9e-07 / +6.9e-06 | +2.2e-05 / -3.8e-05 |
| Nobile Rim 2 | 2029-12-20 22:15 | Earth | 297.4735 / 2.1721 | -4.4e-07 / -2.2e-07 | +3.1e-05 / +5.9e-06 |
| Nobile Rim 2 | 2030-08-14 13:05 | Earth | 305.9976 / 9.8912 | -6.9e-07 / +5.9e-06 | -2.0e-05 / -2.1e-05 |

The 2026-03-03 11:30 epoch falls during the total lunar eclipse. From these sites the Sun and Earth centers are only about 0.6° apart, so Earth's disk (radius about 0.95°) covers the Sun. Section 5 reuses this case.

## 3. Horizon masks

**Synthetic terrain** (`pipeline/tests/test_horizon.py`):
- **Smooth sphere.** The computed horizon equals the exact dip, −acos(R/(R + h)): −0.0869° at 2 m and −0.1944° at 10 m, to within 2e-4° at every one of the 3,600 azimuths.
- **A 1,000 m mesa 20 km away.** The computed elevation angle is within 0.02° of the exact spherical value. The small residual comes from the test grid's 25 m pixels softening the mesa's edge.

**Physical consistency.** Raising the observer can only lower the horizon. Across all 14 sites and 3,600 azimuths (50,400 values), the 10 m horizon is below the 2 m horizon everywhere: by 0.44° on average, and never by less than 0.0018°.

**Coverage.** Every ray reaches 300 km on real data; the script stops if any sample falls outside all four maps. Every site has 10 m data to at least 20 km in every direction.

**Visual review.** Each mask is plotted in `pipeline/validation/masks/`, with an overview in `_sheet.png`.
- Peaks and rims have horizons near or below 0°: Malapert Massif, Mons Mouton, Nobile Rim 1, Peak near Cabeus B and the Connecting ridge.
- The Shackleton crater floor is walled in at 18–27°, which is why it never sees the Sun.

**Representative points for regions.** A region's centroid can land on a slope. In the first build, de Gerlache Rim 2's centroid sat at −88 m with a 15° horizon: a crater wall, not the rim the region was chosen for. Approximate sites now use the highest LOLA point inside the region's footprint. For the two regions without a footprint, they use the highest point within 7.5 km of the LROC mosaic center. The resolved de Gerlache point lies 2.9 km from Bryant's rim point C1 and 3.8 km from Bussey's point C, two published high-illumination spots.

| Site | Rule | Moved from anchor |
|---|---|---|
| Peak near Cabeus B | highest within 7.5 km | 1.2 km |
| Haworth | highest in footprint | 12.2 km |
| Malapert Massif | highest in footprint | 4.9 km |
| Mons Mouton Plateau | highest within 7.5 km | 4.8 km |
| Mons Mouton | highest in footprint | 0.7 km |
| Nobile Rim 1 | highest in footprint | 6.5 km |
| Nobile Rim 2 | highest in footprint | 13.0 km |
| de Gerlache Rim 2 | highest in footprint | 11.2 km |
| Shackleton crater floor | lowest within 3 km | 2.5 km |

Peak near Cabeus B shows why this matters. Moving 1.2 km from the mosaic center to the actual summit lowered its highest horizon from +6.5° to −0.5°: the mosaic center sits on the peak's own flank.

## 4. Illumination and Earth visibility against literature

**How.** `pipeline/scripts/validate_literature.py` runs each published point over its study's own period, hourly from 2017 to 2037 with exact SPICE positions (not the shipped 2024–2030 file), at the study's observer height. It reports every definition the studies use:
- mean visible fraction of the solar disk
- % of time any part of the Sun is visible
- % of time the whole disk is visible
- the same three for Earth

Two more comparisons test coordinate sensitivity:
- **High point.** The highest ground within 250 m of each published coordinate. Many papers give coordinates to 0.01° of latitude, about 300 m.
- **PGDA map.** NASA's PGDA average-visibility maps ([product 69](https://pgda.gsfc.nasa.gov/products/69), 60 m, share of time any part of the disk is visible), sampled at the same coordinates.

The full results are in `pipeline/validation/literature_comparison.csv`.

**Like for like: LOLA-based study, same observer heights (Gläser et al. 2014 and 2018, 20 m LOLA maps).**

| Point | Height | Published: mean / any / longest dark | Ours at the published point | Ours at the high point |
|---|---|---|---|---|
| Gläser 2018 C1, Connecting ridge | 2 m | 88.0% / 92.1% / 112 h | 87.0% / 91.7% / 114 h | 87.8% / 92.0% / 110 h (22 m away) |
| Gläser 2018 C2 | 2 m | 78.1% / 82.0% / 165 h | 78.0% / 82.0% / 164 h | 77.9% / 81.9% / 165 h (83 m) |
| Gläser 2018 Shackleton rim | 2 m | 85.5% / 89.4% / 66 h | 84.0% / 88.9% / 67 h | 85.2% / 89.4% / 67 h (28 m) |
| Gläser 2014 CR1 spot 2 | 2 m | 87.9% / 92.3% / 110.9 h | 87.3% / 92.0% / 113 h | 88.1% / 92.0% / 109 h (28 m) |
| Gläser 2014 CR1 spot 4 | 10 m | 91.9% / 95.66% / 76.1 h | 91.6% / 95.6% / 76 h | 92.4% / 95.5% / 77 h (113 m) |

At the published points the agreement is within 1.54 points for mean sunlight (on average 0.71 below), 0.50 points for any sunlight, and 2.1 h for longest darkness. At the nearest high ground it tightens to 0.49 points and 0.25 points. **This is the like-for-like test, and it passes.**

**At ground level (0 m) we come out lower.** Gläser's surface points give 76.0% and 81.0%; ours give 55.7% and 63.0% (64.8% and 68.7% at the high point). An eye at 0 m is shaded by bumps in the nearest tens of metres. Our 10 m map resolves more of that roughness than the studies' 20 m maps, so ground-level numbers depend on map resolution more than on the method. The app offers 2 m (lander) and 10 m (mast) observers, where the agreement is good.

**Against NASA's PGDA maps at the same coordinates.**
- **Earth visibility:** ours is within 5 points at 17 of 21 points, with a median difference of 1.3 points.
- **Sun visibility:** within 5 points at 10 of 21, with a median of 5.3. The larger gaps are on narrow ridges, where the map's 60 m pixels average over the crest, and where our observer height differs from the map's.

**Points from other maps don't transfer.** Several studies came before LOLA-grade control, or used other data: Bussey et al. 2010 (Kaguya DEM), Bryant 2009 (Goldstone radar DEM) and Speyerer & Robinson 2013 (camera images). Mazarico et al. 2011's points were also only available to us as coordinates rounded in Gläser 2018's table. At their published coordinates, both our model and NASA's PGDA map give much less light than the papers report:
- Mazarico's Shackleton point: 0.0% for us, 6.3% on the PGDA map, 86.7% published.
- Bryant's B1: 30.2% for us, 29.8% on the PGDA map, 97.0% published.

When the model and NASA's own map agree with each other and both disagree with the paper, the paper's coordinates are the likeliest cause. The high-point test confirms how sharp these peaks are: moving 51 m lifts Mazarico's Shackleton point from 0% to 72%, and moving 222 m lifts Speyerer's S2 from 34% to 62%. Coordinates measured on other maps and control networks cannot be used like for like on LOLA maps at this precision. We report them for transparency, not as a pass or fail.

**Known inconsistencies in the sources,** left unresolved:
- Speyerer & Robinson 2013 is quoted as both about 94% and 92.1% for its three-station set.
- Mazarico's rim darkness appears as both about 1.5 days and 141 h.

## 5. Eclipse

**What.** From the Moon, a lunar eclipse is Earth passing in front of the Sun. The app subtracts the part of the solar disk that Earth covers (`sun_fraction` in `pipeline/clps/visibility.py`, `sunFraction` in `web/src/lib/visibility.ts`). Script: `pipeline/scripts/validate_eclipse.py`, minute by minute on 3 Mar 2026 at three sites where the Sun stays clear of the terrain.

**NASA contacts** for the total lunar eclipse of 3 Mar 2026 ([NASA eclipse site](https://eclipse.gsfc.nasa.gov/OH/OH2026.html), UT):

| P1 | U1 | U2 | Greatest | U3 | U4 | P4 |
|---|---|---|---|---|---|---|
| 08:44 | 09:50 | 11:04 | 11:34 | 12:03 | 13:17 | 14:23 |

**Result** (UT, 2 m observer):

| Site | Dimming starts | Sun fully hidden | Sun back | Dimming ends |
|---|---|---|---|---|
| Malapert Massif | 09:27 | 10:55 | 12:06 | 13:34 |
| Nobile Rim 2 | 09:29 | 10:58 | 12:08 | 13:36 |
| Mons Mouton | 09:28 | 10:56 | 12:07 | 13:35 |

Every time falls where the geometry requires:
- A site starts dimming when it enters Earth's penumbra, between P1 and U1.
- It loses the whole Sun when it enters the umbra, between U1 and U2.
- It gets the Sun back between U3 and U4.
- It stops dimming between U4 and P4.

A single point is in the umbra for about 71 minutes, longer than the 59 minutes the whole Moon spends there.

Our model uses Earth's solid disk, while NASA enlarges the shadow slightly for the atmosphere, so each site's darkness could run a minute or so shorter than a shadow-based calculation. The ephemeris-level check for this epoch is in §2: Horizons puts the Sun and Earth 0.6° apart at 11:30 UT.

**Where it matters.** Totality leaves near-side sites without sunlight for over an hour while the Sun is otherwise up. The battery simulation in the app includes it.

## 6. Performance

Measured in Chrome on this development machine, dev build, Web Worker, 10-minute steps:

| Range | Samples | Series in the worker | Round trip | Metrics |
|---|---|---|---|---|
| 5 years (2026–2030), one site | 262,944 | 103–136 ms | 104–148 ms | 7–14 ms |

That is about 4× under the 500 ms target. Changing the darkness threshold or Earth margin only reruns the metrics (under 15 ms), because the series stores the visible fraction and Earth's clearance above the terrain.

**First load** (production build served locally; broadband estimate assumes 25 Mbit/s and a 50 ms round trip):

| Page | What loads | Largest paint (local) | Estimated on broadband |
|---|---|---|---|
| Planner (shared link) | App JS 100 kB gzip, CSS 6 kB, fonts 59 kB, data 1.77 MB (ephemeris, horizons, basemap, sites). No Cesium. | 184 ms | 0.8–1.0 s |
| Home page | The same first, then CesiumJS (1.36 MB gzip, lazy), Cesium's worker and asset files, and the Moon model with its LOLA relief map (4.54 MB): 7.65 MB in all | 64 ms (headline); the Moon model is in by 0.5 s | Text in about 0.3 s, live Moon in about 2.5–3 s (a static Moon shows until then) |

Both are under the 3 s target. Cesium never loads for the Plan, Compare or Explore views.

**Frame rate during playback** (Plan view, production build, 1 day per second): 571 frames in 4 s, a mean of 142 fps, which is the display's refresh limit. The 95th percentile is 7.0 ms per frame and the worst frame 13.9 ms; none took over 20 ms. The target was a steady 60 fps.

**3D terrain** (dev build, this machine, 1.25× display, drawn at full resolution): a site's six terrain meshes build in 150–190 ms. One update of the terrain's sunlight takes 79 ms in Node on this machine, so during playback the worker refreshes it about 12 times a second. With the four meshes used until October 2026 these were 100–160 ms and 54 ms (about 17 a second), and orbiting or standing ran at 143 fps, the display's limit; the frame rate was not re-measured with six.

## 7. Accessibility

Checked with [axe-core](https://github.com/dequelabs/axe-core) 4.13 against WCAG 2.1 A and AA plus best practices, including color contrast. Every view has **0 violations**:
- Home
- Plan, including the mast planner
- Compare
- Find dates (checked 26 Oct 2026, when it was added)
- Explore, at step 1 and at the challenge with every site shown
- 3D, in globe view, over the terrain and standing at a site, and with the 3D-print panel

The same check at a 375 px phone width (headless Chrome, 30 Sep 2026) also finds 0 violations on Home, Plan, Compare, 3D, Explore and Credits. At 360 px and 390 px, no view scrolls sideways.

Beyond the automated check:
- **Keyboard.** Everything works from the keyboard: sites are a radio group, all controls are buttons or inputs, and the panorama takes focus and responds to arrow keys, + and −, and 0. The standing view in 3D takes focus too: arrow keys look around, + and − zoom.
- **Reduced motion.** It is respected: playback steps once a second instead of animating, the home page entrance and Moon rotation are off, and "Let's start" skips the flight.
- **Text alternatives.** Each chart has one: the panorama has a live description of the Sun and Earth positions, the timeline a text summary, and the windows are a real table. The map describes itself, and the site list duplicates it.
- **Never color alone.** The Sun and Earth always carry an icon and a label, and the timeline rows use solid, hatched and striped fills.

## 8. 3D terrain sunlight

**What.** The 3D view draws LOLA terrain from six grids per site (7.5 m spacing to 1.5 km, 30 m to 6 km, 120 m to 24 km, 240 m to 48 km, 600 m to 120 km, 1.5 km to 300 km). It works out which ground the Sun reaches from those grids alone (`web/src/lib/terrain.ts`, run in a Web Worker). It was checked two ways.

**Synthetic terrain** (`web/src/lib/terrain.test.ts`, part of `npm test`):
- **Smooth Moon.** Every node is lit or dark exactly where the Sun's center is above or below its local horizon, within 2.5 grid steps. This holds for four Sun azimuths and elevations from −0.2° to 1.6°.
- **Ridge shadow.** A 500 m ridge with the Sun 2° up shades the ground behind it for the 16.4 km that geometry predicts, curvature included.
- **Distant massif.** A 4 km massif 100 km away hides the Sun from the site when it is 0.3° up. Without the massif, the site is lit.
- **Partial Sun.** A ridge top in line with the Sun's center gives a partly visible disk.

**Against the horizon masks** (`web/src/lib/terrain.validation.test.ts`; run with `CLPS_VALIDATE=1 npx vitest run src/lib/terrain.validation.test.ts` from `web/`). Every 2 hours for 28 days from 1 Jan 2027, the test compares two things 2 m above each site: the Sun as the 3D terrain sees it, and the share of the Sun visible over the mask. That is 4,704 samples across all 14 sites.

| Site | Agree on "more than half the Sun visible" | Sunlight, masks | Sunlight, 3D terrain |
|---|---|---|---|
| Peak near Cabeus B | 100.0% | 68.0% | 68.6% |
| Haworth | 99.7% | 84.8% | 86.2% |
| Malapert Massif | 99.7% | 74.3% | 74.5% |
| Mons Mouton Plateau | 100.0% | 56.4% | 56.5% |
| Mons Mouton | 99.7% | 77.1% | 77.1% |
| Nobile Rim 1 | 99.7% | 69.8% | 70.4% |
| Nobile Rim 2 | 100.0% | 56.3% | 56.4% |
| de Gerlache Rim 2 | 99.7% | 90.7% | 91.0% |
| Connecting ridge | 100.0% | 100.0% | 100.0% |
| Shackleton rim | 100.0% | 98.3% | 98.8% |
| IM-1 Odysseus landing site | 99.7% | 40.9% | 41.0% |
| IM-2 Athena landing site | 99.7% | 50.5% | 50.8% |
| VIPER mission area | 99.7% | 65.0% | 66.0% |
| Shackleton crater floor | 100.0% | 0.0% | 0.0% |

**Result.** They agree 99.8% of the time. The 3D terrain comes out up to 1.4 points sunnier (Haworth), because its grids beyond 1.5 km are coarser than the maps behind the masks and smooth away some peaks. With the four grids used until October 2026 the gap was up to 2.4 points. The decorative craters near a standing observer only shape the shading, so they play no part here. The 3D view also lights the ground itself. On a high point with the Sun below the local horizontal, the ground within a few hundred meters hides the Sun from your feet, even while a 2 m observer still sees it. So the 3D view is a picture of the place, and every number in the app comes from the masks.

**Earth's rotation.** The subsolar point was read back from the drawn Earth's orientation. The expected longitude is (12 h − UTC − equation of time) × 15°.

| Time (UTC) | Drawn | Expected |
|---|---|---|
| 21 Dec 2026, 12:00 | 23.5° S, 1.0° W | 23.4° S, 0.5° W |
| 20 Mar 2027, 12:00 | 0.3° S, 1.6° E | 0°, 1.9° E |
| 21 Jun 2027, 00:00 | 23.4° N, 179.9° E | 23.4° N, 180° |
| 23 Sep 2027, 18:00 | 0.1° S, 92.2° W | 0°, 92.0° W |

## 9. Planning tools

**Find dates** (`web/src/lib/finder.test.ts`, part of `npm test`). The finder scores every start day from one series per site with running sums, instead of recomputing each window. On a synthetic 60-day series with darkness and blackouts of hours to days, every 7-day window gives the same sunlight, Earth and both shares as `computeMetrics` on that slice (to 0.001 point) and exactly the same longest darkness and blackout. The list of best windows is sorted and never holds two overlapping windows of one site. In the app, a window opened from the finder shows the same numbers in the Plan view; the finder samples hourly, the Plan view every 10 minutes.

**Mast height.** The mast masks (2–50 m) come from the same ray casting as the app's 2 m and 10 m masks, stored to 0.01°. At the VIPER mission area for June 2027, the mast planner's 2 m row gives 28.0% sunlight and at least 393 h of darkness, exactly as the Plan view, and 65.7% Earth in view against 65.8%: the 0.01° rounding moves the Earth's center across the skyline for one more 10-minute sample. The interpolated height for a target is checked in `web/src/lib/mast.test.ts`.

**3D print** (`web/src/lib/stl.test.ts`). The STL is a closed solid: every edge belongs to exactly two triangles, running in opposite directions, so slicers read it as watertight. It spans the requested width and sits on a flat base. Real files are 82,400 triangles (4.1 MB) and build in under 50 ms.

**Deep Space Network contact** (`web/src/lib/dsn.test.ts`). The interpolation of the hourly elevations and the rule for contact (Earth above the site's skyline and at least one complex with the Moon 10° up) are checked on a hand-made table. Across 2024–2030 each complex has the Moon above 10° for 41–42% of the time, as expected for stations at about 35–40° latitude, and at least one of them for 98.2%.

**Dropped pins** (`web/scripts/pin-vs-sites.ts`). A pin's horizon comes from the 480 m pin grid instead of the 10 m maps. Dropping one exactly on each listed site south of 82°S and comparing 2027 at 2 m:

| Site | Sunlight, site / pin | Longest darkness, site / pin | Earth in view, site / pin | Mean horizon difference |
|---|---|---|---|---|
| Peak near Cabeus B | 65.1% / 63.6% | 297 / 307 h | 78.9% / 82.4% | 0.68° |
| Haworth | 69.3% / 72.3% | 373 / 337 h | 73.7% / 73.6% | 0.34° |
| Malapert Massif | 64.5% / 79.1% | 339 / 332 h | 79.1% / 80.1% | 0.61° |
| Mons Mouton Plateau | 50.1% / 51.3% | 384 / 373 h | 99.4% / 88.7% | 0.19° |
| Mons Mouton | 65.2% / 65.2% | 298 / 295 h | 97.8% / 99.1% | 0.30° |
| Nobile Rim 1 | 64.8% / 65.4% | 298 / 303 h | 75.7% / 72.0% | 0.38° |
| Nobile Rim 2 | 49.9% / 49.7% | 383 / 385 h | 71.9% / 78.0% | 0.11° |
| de Gerlache Rim 2 | 80.5% / 78.8% | 144 / 162 h | 54.3% / 54.2% | 0.23° |
| Connecting ridge | 87.7% / 92.3% | 111 / 86 h | 51.1% / 51.1% | 0.53° |
| Shackleton rim | 84.4% / 83.8% | 65 / 73 h | 46.0% / 45.1% | 0.18° |
| IM-2 Athena | 43.7% / 44.3% | 412 / 407 h | 80.4% / 80.7% | 0.15° |
| VIPER mission area | 48.8% / 51.2% | 521 / 496 h | 62.2% / 68.7% | 0.58° |
| Shackleton crater floor | 0.0% / 0.0% | all year / all year | 0.0% / 0.0% | 0.35° |

Sunlight agrees within 5 points at 12 of the 13 sites. Malapert Massif is the exception: its summit is a sharp peak that the 480 m grid rounds off, so the pin sees 15 points more sunlight. That is why pins are labelled as a first look. The ray caster itself is checked on a smooth sphere (the 2 m and 10 m dips within 0.005°) and on a wall at a known distance (`web/src/lib/pinHorizon.test.ts`). A pin takes about 150 ms to cast.

**Past landings.** The replays use the published landing points and times. For IM-2 Athena, the time from landing to NASA's end-of-mission time is 12.7 h, matching the "about 13 hours" reported. At touchdown the Sun was 2.5° above the horizontal on the plateau: a low Sun that a lander lying on its side in a crater could hardly use.

**Rover drive** (`web/src/lib/rover.test.ts` and `web/scripts/rover-vs-masks.ts`). The rover looks at the skyline with just two rays over the site's 3D terrain grids, toward the Sun and toward Earth. The tests check routes, heights from the finest grid, a smooth sphere's dip and a wall at a known distance. Standing a rover at each site's own point every 6 hours through 2027, its rays agree with the horizon masks on whether more than half the Sun is visible 99.8% of the time, and on whether Earth is in view 99.9% (20,440 samples, 14 sites). Away from the site, the grids coarsen with distance from the site, as in the 3D view.

## 10. LRO photos

Sections 1–9 compare the app with other models and with NASA's ephemerides. This one compares it with photos of the place itself. LRO's Wide Angle Camera photographed the south pole about every two hours from September 2009 to December 2011, and LROC published 8,170 of those photos as map-projected frames: polar stereographic, 100 m per pixel, 80–90°S, in I/F (the WAC polar movie frames of Speyerer and Robinson 2013). A photo shows where the Sun was shining at one moment. The app knows nothing about the photos: its horizons and terrain come from LOLA altimetry and its Sun from SPICE.

**Brightness threshold.** In the photos, shadowed ground has I/F below about 0.0002 (light scattered off nearby slopes) and sunlit ground peaks near 0.024, with a broad, flat valley between about 0.002 and 0.007. Ground counts as sunlit above I/F 0.003, a value read off one frame's full-resolution histogram before any comparison with the app. LROC's 400 m browse images are a fixed linear stretch of I/F: against the full-resolution I/F of frames from April 2010, December 2010 and July 2011, DN = 4,235 · I/F + 0.5 (±0.3), saturating at I/F 0.06.

**Sites, sunlit or not** (`pipeline/scripts/lro_photos.py`). Every eighth frame, 1,022 from 20 September 2009 to 11 December 2011, read through its 400 m browse image (0 marks no data). For each site a frame covers, the app's prediction is the visible fraction of the Sun from the site's 2 m horizon mask at the frame's time (Sun from SPICE at the middle of the 6-minute pass). Only photos where the terrain decides count: some of the Sun must clear the lowest point of the site's skyline. The Sun never does at Shackleton's floor, so it has no row.

The first rule tried was "the mask gives the whole Sun, so the site is sunlit". It agreed with the photos 80.1% of the time (4,082 photos), and all 801 misses were photos showing dark ground where the whole Sun was expected. Every one had grazing light. From peaks and plateaus the Sun can be visible below the level horizon, and at the pole it never rises far above it, while a photo shows the ground, not a mast. So the rule now also asks how bright the ground would be in full sunlight: the Lommel–Seeliger brightness, μ0/(μ0 + μ), of the 30 m terrain facets inside the photo's 400 m pixel, times 0.14 (the median brightness scale fitted to the full-resolution photos below). A site is expected sunlit when its mask gives the whole Sun and that I/F is at least twice the threshold; expected in shadow when the mask gives no Sun; and not called otherwise (part of the Sun visible, or light too faint to tell from shadow).

| Site | Photos | Called | Agree | Sun expected, photo dark | Shadow expected, photo lit |
|---|---|---|---|---|---|
| Peak near Cabeus B | 127 | 79 | 100.0% | 0 | 0 |
| Haworth | 300 | 123 | 100.0% | 0 | 0 |
| Malapert Massif | 229 | 120 | 97.5% | 0 | 3 |
| Mons Mouton Plateau | 121 | 75 | 100.0% | 0 | 0 |
| Mons Mouton | 199 | 106 | 100.0% | 0 | 0 |
| Nobile Rim 1 | 187 | 93 | 98.9% | 0 | 1 |
| Nobile Rim 2 | 128 | 109 | 100.0% | 0 | 0 |
| de Gerlache Rim 2 | 845 | 523 | 100.0% | 0 | 0 |
| Connecting ridge | 941 | 299 | 99.0% | 0 | 3 |
| Shackleton rim | 969 | 464 | 98.7% | 2 | 4 |
| IM-1 Odysseus landing site | 49 | 48 | 95.8% | 0 | 2 |
| IM-2 Athena landing site | 127 | 110 | 100.0% | 0 | 0 |
| VIPER mission area | 209 | 132 | 100.0% | 0 | 0 |

2,281 of 4,431 photos could be called, and 99.3% of them agree. The hardest calls, 117 photos where the Sun stood above the level horizon but the mask said terrain hid it, show dark ground in 115. With the Sun within 1° of the skyline, 97.5% agree (475 photos). The threshold hardly matters: 99.2% agree at I/F 0.002 (2,722 photos called) and 99.2% at 0.005 (1,425). Every one of the 15 misses is within 4 DN of the threshold, or has the Sun within 0.6° of the skyline, where part of a 400 m pixel can see a Sun that the site's own point cannot (as on Malapert Massif's sharp summit).

**Whole photos against the lit terrain** (`web/scripts/lro-vs-model.ts`, the Plan view's photo comparison). Two frames per site, never chosen by whether photo and app agree: one where the site's mask gives the whole Sun and one where it gives none, the Sun from directions at least 60° apart when possible, the 48 km showing both light and shadow, and the crop as fully covered as the frames allow (IM-1 lies at their edge, so its photos cover 57%). For each, the 48 km around the site at full resolution (one byte range of the I/F image) against the site's 120 m terrain grid, lit for the photo's moment by the 3D view's shadow code (`web/src/lib/terrain.ts`). Brightness follows the Lommel–Seeliger law for a camera looking straight down, with one scale fitted to each photo where both show sunlit ground (median 0.142, range 0.107–0.183); the shadows are not fitted. Ground counts as sunlit in either picture above I/F 0.003.

| Site | Photo (UTC) | Sun elevation, azimuth | Photo covers | Agree | Sunlit in the app only | Sunlit in the photo only | Sunlit in both, of sunlit in either |
|---|---|---|---|---|---|---|---|
| Peak near Cabeus B | 2011-01-16 11:40 | −2.3°, 106° | 2,304 km² | 99.9% | 0.0% | 0.0% | 66.3% |
| Peak near Cabeus B | 2011-11-24 15:04 | −0.9°, 259° | 2,257 km² | 99.3% | 0.2% | 0.5% | 96.6% |
| Haworth | 2010-03-04 21:51 | 2.0°, 333° | 2,304 km² | 98.5% | 0.6% | 0.9% | 95.7% |
| Haworth | 2011-05-30 01:44 | −2.6°, 233° | 2,294 km² | 98.7% | 1.2% | 0.1% | 84.1% |
| Malapert Massif | 2011-01-25 10:32 | 0.3°, 287° | 2,269 km² | 98.5% | 0.6% | 1.0% | 94.5% |
| Malapert Massif | 2011-08-30 12:19 | −2.3°, 158° | 2,294 km² | 99.1% | 0.5% | 0.4% | 96.8% |
| Mons Mouton Plateau | 2010-11-28 08:18 | −1.8°, 243° | 2,299 km² | 99.1% | 0.7% | 0.2% | 85.3% |
| Mons Mouton Plateau | 2011-12-02 10:55 | 2.7°, 63° | 2,299 km² | 97.8% | 1.1% | 1.0% | 93.5% |
| Mons Mouton | 2010-09-08 14:50 | −2.5°, 147° | 2,257 km² | 98.8% | 0.7% | 0.5% | 95.8% |
| Mons Mouton | 2010-12-25 17:46 | −0.0°, 270° | 2,294 km² | 98.3% | 1.1% | 0.6% | 95.6% |
| Nobile Rim 1 | 2011-04-13 12:01 | 3.1°, 21° | 2,283 km² | 98.6% | 0.8% | 0.7% | 95.3% |
| Nobile Rim 1 | 2011-07-03 11:20 | −1.4°, 113° | 2,299 km² | 99.5% | 0.2% | 0.3% | 98.4% |
| Nobile Rim 2 | 2009-12-21 09:30 | 2.7°, 69° | 2,290 km² | 97.7% | 0.3% | 2.0% | 96.0% |
| Nobile Rim 2 | 2011-07-17 22:10 | 1.7°, 278° | 2,299 km² | 99.0% | 0.4% | 0.6% | 93.1% |
| de Gerlache Rim 2 | 2009-10-02 07:51 | 1.6°, 87° | 2,287 km² | 92.1% | 0.3% | 7.6% | 83.5% |
| de Gerlache Rim 2 | 2011-09-03 06:45 | 0.1°, 182° | 2,299 km² | 99.7% | 0.2% | 0.1% | 94.2% |
| Connecting ridge | 2009-12-11 23:16 | 1.3°, 16° | 2,294 km² | 98.0% | 0.2% | 1.8% | 94.4% |
| Connecting ridge | 2010-06-23 00:42 | −0.8°, 184° | 2,294 km² | 99.4% | 0.3% | 0.2% | 93.5% |
| Shackleton rim | 2010-06-26 19:09 | −0.5°, 163° | 2,294 km² | 99.1% | 0.6% | 0.3% | 94.3% |
| Shackleton rim | 2010-10-04 01:30 | 1.8°, 31° | 2,259 km² | 98.6% | 0.3% | 1.1% | 96.1% |
| IM-1 Odysseus landing site | 2010-07-03 15:09 | 0.9°, 276° | 1,325 km² | 97.8% | 1.5% | 0.7% | 92.2% |
| IM-1 Odysseus landing site | 2011-05-13 17:39 | 5.8°, 48° | 1,325 km² | 97.9% | 0.9% | 1.2% | 96.1% |
| IM-2 Athena landing site | 2010-04-24 12:01 | 3.3°, 24° | 2,298 km² | 97.5% | 1.1% | 1.4% | 94.7% |
| IM-2 Athena landing site | 2011-06-22 00:08 | −0.7°, 260° | 2,304 km² | 97.9% | 1.3% | 0.8% | 93.4% |
| VIPER mission area | 2010-11-14 18:12 | 4.1°, 49° | 2,299 km² | 98.6% | 0.3% | 1.1% | 95.9% |
| VIPER mission area | 2011-09-11 01:25 | 6.0°, 347° | 2,299 km² | 98.6% | 0.2% | 1.2% | 96.6% |
| Shackleton crater floor | 2009-10-22 06:56 | 1.9°, 17° | 2,299 km² | 96.7% | 0.6% | 2.7% | 90.7% |
| Shackleton crater floor | 2009-10-23 01:48 | 1.9°, 7° | 2,299 km² | 96.4% | 0.6% | 3.0% | 90.7% |

Over the 62,221 km² in all, 98.3% of the ground is sunlit in both or in shadow in both: 0.6% is sunlit in the app only and 1.2% in the photo only. Of the ground sunlit in either picture, 94.0% is sunlit in both; that share means little in Peak near Cabeus B's first photo, where almost nothing is lit. The differences are mostly thin strips along shadow edges, where the Sun is so low that a few metres of height move an edge by hundreds of metres, where the photo's 100 m pixels meet the terrain's 120 m grid, and where light scattered off bright slopes lifts the photo's shadows. The weakest photo, de Gerlache Rim 2 on 2 October 2009 (92.1%), comes from early in the mission and has stray-light haze in the shadow of de Gerlache crater and seam-like stripes in one corner; the haze lifts 7.6% of its shadowed ground above the threshold.
