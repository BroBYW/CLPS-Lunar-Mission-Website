# AI usage log

This project was built with help from Claude (Anthropic), running in Claude Code. Space Apps asks teams to disclose where and how AI tools were used, so this log records it as we go.

| Date (UTC+8) | What Claude did | What the team decided or checked |
|---|---|---|
| 2026-09-29 | Read PROMPT.md; checked the Space Apps rules on pre-hackathon work; researched data sources (NAIF SPICE kernels, JPL Horizons, LOLA elevation maps, site coordinates) and the current web stack; wrote PLAN.md | Chose to build before the event; approved PLAN.md with Claude's recommendations |
| 2026-09-29 | M0: set up git, the Vite/React/TypeScript app, the uv Python pipeline and the kernel download; wrote the geometry module and tests; checked SPICE against Horizons (Sun agrees to 3e-9°); tested windowed reads of the 10 m LOLA map; wrote DATA_SOURCES.md | — |
| 2026-09-29 | M1: wrote the ephemeris generator, the TypeScript geometry that mirrors the Python, fixture export, Vitest checks and the JPL Horizons comparison; drafted VALIDATION.md | — |
| 2026-09-30 | M2: wrote the site list and validation points, the LOLA elevation tiers and window planner, ray-cast horizon masks with synthetic-terrain tests, the representative-point rule for regions, the basemap and the visibility reference code | Ran the elevation download overnight |
| 2026-09-30 | M3: wrote the Planner view: site list and polar map, the horizon panorama (zoom, pan, follow, occlusion, minimap, keyboard), UTC time controls and playback, observer height toggle; TypeScript visibility code checked against Python fixtures | — |
| 2026-09-30 | M4: wrote the metrics, series and battery code (checked against Python fixtures), the Web Worker, timeline strip, metrics panel, windows table and CSV export, power panel, compare view and shareable URLs; ran the eclipse and literature validations and wrote VALIDATION.md §4–§6 | Proposed a home page with "Let's start" and asked about 3D |
| 2026-09-30 | M5: built the home page from the team's layout reference (left-anchored hero, pill and play buttons, badge) with a live Cesium Moon lit by the real Sun and a fly-down to the pole; built the 3D view (globe, fly to site, standing view with the computed skyline, Sun and a lit Earth); found and worked around a Cesium globe-lighting startup issue | Supplied the home-page idea and the layout reference; Claude declined the reference's stock video (unknown host) and placeholder social proof |
| 2026-09-30 | M6: wrote Explore mode (a six-step guided story with live numbers, ending in a landing-site challenge), phone layouts, the axe-core accessibility audit and fixes, and first-load and frame-rate measurements; recorded them in VALIDATION.md §6–§7 | — |
