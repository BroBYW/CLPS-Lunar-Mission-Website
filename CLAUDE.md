# CLAUDE.md

Instructions for Claude Code in this repository. **Read [HANDOFF.md](HANDOFF.md) next**: it says where the work stands and what to do now.

## The project

CLPS Lunar Mission Browser, an entry for the NASA Space Apps Challenge 2026 (challenge "CLPS Lunar Mission Browser"; hackathon 14–15 November 2026). It's a web app for comparing lunar south pole landing sites and dates: when each site has sunlight, when it can see Earth, terrain horizons from LOLA, a 3D view, games and validation against LRO photos.

- Live site: https://clps-lunar-mission-browser.vercel.app
- Repository: https://github.com/BroBYW/CLPS-Lunar-Mission-Website
- The brief and the official challenge statement are in [PROMPT.md](PROMPT.md); the original plan and research are in [PLAN.md](PLAN.md).

## Talking to the user

- Reply in **Simplified Chinese** (the user asked for 华语). Keep code, file names, commands, commit messages and project docs in **English**, because the repository and the submission are public and in English.
- Ask before every `git push` and before every Vercel production promote. Ask before global installs or touching files outside this folder.
- If Claude Code's permission check blocks a production promote, don't work around it: ask the user to approve it in chat, or give them the command.
- Log AI-assisted work in [AI_USAGE.md](AI_USAGE.md), one table row per piece of work (Space Apps asks for AI disclosure).

## Layout

| Path | What |
|---|---|
| `web/` | The app: Vite, React 19, TypeScript, Tailwind 4, Zustand, CesiumJS. Views are in `src/views/`, panels in `src/components/`, pure logic with Vitest tests in `src/lib/`, state in `src/state/store.ts`, workers in `src/workers/`. |
| `web/public/data/` | Derived data the app loads (ephemeris, horizon masks, LOLA terrain grids, Moon model, LRO photos), about 26 MB. Committed, so the app runs straight from a clone. |
| `web/public/models/` | MediaPipe hand model for hand control (7.8 MB). |
| `pipeline/` | Python (uv) that builds `web/public/data` from SPICE kernels and LOLA maps. Only needed to regenerate data. Raw maps, caches and kernels are git-ignored; scripts download them. |
| `docs/screenshots/` | README pictures. |
| `VALIDATION.md`, `DATA_SOURCES.md`, `AI_USAGE.md` | Accuracy checks, data credits, AI log. |
| `DEMO_30S.md`, `DEMO_SCRIPT.md` | The 30-second demo shot list; the longer demo script. |

## Commands (in `web/`)

```bash
npm ci            # once per clone; needs Node >= 22.12
npm run dev       # http://localhost:5173
npm test          # Vitest; CLPS_VALIDATE=1 also runs the slow 3D-shadow validation (~5 min)
npm run typecheck
npm run build     # tsc -b, then vite build into web/dist
```

There's no ESLint config; `npm run typecheck` and the tests are the checks.

## Git and deploys

- Work on `dev`. `main` is what's published. To publish (only when the user asks): `git branch -f main dev`, then `git push origin main dev`.
- Vercel project `clps-lunar-mission-browser`, scope `alvin-s`. It is **not** linked to GitHub, so pushes deploy nothing.
- Deploy from `web/`: `npx vercel deploy --yes` makes a preview (behind Vercel Authentication). Check it, then promote only after the user approves: `npx vercel promote <preview-url> --scope alvin-s`.
- On a new computer: `npx vercel login`, then `npx vercel link --yes --project clps-lunar-mission-browser --scope alvin-s` in `web/`.
- Check a protected preview with `npx vercel curl /path --deployment <url>`. In Git Bash, set `MSYS_NO_PATHCONV=1` first or the path gets mangled.
- Vercel serves `/data/*` with a one-hour cache, so a browser can keep an old data file for up to an hour after a deploy.

## Things that bite

- On the first computer, `python` on PATH is an empty Windows stub. Use `uv run` in `pipeline/`.
- LROC's PDS archive (pds.mcp.nasa.gov) answers bursts with HTTP 429. Send at most one request every 4 s, and no multi-range requests. Product labels there are lowercase `.xml`. `pipeline/scripts/lro_photos.py` already paces itself.
- Cesium globe lighting renders black if it's enabled before tiles load. `moonViewer.ts` toggles it after the first `tilesLoaded`.
- Vite's servers send `.bin.gz` gzip-encoded and Vercel doesn't. `terrainPatch.ts` checks the gzip magic bytes before unpacking.
- Camera features (hand control, phone compass) need a secure context: https or localhost.
