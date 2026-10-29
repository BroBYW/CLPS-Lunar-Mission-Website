<!--
How to use this file
1. After Oct 28, 2026: paste the official challenge statement, requirements and resource links into section 0, and fill in the Team line.
2. On Nov 14, 2026 (hackathon start): open a new Claude Code session in this folder, switch to Plan mode, and paste this file (or say "Read PROMPT.md and follow it").
Space Apps rules: no project work before the hackathon starts.
-->

# Project: CLPS Lunar Mission Browser — NASA Space Apps Challenge 2026

You are my lead engineer for a hackathon project. I'm comfortable with React + TypeScript + Vite and deploy on Vercel. I work on Windows (PowerShell). Work only inside this folder.
Team: [names + skills, or "solo"]

## 0. Official challenge (source of truth)
Challenge page: https://www.spaceappschallenge.org/2026/challenges/clps-lunar-mission-browser/
Official statement (pasted 2026-10-29):

### Background
NASA's Commercial Lunar Payload Services (CLPS) program and other lunar missions depend on careful selection of landing sites and dates that balance the needs of both science and engineering teams. One of the most significant challenges in this process is understanding the local lighting and communication environment at a potential landing site. The position of the Sun determines power availability for solar arrays and thermal conditions for equipment, while the position of Earth determines whether direct communication is possible without relay satellites.

This challenge is particularly acute at the Moon's south pole, where many future missions are planned due to the presence of water ice and other scientifically valuable resources. The south pole's geometry creates extreme variations in solar illumination and Earth visibility across different lunar days and seasons. Small changes in landing location or date can dramatically affect both power generation potential and communication windows, making rapid site evaluation critical.

In practice, mission development rarely proceeds on a fixed timeline. Hardware development challenges, launch delays, or other factors often force mission planners to reconsider their original landing date and location. When this happens, engineers need to quickly evaluate alternative sites in the same region, or alternative dates at the same site, to understand how these changes impact mission feasibility. A tool that enables rapid, intuitive comparison of multiple scenarios would accelerate this decision-making process and help teams identify viable alternatives when constraints shift.

Tools that provide this information — such as NASA's Quickmap, Moon Trek, and the JPL Horizons System — are built for detailed analysis and are often difficult for non-specialists to use effectively for rapid scenario comparison. Evaluating each site-data combination means navigating multiple interfaces and interpreting raw data. This leaves a gap between the technical data available and the accessible tools needed to support agile mission planning. An intuitive interface that translates complex ephemeris and topographic data into clear, comparable visualizations could help bridge that gap.

### Objectives
Your challenge is to create a tool or application that enables rapid evaluation of lunar landing site options. Your solution may include:

* Interactive site selection and comparison: You may consider allowing users to choose from a curated list of notable landing sites – such as past Apollo missions, future CLPS mission targets, targets of other commercial lunar missions, or landing sites from other countries' lunar programs – as well as the ability to input custom lunar coordinates. You may also consider enabling side-by-side or sequential comparison of multiple sites to help users quickly assess trade-offs.
* Date and time flexibility: You may consider allowing users to select landing dates and times, and providing tools to explore how conditions change across different lunar days or seasons. This enables users to understand how mission schedule adjustments affect feasibility.
* Sun and Earth position visualization: Display the positions of the Sun and Earth relative to the horizon at a selected landing site on a chosen date. You may consider showing how much time remains before sunset or Earthset, as this directly impacts mission operations and power generation windows.
* Power and communication assessment: You may consider highlighting key metrics such as solar elevation angle (which affects power generation efficiency), duration of sunlight, and Earth visibility windows. These metrics help mission planners quickly assess whether a site-date combination is viable.
* Multiple visualization approaches: You may explore 2D maps, 3D surface visualizations, or other creative representations that help users understand the spatial relationships between the landing site, Sun, and Earth.
* Temporal dynamics: You may consider creating animations or timeline views that show how Sun and Earth positions change over a lunar day or across multiple days, helping users understand the duration and timing of operational windows.
* Accessibility across skill levels: Your tool could serve mission planners seeking detailed technical information for rapid decision-making, as well as educators and the general public curious about why the Moon presents such distinct engineering challenges.

