# Handoff: 15 November 2026, 14:30 (UTC+8)

The first computer has no camera, so the work moves to a second computer to test the new **hand control** and record the demo. This file is everything the next Claude session needs; [CLAUDE.md](CLAUDE.md) has the standing rules.

## Deadline

**Full Space Apps submission due today, 15 November 2026, 21:00 (UTC+8).** It includes a demo: **either a video of 30 seconds or less, or at most 7 slides** (title and introduction included). Upload it somewhere public (YouTube, Google Drive, GitHub, OneDrive or Dropbox) and share a link that needs no password, permission or sign-in. A demo longer than 30 s or more than 7 slides makes the project ineligible for a Global Award.

## Where things stand

- GitHub `main` = `dev` = the commit that adds this file. Pushes don't deploy (Vercel isn't linked to GitHub).
- **Production still serves `ad699f0` (27 Oct).** Two things on `dev` are not live yet:
  1. `14d5bd1`: a countdown to the next sunset, sunrise, Earthset or Earthrise and the Sun's elevation as a metric (`NowPanel.tsx`, `nextEvents.ts`, `useSkyNow.ts`).
  2. Hand control (below).
- A preview with both: https://clps-lunar-mission-browser-g8zxnor3s-alvin-s.vercel.app (sign in to Vercel to open it). Its web build matches this commit; only docs changed after it. Once the user has tried hand control and approves, it can go live with `npx vercel promote https://clps-lunar-mission-browser-g8zxnor3s-alvin-s.vercel.app --scope alvin-s`. If code changes first, deploy a new preview and promote that one instead.
- [DEMO_30S.md](DEMO_30S.md) records from the production URL, and its Plan shot shows the countdown cards. So **promote before recording**, or record from `npm run dev`.
- On the first computer, another Claude session was rendering a demo video in `demo-video/`. That folder is git-ignored, so none of it is in this push. If the user wants it, they copy it across by hand.

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

## Demo idea using hand control

[DEMO_30S.md](DEMO_30S.md) has a 30 s shot list from the first computer, with no hand control in it yet. A strong replacement for its 3D shot (16–23 s): the user in front of the camera, sweeping an open hand while the shadows sweep across Shackleton rim's terrain; then a fist, and everything stops. The hand-control panel shows the camera feed and skeleton, so one screen recording captures both. On Windows, use the Snipping Tool's video mode (Win+Shift+R) or Xbox Game Bar (Win+Alt+R).

## Next steps, in order

1. Test hand control with a real camera (checklist above); tune if needed; commit on `dev`.
2. With the user's OK: push, then promote a preview to production. Check the live site afterwards.
3. Record the demo (30 s or less), upload it, and get a public link that needs no sign-in (YouTube "unlisted" works).
4. Submit before 21:00 (UTC+8).
5. Add rows to AI_USAGE.md for any further AI-assisted work.
