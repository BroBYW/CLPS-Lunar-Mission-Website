# AI usage log

This project was built with help from Claude (Anthropic), running in Claude Code. Space Apps asks teams to disclose where and how AI tools were used, so this log records it as we go.

| Date (UTC+8) | What Claude did | What the team decided or checked |
|---|---|---|
| 2026-09-29 | Read PROMPT.md; checked the Space Apps rules on pre-hackathon work; researched data sources (NAIF SPICE kernels, JPL Horizons, LOLA elevation maps, site coordinates) and the current web stack; wrote PLAN.md | Chose to build before the event; approved PLAN.md with Claude's recommendations |
| 2026-09-29 | M0: set up git, the Vite/React/TypeScript app, the uv Python pipeline and the kernel download; wrote the geometry module and tests; checked SPICE against Horizons (Sun agrees to 3e-9°); tested windowed reads of the 10 m LOLA map; wrote DATA_SOURCES.md | — |
| 2026-09-29 | M1: wrote the ephemeris generator, the TypeScript geometry that mirrors the Python, fixture export, Vitest checks and the JPL Horizons comparison; drafted VALIDATION.md | — |
| 2026-09-30 | M2: wrote the site list and validation points, the LOLA elevation tiers and window planner, ray-cast horizon masks with synthetic-terrain tests, the representative-point rule for regions, the basemap and the visibility reference code | Ran the elevation download overnight |
