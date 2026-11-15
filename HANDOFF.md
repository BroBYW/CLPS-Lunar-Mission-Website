# Handoff: 15 November 2026, 17:50 (UTC+8)

Written on the second computer (the one with a camera). This file is everything the next Claude session needs; [CLAUDE.md](CLAUDE.md) has the standing rules.

## Demo video (done)

- English, 29.09 s, 1080p, voice-over, captions and music: [docs/demo/CLPS-demo-30s.mp4](docs/demo/CLPS-demo-30s.mp4). Second cut (commit `64585da`): recorded from the current build, the compare shot replaced by the Play view (game cards, Survive the lunar night running), and the LRO line says 99.3%.
- **Link for the "Link to Project Demo" field** (plays in the browser, no sign-in, pinned to commit `64585da`; works once that commit is pushed): https://cdn.jsdelivr.net/gh/BroBYW/CLPS-Lunar-Mission-Website@64585da/docs/demo/CLPS-demo-30s.mp4. The first cut stays at `@48e0071`. GitHub's own file page won't play a file this size; it only offers a download.
- Space Apps SI rules: the video has a visible "SI-assisted" watermark and an SI disclosure in its metadata (the voice is Microsoft neural text-to-speech; the music was synthesised in code). Say the same in the submission's SI field.
- Team **Luosifen**, challenge **Lunar Landing Site Navigator**: https://www.spaceappschallenge.org/2026/find-a-team/luosifen/?tab=project
- The video shows the redesigned site, which production now serves (see below).
- The scripts that made it (Playwright screencast, edge-tts, numpy music, ffmpeg) were in a temporary folder and are not in the repository.

## Deadline

**Full Space Apps submission due today, 15 November 2026, 21:00 (UTC+8).** It includes a demo: **either a video of 30 seconds or less, or at most 7 slides** (title and introduction included). Upload it somewhere public (YouTube, Google Drive, GitHub, OneDrive or Dropbox) and share a link that needs no password, permission or sign-in. A demo longer than 30 s or more than 7 slides makes the project ineligible for a Global Award.

## Where things stand

