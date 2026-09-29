# Validation

This file records how we checked the numbers the app shows. Each section says what was compared, how, and the result. To reproduce, run the scripts named in each section from `pipeline/` (`uv run python scripts/<name>.py`) and `npm test` from `web/`.

| Check | Target | Result | Status |
|---|---|---|---|
| 1. Browser vs Python az/el | ≤ 0.01° | 9.6e-5° | Pass |
| 2. Python vs JPL Horizons az/el | ≤ 0.1° | 8.9e-6° (pipeline), 5.8e-5° (browser) | Pass |
| 3. Horizon masks | Synthetic terrain exact | — | Pending (M2) |
| 4. Illumination and Earth visibility vs literature | Within ~5 points of LOLA-based studies | — | Pending (M4) |
| 5. Eclipse | Sunlight drops during the 3 Mar 2026 total lunar eclipse | — | Pending (M4) |
| 6. Performance | < 500 ms per site-range; 60 fps | — | Pending (M4/M6) |

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

Pending (M2).

## 4. Illumination and Earth visibility against literature

Pending (M4).

## 5. Eclipse

Pending (M4).

## 6. Performance

Pending (M4 and M6).
