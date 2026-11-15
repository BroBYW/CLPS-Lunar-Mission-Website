import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AtAGlance } from './components/AtAGlance.tsx'
import { CompareView } from './components/CompareView.tsx'
import { DsnPanel } from './components/DsnPanel.tsx'
import { EclipseReplays } from './components/EclipseReplays.tsx'
import { LroPanel } from './components/LroPanel.tsx'
import { MastPanel } from './components/MastPanel.tsx'
import { MissionReplays } from './components/MissionReplays.tsx'
import { NowPanel } from './components/NowPanel.tsx'
import { MetricsPanel } from './components/MetricsPanel.tsx'
import { Panorama } from './components/Panorama.tsx'
import { PowerPanel } from './components/PowerPanel.tsx'
import { ShadowMovie } from './components/ShadowMovie.tsx'
import { SiteHeader } from './components/SiteHeader.tsx'
import { SiteList } from './components/SiteList.tsx'
import { SiteMapPanel } from './components/SiteMapPanel.tsx'
import { SitePicker } from './components/SitePicker.tsx'
import { Timeline } from './components/Timeline.tsx'
import { TimeControls } from './components/TimeControls.tsx'
import { WindowsTable } from './components/WindowsTable.tsx'
import { loadAppData, type AppData } from './data/load.ts'
import { downloadText, windowsCsv } from './lib/csv.ts'
import { computeMetrics } from './lib/metrics.ts'
import { formatUtcDate } from './lib/time.ts'
import { usePlayback } from './state/playback.ts'
import { useApp, type View } from './state/store.ts'
import { PIN_ID, pinSite, usePin } from './state/pin.ts'
import { applyUrl, syncUrl } from './state/url.ts'
import { useSiteScene } from './state/useSiteScene.ts'
import Explore from './views/Explore.tsx'
import Finder from './views/Finder.tsx'
import { AboutPage, CreditsPage } from './views/InfoPages.tsx'
import { Home, Logo } from './views/Home.tsx'
import { initWorker, seriesRequest, useSeries } from './workers/client.ts'

/** View, label, and a shorter label for phones where it differs. */
const VIEWS: [View, string, string?][] = [
  ['plan', 'Plan'],
  ['compare', 'Compare'],
  ['finder', 'Find dates', 'Dates'],
  ['3d', '3D'],
  ['explore', 'Explore'],
  ['play', 'Play'],
  ['about', 'Method'],
  ['credits', 'Credits'],
]
/** On phones the header keeps the four main views; these two move to the footer. */
const SECONDARY: View[] = ['about', 'credits']
const REPO_URL = 'https://github.com/BroBYW/CLPS-Lunar-Mission-Website'

// CesiumJS only loads when the 3D view (or the home page backdrop) is shown
const Globe3D = lazy(() => import('./views/Globe3D.tsx'))
const Play = lazy(() => import('./views/Play.tsx'))
// MediaPipe and its model load only once someone turns hand control on
const HandControl = lazy(() => import('./components/HandControl.tsx'))