You are encouraged to be creative in how you present this information. Your solution might be a web application, a mobile app, an interactive visualization, an educational game, or another format entirely — as long as it makes rapid site evaluation clear and efficient.

### Potential Considerations
You may (but are not required to) consider the following:

Technical approach:
* Ephemeris data – the positions and motions of celestial bodies – can be calculated using tools like the JPL Horizons System, or you may consider using pre-computed datasets.
* Lunar topography data from sources like the Lunar Orbiter Laser Altimeter (LOLA) can help create realistic surface visualizations and accurate horizon calculations.
* Consider how to handle the Moon's lack of atmosphere when calculating horizon positions. Without atmospheric refraction, the horizon is determined by local terrain and the edge of the lunar sphere as seen from the landing site.
* Solar elevation angle is a key metric for power generation, and you may consider calculating and displaying this prominently.

User experience:
* Your interface could prioritize rapid scenario comparison, allowing mission planners to evaluate multiple site-date combinations efficiently.
* Consider how to clearly communicate time remaining before sunset or Earthset, as this is critical operational information.
* Think about how to make the extreme differences between lunar and terrestrial conditions apparent—they can be compelling when visualized effectively.
* You may consider features that help users understand why small location or date changes have large impacts on mission feasibility.

Data and accuracy:
* Consider accounting for the Moon's actual topography, as terrain elevation can significantly affect horizon positions and visibility windows.
* Consider whether your tool will account for factors like Earth's libration (wobble) or the Moon's orbital variations.
* South pole terrain is particularly complex, and you may consider how to represent steep slopes and deep craters that create extreme shadow conditions.

Engagement and impact:
* Your solution could support mission planners in coordinating between science and engineering teams during mission development.
* It could help teams respond quickly when schedule changes or hardware development challenges require landing date or location adjustments.
* It could also serve as an educational tool to help students and the public understand lunar exploration challenges and why mission planning is so complex.

