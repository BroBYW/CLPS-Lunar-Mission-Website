# Demo script

In 2025, Space Apps capped the demo at a **30-second video** or **7 slides**, publicly viewable and in English, with subtitles for video. The 2026 guide is due on 13 Nov 2026; check it and adjust. This script fits the 30 s version and ends with a 7-slide backup.

Record at 1920×1080 in Chrome with reduced motion **off**. Use the production site, not the dev server. The links below reproduce each shot exactly; append them to the site URL.

## 30-second video

| Time | Screen | Subtitle |
|---|---|---|
| 0:00–0:04 | **Home** at the bare URL. The Moon turns, lit by today's Sun. Click **Let's start**; the camera dives to the south pole. | At the Moon's south pole, the Sun skims the horizon. |
| 0:04–0:11 | **Plan**, Connecting ridge: `?site=connecting-ridge&from=2027-01-01&to=2027-01-30&h=2`. Set speed to 3 days per second and press **Play**. The Sun slides along the jagged skyline and the timeline fills in. | Pick a site and dates. See when it has sunlight, and when it can see Earth. |
| 0:11–0:15 | Click **Shackleton crater floor** in the list. The walls fill the panorama and the status reads "Sun hidden". | A crater 20 km away never sees the Sun. |
| 0:15–0:22 | **Compare**: `?view=compare&cmp=haworth,connecting-ridge,mons-mouton&from=2027-01-01&to=2027-01-14&h=2`. Pan across the table and its "best" markers. | Compare sites: the sunniest ridge loses Earth, and Haworth balances both. |
| 0:22–0:27 | **Plan**, Malapert Massif, scrolled to **Power and battery**. Change the load from 100 W to 250 W; the battery estimate updates. | Size solar power and batteries for the longest darkness. |
| 0:27–0:30 | End card: title, "NASA SPICE ephemerides and LRO LOLA terrain, checked against JPL Horizons", and the site URL. | Open data, open source, validated. |

If a few seconds are spare, add **3D** at 0:15. Stand at Nobile Rim 2 (`?view=3d&site=nobile-rim-2&from=2026-10-01&to=2026-10-30&t=2026-10-18T12:00Z&h=2`) and drag toward the west to reveal the massif on the skyline.

**Recording tips:**
- Hide the cursor except for clicks.
- Start playback about half a second before the cut.
- Burn in the subtitles; the rules asked for English subtitles.
- Don't add AI-generated imagery. If any is used, it must be watermarked under the 2025 rules.

## 7-slide backup

1. **Title.** CLPS Lunar Mission Browser. A screenshot of the home page with the live Moon. Team names.
2. **The problem.** The Sun is never more than about 2° up at the pole; light and radio contact to Earth are scarce. Show a panorama screenshot with the Sun path skimming the horizon.
3. **What it does.** Four small screenshots: panorama, timeline, compare, 3D standing view.
4. **One site in depth.** The Connecting ridge over 2026–2030: 87.6% sunlight, 113 h longest darkness, Earth in view 54%. Add the battery estimate for a 100 W load.
5. **Trade-offs.** The January 2027 challenge table: only Haworth meets 80% sunlight and 50% Earth.
6. **How we know it's right.** Horizons within 0.00001°; Gläser et al. within 1.5 points; eclipse timings match NASA. Link VALIDATION.md.
7. **Data and next steps.** NASA SPICE, LRO LOLA (PGDA), Moon Trek, Artemis regions. Next steps: DSN coverage, drop-a-pin sites, the 2024 region footprints. Site URL and repository.