export default function App() {
  const [data, setData] = useState<AppData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)
  const handControl = useApp((s) => s.handControl)

  useEffect(() => {
    loadAppData().then(
      (d) => {
        applyUrl(window.location.search, d.sites.map((s) => s.id), d.horizons.heightsM)
        initWorker(d)
        setData(d)
        // A shared link to a dropped pin: cast its horizon again
        const q = new URLSearchParams(window.location.search)
        const at = (q.get('pin') ?? '').split(',').map(Number)
        if (q.get('site') === PIN_ID && at.length === 2 && at.every(Number.isFinite)) void usePin.getState().drop(at[0], at[1], d.horizons.heightsM)
      },
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    )
  }, [])
  useEffect(() => (data ? syncUrl(data.horizons.heightsM) : undefined), [data])
  usePlayback()
  // A new view starts at its top, not at the scroll position of the one before
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [view])

  if (view === 'home' && !error) return <Home data={data} />

  return (
    <div className="min-h-screen">
      <a href="#content" className="sr-only z-50 rounded-lg bg-bright px-3 py-2 text-sm font-semibold text-sky focus:not-sr-only focus:fixed focus:top-4 focus:left-4">
        Skip to content
      </a>
      <header className="sticky top-3 z-40 mx-3 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-shadow/70 p-2 backdrop-blur-xl sm:mx-auto sm:w-fit sm:flex-nowrap sm:gap-6">
        <h1 className="title-4 sm:title-3 pl-2">
          <button type="button" onClick={() => setView('home')} className="flex items-center gap-2 text-left text-bright transition-opacity hover:opacity-80" aria-label="CLPS Lunar Mission Browser, back to the home page">
            <Logo size={24} />
            <span className="whitespace-nowrap">CLPS Lunar Mission Browser</span>
          </button>
        </h1>
        <nav
          aria-label="Views"
          className="flex gap-0.5 max-sm:w-full max-sm:justify-between"
        >
          {VIEWS.map(([v, label, short]) => (
            <button
              key={v}
              type="button"
              aria-current={view === v ? 'page' : undefined}
              aria-label={short ? label : undefined}
              onClick={() => setView(v)}
              className={`title-4 rounded-lg px-3 py-2 whitespace-nowrap transition-colors max-sm:px-2 ${SECONDARY.includes(v) ? 'max-sm:hidden' : ''} ${
                view === v ? 'bg-bright text-sky' : 'text-dust hover:bg-shadow-2 hover:text-bright'
              }`}
            >
              {short ? (
                <>
                  <span className="max-sm:hidden">{label}</span>
                  <span className="sm:hidden">{short}</span>
                </>
              ) : (
                label
              )}
            </button>
          ))}
        </nav>
      </header>
      <div id="content" tabIndex={-1} className="outline-none" />
      {error ? (
        <p role="alert" className="m-6 max-w-prose text-alert">
          The mission data didn't load: {error}. Check your connection and reload the page.
        </p>
      ) : !data ? (
        <div className="mx-auto grid max-w-[1600px] gap-6 px-4 py-6 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] lg:px-6" aria-busy="true">
          <p className="sr-only" aria-live="polite">
            Loading ephemeris and terrain…
          </p>
          <div className="h-[480px] animate-pulse rounded-2xl bg-shadow max-lg:hidden" />
          <div className="flex flex-col gap-6">
            <div className="h-16 animate-pulse rounded-2xl bg-shadow" />
            <div className="h-[420px] animate-pulse rounded-2xl bg-shadow" />
            <div className="h-28 animate-pulse rounded-3xl bg-shadow" />
          </div>
        </div>
      ) : view === 'compare' ? (
        <CompareView data={data} />
      ) : view === 'finder' ? (
        <Finder data={data} />
      ) : view === 'about' ? (
        <AboutPage />
      ) : view === 'credits' ? (
        <CreditsPage />
      ) : view === 'explore' ? (
        <Explore data={data} />
      ) : view === 'play' ? (
        <Suspense fallback={<p className="m-6 text-dust">Loading the games…</p>}>
          <Play data={data} />
        </Suspense>
      ) : view === '3d' ? (
        <Suspense fallback={<p className="m-6 text-dust">Loading the 3D view…</p>}>
          <Globe3D data={data} />
        </Suspense>
      ) : (
        <Planner data={data} />
      )}
      {/* Mounted here so the story and every time bar share it; a portal keeps blurred bars from trapping its fixed position */}
      {handControl &&
        data &&
        createPortal(
          <Suspense fallback={null}>
            <HandControl />
          </Suspense>,
          document.body,
        )}
      <footer className="mt-12 px-4 py-6 text-xs text-dust lg:px-6">
        <nav aria-label="About this project" className="flex flex-wrap gap-x-6 gap-y-2">
          {VIEWS.filter(([v]) => SECONDARY.includes(v)).map(([v, label]) => (
            <button key={v} type="button" onClick={() => setView(v)} className="underline decoration-regolith underline-offset-2 hover:text-bright">
              {label}
            </button>
          ))}
          <a href={REPO_URL} className="underline decoration-regolith underline-offset-2 hover:text-bright">
            Source code
          </a>
        </nav>
      </footer>
    </div>
  )
}

