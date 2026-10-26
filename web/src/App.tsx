import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { CompareView } from './components/CompareView.tsx'
import { DsnPanel } from './components/DsnPanel.tsx'
import { LroPanel } from './components/LroPanel.tsx'
import { MastPanel } from './components/MastPanel.tsx'
import { MissionReplays } from './components/MissionReplays.tsx'
import { MetricsPanel } from './components/MetricsPanel.tsx'
import { Panorama } from './components/Panorama.tsx'
import { PowerPanel } from './components/PowerPanel.tsx'
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
  ['about', 'Method'],
  ['credits', 'Credits'],
]
/** On phones the header keeps the four main views; these two move to the footer. */
const SECONDARY: View[] = ['about', 'credits']
const REPO_URL = 'https://github.com/BroBYW/CLPS-Lunar-Mission-Website'

// CesiumJS only loads when the 3D view (or the home page backdrop) is shown
const Globe3D = lazy(() => import('./views/Globe3D.tsx'))

export default function App() {
  const [data, setData] = useState<AppData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)

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

  if (view === 'home' && !error) return <Home data={data} />

  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-shadow-2 px-4 py-3 lg:px-6">
        <div className="flex flex-wrap items-baseline gap-x-4">
          <h1 className="font-display text-base font-medium sm:text-xl">
            <button type="button" onClick={() => setView('home')} className="flex items-center gap-2.5 text-left hover:text-bright" aria-label="CLPS Lunar Mission Browser, back to the home page">
              <Logo size={26} />
              CLPS Lunar Mission Browser
            </button>
          </h1>
          <p className="text-sm text-dust max-md:hidden">Sunlight and Earth visibility at lunar south pole sites, 2024–2030</p>
        </div>
        <nav aria-label="Views" className="-mx-1 ml-auto flex gap-1 max-sm:w-full max-sm:justify-between">
          {VIEWS.map(([v, label, short]) => (
            <button
              key={v}
              type="button"
              aria-current={view === v ? 'page' : undefined}
              aria-label={short ? label : undefined}
              onClick={() => setView(v)}
              className={`rounded-sm px-3 py-1 text-sm max-sm:px-2 ${SECONDARY.includes(v) ? 'max-sm:hidden' : ''} ${view === v ? 'bg-shadow-2 text-bright' : 'text-dust hover:text-bright'}`}
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
      {error ? (
        <p role="alert" className="m-6 max-w-prose text-alert">
          The mission data didn't load: {error}. Check your connection and reload the page.
        </p>
      ) : !data ? (
        <p className="m-6 text-dust" aria-live="polite">
          Loading ephemeris and terrain…
        </p>
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
      ) : view === '3d' ? (
        <Suspense fallback={<p className="m-6 text-dust">Loading the 3D view…</p>}>
          <Globe3D data={data} />
        </Suspense>
      ) : (
        <Planner data={data} />
      )}
      <footer className="mt-10 border-t border-shadow-2 px-4 py-4 text-xs text-dust lg:px-6">
        <nav aria-label="About this project" className="flex flex-wrap gap-x-5 gap-y-2">
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

  const pin = usePin((s) => s.pin)
  const site = useMemo(() => (siteId === PIN_ID && pin ? pinSite(pin) : (data.sites.find((s) => s.id === siteId) ?? data.sites[0])), [siteId, pin, data])
  const pickable = useMemo(() => (pin ? [pinSite(pin), ...data.sites] : data.sites), [pin, data])
  const heightsM = data.horizons.heightsM
  const { heightIndex, heightM, mask, track, bodies, sunFrac, earthVis } = useSiteScene(data, site, site.mask_index < 0 ? pin?.masks : undefined)
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
    <div className="grid gap-6 px-4 py-4 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] lg:px-6">
      <aside className="order-2 lg:order-1">
        <SiteList sites={pickable} selected={site.id} onSelect={setSite} />
        <SiteMapPanel data={data} selected={site.id} onSelect={setSite} />
      </aside>
      <main className="order-1 min-w-0 lg:order-2">
        {/* On phones the site list comes after everything else, so the site can be changed here too */}
        <SitePicker label="Site" sites={pickable} value={site.id} onChange={setSite} className="mb-4 lg:hidden" />
        <MissionReplays data={data} />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <SiteHeader site={site} />
          <fieldset className="flex items-center gap-1 text-sm">
            <legend className="sr-only">Observer height</legend>
            {heightsM.map((h, i) => (
              <label
                key={h}
                className={`cursor-pointer rounded-sm border px-2 py-1 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-bright ${
                  i === heightIndex ? 'border-bright text-bright' : 'border-regolith text-dust'
                }`}
              >
                <input type="radio" name="height" className="sr-only" checked={i === heightIndex} onChange={() => setHeightIndex(i)} />
                {i === 0 ? `Lander, ${h} m` : `Mast, ${h} m`}
              </label>
            ))}
          </fieldset>
        </div>
        <div className="mt-4">
          <Panorama mask={mask} track={track} bodies={bodies} sunFrac={sunFrac} earthVis={earthVis} />
        </div>
        <TimeControls />
        <section aria-label="Timeline" className="mt-4">
          <Timeline rows={[{ label: site.name, series }]} startMs={startMs} endMs={endMs} />
          {metrics && (
            <p className="sr-only">
              Timeline summary: sunlit {metrics.sunMeanPct.toFixed(1)}% on average, Earth in view {metrics.earthPct.toFixed(1)}% of the
              time, both {metrics.bothPct.toFixed(1)}% in {metrics.windows.length} windows. The windows table lists exact times.
            </p>
          )}
        </section>
        <MetricsPanel metrics={metrics} pending={pending} />
        <DsnPanel series={series} />
        <div className="mt-8 grid gap-8 xl:grid-cols-2">
          <WindowsTable windows={metrics?.windows ?? []} onDownload={download} />
          <PowerPanel series={series} metrics={metrics} />
        </div>
        <MastPanel site={site} />
        <LroPanel site={site} />
      </main>
    </div>
  )
}