- GitHub `main` = `dev`. Pushes don't deploy (Vercel isn't linked to GitHub).
- **Live:** the redesign is in production. Preview `clps-lunar-mission-browser-4yhj4m2gg-alvin-s.vercel.app` (commit `e4d7fab`) was checked and promoted at 17:07 (UTC+8) from Alvin's Vercel account. The live site serves the same build, data files and hand model; no console errors.
- The README screenshots were retaken from the redesign (same pages, dates and links as before).
- **Shorter header** (after the deploy above): five views, Tour (the guided story, view id still `explore`), Plan, Compare, 3D and Play, plus a **More** menu with Find dates, Method and Credits. While a More page is shown, the button takes its name. The home page's nav reads Tour, Plan, Compare, 3D, Play. The README screenshots that show the header were retaken. Deploy it like the redesign: new preview, check, promote with the user's OK.
- **Easier tour and games** (same deploy): the tour's panorama hides the expert toolbar, glows the Sun and Earth and says what they mean in plain words; each step has **See it in 3D** (with **Back to the tour**); the Play view shows its games as picture cards.
- **Help icons** (same deploy): a circled "i" beside each main section title opens a short "What it is / How to use it" card (`web/src/components/InfoTip.tsx`).
- Commit `e4d7fab` added the **redesign** (Geist type, solid buttons, cards, floating nav, docked time bar), the **newcomer changes** (the home button leads into the guided story; the Plan view opens with an "At a glance" card; expert panels fold under "Show more details") and the **fun changes** (a hand control button in story step 1; home cards for hand control and the lunar night game). AI_USAGE.md has the details.
- Hand control passed an automated check (MediaPipe's hand photos through a fake camera) but **has not been tried with a real hand** yet.

## Hand control (new, needs a real camera test)

The idea is the user's: interact with the site through the webcam. An **open hand moved left or right drags time** (the Sun, Earth and the 3D shadows follow), and a **fist holds** time and pauses playback.

Where it lives:

- **Hand control** button: in the time controls (`web/src/components/TimeControls.tsx`), so it works in the Plan, Compare and 3D views. The on/off state is `handControl` in `web/src/state/store.ts`.
- `web/src/components/HandControl.tsx`: lazily loaded. It holds the camera, the MediaPipe Hand Landmarker (`@mediapipe/tasks-vision` 1.1.1, GPU with a CPU fallback) and a mirrored preview with the hand skeleton, yellow while gripping, in a fixed panel at the bottom right. Nothing loads until the button is pressed: about 158 kB of JavaScript, 13.5 MB of wasm (4 MB gzipped) and the 7.8 MB model.
- `web/src/lib/gesture.ts`: the pure logic, tested in `gesture.test.ts` (8 tests).
  - `classifyPose`: a finger is straight when tip-to-wrist / middle-joint-to-wrist > 1.2, curled below 0.95. Three or more straight fingers make an open hand, three or more curled a fist.
  - `palmX`: palm centre, mirrored.
  - `OneEuro`: smoothing, `minCutoffHz` 1.2, `beta` 3.
  - `HandDrag`: a new pose must hold 3 frames; dead band 0.004 frame widths; a lost hand lets go.
- Sensitivity: a sweep across the whole camera frame moves time as far as `SWEEP_SECONDS` (2) seconds of playback at the Speed menu's rate. So "1 day per second" means a sweep moves 2 days, and "3 days per second" means 6 days.
- Docs are done: Method page entry, Credits (MediaPipe, Apache-2.0), README, DATA_SOURCES.md.

Verified on the first computer:

- Unit tests (66 in all), typecheck and production build pass.
- The model loads and starts in dev, in the production build and on the preview. The preview's model file is byte-identical.
- No camera there, so a canvas `captureStream()` stood in for `getUserMedia`. It played MediaPipe's own test photos (`https://storage.googleapis.com/mediapipe-assets/right_hands.jpg`, the upright right hand, and `.../fist.jpg`), which tested the chain end to end:
  - An open hand is detected and grabs.
  - Moving it right moves time forward.
  - A fist holds time while the hand moves.
  - A hand leaving the frame lets go.
- On the stills, the finger ratios are about 1.4 for the open hand and about 0.7 for the fist, well clear of the thresholds.

**Not verified: how it feels with a real hand and camera.** That's the first job.

### Test checklist (second computer)

1. Run `git pull` (or clone), then in `web/`: `npm ci`, then `npm run dev`.
2. Open http://localhost:5173/?view=3d in Chrome. Press **Fly to the site** (LOLA terrain view) and set Speed to **3 days per second**.
3. Press **Hand control** and allow the camera. Then check:
   - The open hand grabs within a moment and the skeleton turns yellow.
   - Moving right moves time forward, and the terrain shadows sweep.
   - A fist stops time.
   - Taking the hand away lets go.
   - The 3D view doesn't stutter badly while tracking.
4. If it feels off, tune in this order:
   - Too sensitive or too slow: `SWEEP_SECONDS`.
   - Jittery: lower `beta` or `minCutoffHz`.
   - Laggy: raise `beta`.
   - Fist not caught: raise the 0.95 threshold.
   - Grabs too slowly: `confirmFrames`.

   Keep `gesture.test.ts` passing.

Known limits: one hand only; needs reasonable light; detection runs on the main thread beside Cesium; not tried on phones.

## Next steps, in order

1. The user fills in the Space Apps project page (all in English): the demo link above, the live site as the final project, the SI field, NASA data. Then **Submit for Judging** before 21:00 (UTC+8); the official close is 23:59 local event time.
2. If there's time: the user tries hand control with a real hand (checklist above) and it gets tuned. Any later change needs a new preview from `web/` (this computer's Vercel CLI is signed in to Alvin's account) and a promote with the user's OK.
3. Add rows to AI_USAGE.md for any further AI-assisted work.