function Planner({ data }: { data: AppData }) {
  const siteId = useApp((s) => s.siteId)
  const setSite = useApp((s) => s.setSite)
  const startMs = useApp((s) => s.startMs)
  const endMs = useApp((s) => s.endMs)
  const setHeightIndex = useApp((s) => s.setHeightIndex)
  const darkThreshold = useApp((s) => s.darkThreshold)
  const earthMarginDeg = useApp((s) => s.earthMarginDeg)
  const focus = useApp((s) => s.panoramaFocus)
  const moreDetails = useApp((s) => s.moreDetails)
  const setMoreDetails = useApp((s) => s.setMoreDetails)

  const pin = usePin((s) => s.pin)
  const site = useMemo(() => (siteId === PIN_ID && pin ? pinSite(pin) : (data.sites.find((s) => s.id === siteId) ?? data.sites[0])), [siteId, pin, data])
  const pickable = useMemo(() => (pin ? [pinSite(pin), ...data.sites] : data.sites), [pin, data])
  const heightsM = data.horizons.heightsM
  const { heightIndex, heightM, frame, mask, track, bodies, sunFrac, earthVis } = useSiteScene(data, site, site.mask_index < 0 ? pin?.masks : undefined)
  const { series, pending } = useSeries(seriesRequest(site, heightIndex, heightsM, startMs, endMs))
  const metrics = useMemo(() => (series ? computeMetrics(series, { darkThreshold, earthMarginDeg }) : null), [series, darkThreshold, earthMarginDeg])

  const download = () => {
    if (!series) return
    downloadText(
      `${site.id}-${formatUtcDate(startMs)}-to-${formatUtcDate(endMs - 86_400_000)}-${heightM}m.csv`,
      windowsCsv([{ siteId: site.id, series }], { darkThreshold, earthMarginDeg }, heightM),
    )
  }

  return (
    <div className="mx-auto grid max-w-[1600px] gap-6 px-4 py-6 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] lg:px-6">
      <aside className="order-2 flex flex-col gap-6 lg:order-1">
        <div className="card">
          <SiteList sites={pickable} selected={site.id} onSelect={setSite} />
        </div>
        <div className="card">
          <SiteMapPanel data={data} selected={site.id} onSelect={setSite} />
        </div>
      </aside>
      <main className="order-1 flex min-w-0 flex-col gap-6 lg:order-2">
        {/* On phones the site list comes after everything else, so the site can be changed here too */}
        <SitePicker label="Site" sites={pickable} value={site.id} onChange={setSite} className="lg:hidden" />
        <AtAGlance site={site} metrics={metrics} pending={pending} />
        <div className="card">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <SiteHeader site={site} />
            <fieldset className="seg">
              <legend className="sr-only">Observer height</legend>
              {heightsM.map((h, i) => (
                <label key={h} className="chip">
                  <input type="radio" name="height" className="sr-only" checked={i === heightIndex} onChange={() => setHeightIndex(i)} />
                  {i === 0 ? `Lander, ${h} m` : `Mast, ${h} m`}
                </label>
              ))}
            </fieldset>
          </div>
          <div className="mt-4">
            <Panorama key={focus.n} mask={mask} track={track} bodies={bodies} sunFrac={sunFrac} earthVis={earthVis} initialFollow={focus.follow} initialWidth={focus.width} />
          </div>
        </div>
        <TimeControls />
        <NowPanel data={data} frame={frame} mask={mask} />
        <section aria-label="Timeline" className="card">
          <Timeline rows={[{ label: site.name, series }]} startMs={startMs} endMs={endMs} />
          {metrics && (
            <p className="sr-only">
              Timeline summary: sunlit {metrics.sunMeanPct.toFixed(1)}% on average, Earth in view {metrics.earthPct.toFixed(1)}% of the
              time, both {metrics.bothPct.toFixed(1)}% in {metrics.windows.length} windows. The windows table lists exact times.
            </p>
          )}
        </section>
        {/* Newcomers see the answer, the skyline and the timeline; the expert panels open on request */}
        <div className="flex flex-col items-center gap-2 py-2">
          <button type="button" className="btn" aria-expanded={moreDetails} aria-controls="more-details" onClick={() => setMoreDetails(!moreDetails)}>
            {moreDetails ? 'Hide the details' : 'Show more details'}
            <svg width={14} height={14} viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" className={`transition-transform duration-300 ${moreDetails ? 'rotate-180' : ''}`}>
              <path d="M213.66 101.66l-80 80a8 8 0 0 1-11.32 0l-80-80A8 8 0 0 1 53.66 90.34L128 164.69l74.34-74.35a8 8 0 0 1 11.32 11.32Z" />
            </svg>
          </button>
          {!moreDetails && (
            <p className="caption-5 max-w-[680px] text-center text-dust">
              Exact numbers and their definitions, Deep Space Network contact, power and battery, mast height, real LRO photos, a shadow movie and
              replays of real landings
            </p>
          )}
        </div>
        {moreDetails && (
          <div id="more-details" className="flex flex-col gap-6">
            <div className="card flex flex-col gap-3 py-4 [&>*]:mb-0">
              <MissionReplays data={data} />
              <EclipseReplays data={data} site={site} />
            </div>
            <div className="card">
              <MetricsPanel metrics={metrics} pending={pending} />
            </div>
            <div className="card">
              <DsnPanel series={series} />
            </div>
            <div className="grid gap-6 xl:grid-cols-2">
              <div className="card">
                <WindowsTable windows={metrics?.windows ?? []} onDownload={download} />
              </div>
              <div className="card">
                <PowerPanel series={series} metrics={metrics} />
              </div>
            </div>
            <div className="card">
              <MastPanel site={site} />
            </div>
            <div className="card">
              <LroPanel site={site} />
            </div>
            <div className="card">
              <ShadowMovie data={data} site={site} />
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