(Resource links: none were pasted. Add the challenge page's resource list here if it has one.)

If anything below conflicts with the official statement, the official statement wins. Tell me about the conflict.

Summary in my words: missions to the lunar south pole face extreme lighting and communication constraints. Tools for finding Sun and Earth positions at landing sites exist but are hard to use. Build an intuitive tool for mission planners, educators and the public to compare landing sites and dates quickly. It shows the Sun and Earth relative to the local horizon, so users can judge solar power potential and direct-to-Earth (DTE) communication windows.

Hackathon: Nov 14–15, 2026 (about 2 days). All work happens during the event, so scope must fit.

## 1. Product vision
"Pick a south pole site and a date range. Instantly see when it has sunlight, when it can see Earth, and how it compares to other sites."
Users:
- Mission planners: accurate numbers, comparisons, export
- Educators and students: guided explanations and animations
- Public: a beautiful, understandable first impression

## 2. Features by priority
P0 (must have; a working build by the end of Day 1):
1. Site picker: at least 8 curated south pole sites, shown as a list and on a map of the south pole.
2. Horizon panorama (the core view): azimuth 0–360° on the x-axis, elevation (about −5° to +15°) on the y-axis. Show the terrain horizon outline and the Sun's and Earth's paths over the selected dates. Draw their disks at the current time (Sun about 0.53° wide, Earth about 1.9° wide), and make it clear when terrain blocks them.
3. Time controls: date range within 2026–2030, time scrubber, play/pause, speed control. All times in UTC and labeled.
4. Metrics per site and date range:
   - Solar illumination %: time-averaged visible fraction of the solar disk
   - Longest continuous darkness in hours (configurable darkness threshold; define it clearly)
   - Earth visibility %: Earth's center above the terrain horizon plus a configurable margin, default 0°
   - Longest communication blackout in hours
   - Overlap windows when the Sun AND Earth are both visible
5. Timeline strip: bars showing sunlit / Earth visible / both across the date range.

P1 (Day 2):
6. Compare mode: 2–3 sites side by side, with a metrics table and aligned timelines.
7. 3D view: Moon globe, fly to a site, then a ground-level view. Light it from our computed Sun direction so the terrain shadows are real, and show Earth in the sky.
8. Power and battery calculator for a vertical, Sun-tracking panel:
   P = 1361 W/m² × (1 AU / r)² × efficiency × area × visible fraction.
   Show daily energy, and the battery size needed to survive the longest darkness at a given load.
9. Observer height toggle (for example 2 m lander vs 10 m mast), using horizons precomputed for each height.
10. Explore mode for educators: a short guided story covering why the Sun skims the horizon at the pole, why Earth wobbles in the sky (libration), and peaks of near-constant light vs permanently shadowed craters. End with a "find the best landing site" mini-challenge.
11. Shareable URL (site, dates, time in the query string) and CSV export of the windows.

P2 (only if time remains):
12. Drop a pin anywhere: compute a rough horizon in a Web Worker from a low-resolution elevation map.
13. Average illumination map overlay, if NASA publishes one (for example on PGDA).
14. Mission date presets.

## 3. Proposed architecture (challenge it in your plan if you have a better idea)
A static site with no backend. The heavy computation runs once, offline, in Python. The browser does fast, lightweight math.

A. Python data pipeline (/pipeline, in a venv):
- Ephemeris: with NASA NAIF SPICE (spiceypy), compute Moon-centered position vectors of the Sun and Earth in the lunar Mean Earth/Polar Axis body-fixed frame (MOON_ME, the frame LOLA coordinates use). Sample hourly from 2026-01-01 to 2031-01-01, with light-time and stellar aberration correction. Output a compact Float32 binary or JSON file, 2 MB at most.
- Kernels (check current file names at https://naif.jpl.nasa.gov/pub/naif/generic_kernels/): naif0012.tls, de440s.bsp, pck00011.tpc, moon_pa_de440_*.bpc and moon_de440_*.tf. Confirm which lunar frame names that frames kernel defines.
- Horizon masks: from LOLA south pole elevation maps (LOLA heights are relative to a 1737.4 km sphere; use planetocentric coordinates). For each site and observer height, cast a ray every 0.5° of azimuth, out to at least 150 km, and record the maximum elevation angle including lunar curvature:
  elev = atan((h_terrain − h_observer − d²/(2R)) / d), with R = 1737.4 km.
  Use a high-resolution elevation map near the site and a coarser one for distant terrain, which matters when the Sun is this low. Make sure the coverage reaches the full length of every ray.
- sites.json: name, lat, lon, source citation, notes. Never invent coordinates. If only a region is published, pick a representative point and label it "approximate".
- Put the derived data in /web/public/data/. Never commit raw elevation maps (add them to .gitignore).

B. Web app (/web): Vite + React + TypeScript + Tailwind, Zustand for state, D3 (or visx) for the panorama and timelines, and a Web Worker for the metric math. Use CesiumJS for 3D with the Moon ellipsoid, plus Cesium ion's Moon terrain if it's available. I will put my own ion token in .env.local; never commit it. If Cesium's Moon support is too painful, propose a fallback (for example React Three Fiber with a local terrain patch plus a horizon ring).
Browser math: for each site, the topocentric vector = body vector − site vector (both in MOON_ME). Rotate it into local East-North-Up to get azimuth and elevation. Interpolate linearly between hourly samples. The visible fraction of a disk is the part of the disk above the horizon line at that azimuth.

## 4. Data sources to research and verify (cite everything in DATA_SOURCES.md)
- The datasets in the official challenge resources: use these first
- NASA NAIF SPICE generic kernels
- LRO LOLA polar elevation maps: PDS Geosciences Node and NASA Goddard PGDA (high-resolution south pole maps)
- NASA Moon Trek (trek.nasa.gov/moon) for imagery and tiles
- Sites: NASA's Artemis III candidate regions (Oct 2024 list: Peak near Cabeus B, Haworth, Malapert Massif, Mons Mouton Plateau, Mons Mouton, Nobile Rim 1, Nobile Rim 2, de Gerlache Rim 2, Slater Plain; check for updates). Also well-known high-illumination points on the Shackleton crater rim and connecting ridge, and south pole CLPS landing sites (for example Intuitive Machines IM-2 near Mons Mouton).
Ask me before any download larger than 1 GB. Prefer cropped or windowed reads.

## 5. Accuracy and validation (judges care about this; write VALIDATION.md)
- Python vs browser math: the same azimuth and elevation within 0.01°. Add a Vitest test that uses fixtures exported by Python.
- Python vs the JPL Horizons API (https://ssd.jpl.nasa.gov/api/horizons.api, using a topocentric observer on the Moon via CENTER='coord@301' and SITE_COORD): 3 sites × 5 dates, target ≤ 0.1°. Explain any larger difference.
- Sanity-check illumination against published studies (for example Mazarico et al. 2011 and Gläser et al. 2014, both in Icarus) or NASA illumination maps for known high-illumination points. Explain any differences (map resolution, observer height, time span).
- Add an "About the method" page that states the limitations honestly.

## 6. Design and UX
- Dark space theme, clean and data-first: "mission control meets science museum". Sun in warm yellow, Earth in blue, but never rely on color alone; add labels and icons.
- Planner mode (dense, precise, exportable) and Explore mode (guided, animated, plain language).
- Planner mode is built for desktop; Explore mode must work on phones.
- Accessibility: WCAG AA contrast, keyboard navigation, respect prefers-reduced-motion, text alternatives for charts.
- Performance: first load under 3 s on broadband, lazy-load Cesium, heavy math in a Web Worker, smooth 60 fps animation.
- If a frontend design skill is available, use it for the visual direction.
- Do not use NASA logos or insignia; follow the Space Apps brand guidelines. Credit every data source on a Credits page. Use the MIT license.

## 7. How to work with me
1. FIRST, plan only; write no code yet. Read the challenge page. Use web search to check data sources, file names, library versions and licenses. Then write PLAN.md with:
   - an architecture diagram (text) and the folder structure
   - the data pipeline steps, with expected file sizes and run times
   - the feature list mapped to P0/P1/P2 and to the official requirements
   - an hour-by-hour schedule for the 2-day hackathon, with a working build at the end of Day 1
   - the validation plan, top risks and fallbacks
   - questions for me
   Then stop and wait for my approval.
2. After approval, build one milestone at a time:
   - M0: setup (git, Vite app, Python venv, kernels)
   - M1: ephemeris and validation
   - M2: horizon masks
   - M3: site picker, panorama, time controls
   - M4: metrics, timelines, compare mode
   - M5: 3D view
   - M6: Explore mode, polish, accessibility, performance
   - M7: deploy and docs
   After each milestone: run the tests, typecheck and build. Open the dev server and check it in the browser. Commit, then give me a short summary (what works, what's next, risks).
3. Keep the app deployable at all times. If we fall behind, cut P2 first, then P1. Never break P0.
4. Deploy to Vercel as a preview first. Promote to production only after I approve.
5. Keep a short AI_USAGE.md log of what Claude helped with, in case the submission guide asks for disclosure.
6. Ask me before pushing to GitHub, installing anything globally, or touching files outside this folder.

## 8. Definition of done
- Live Vercel URL and a public GitHub repo
- P0 complete and validated, with numbers in VALIDATION.md
- README covering the problem, the solution, how to run it, the data pipeline, the method, limitations and credits
- DEMO_SCRIPT.md: a script for the demo video that shows the strongest moments (flying to Shackleton, the Sun skimming the horizon, comparing 3 sites, the battery calculator)
- Meets every requirement in the official challenge statement and the Project Submission Guide
