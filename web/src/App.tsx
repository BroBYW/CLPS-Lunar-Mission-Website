import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { CompareView } from './components/CompareView.tsx'
import { MetricsPanel } from './components/MetricsPanel.tsx'
import { Panorama } from './components/Panorama.tsx'
import { PowerPanel } from './components/PowerPanel.tsx'
import { SiteHeader } from './components/SiteHeader.tsx'
import { SiteList } from './components/SiteList.tsx'
import { SiteMap } from './components/SiteMap.tsx'
import { Timeline } from './components/Timeline.tsx'
import { TimeControls } from './components/TimeControls.tsx'
import { WindowsTable } from './components/WindowsTable.tsx'
import { loadAppData, type AppData } from './data/load.ts'
import { downloadText, windowsCsv } from './lib/csv.ts'
import { computeMetrics } from './lib/metrics.ts'
import { formatUtcDate } from './lib/time.ts'
import { usePlayback } from './state/playback.ts'
import { useApp, type View } from './state/store.ts'
import { applyUrl, syncUrl } from './state/url.ts'
import { useSiteScene } from './state/useSiteScene.ts'
import Explore from './views/Explore.tsx'
import { Home, Logo } from './views/Home.tsx'
import { initWorker, seriesRequest, useSeries } from './workers/client.ts'

const VIEWS: [View, string][] = [
  ['plan', 'Plan'],
  ['compare', 'Compare'],
  ['3d', '3D'],
  ['explore', 'Explore'],
]

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
          <p className="text-sm text-dust max-md:hidden">Sunlight and Earth visibility at lunar south pole sites, 2026–2030</p>
        </div>
        <nav aria-label="Views" className="-mx-1 ml-auto flex gap-1 max-sm:w-full max-sm:overflow-x-auto">
          {VIEWS.map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-current={view === v ? 'page' : undefined}
              onClick={() => setView(v)}
              className={`rounded-sm px-3 py-1 text-sm ${view === v ? 'bg-shadow-2 text-bright' : 'text-dust hover:text-bright'}`}
            >
              {label}
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
      ) : view === 'explore' ? (
        <Explore data={data} />
      ) : view === '3d' ? (
        <Suspense fallback={<p className="m-6 text-dust">Loading the 3D view…</p>}>
          <Globe3D data={data} />
        </Suspense>
      ) : (
        <Planner data={data} />
      )}
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

  const site = data.sites.find((s) => s.id === siteId) ?? data.sites[0]
  const heightsM = data.horizons.heightsM
  const { heightIndex, heightM, mask, track, bodies, sunFrac, earthVis } = useSiteScene(data, site)
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
        <SiteList sites={data.sites} selected={site.id} onSelect={setSite} />
        <SiteMap sites={data.sites} selected={site.id} onSelect={setSite} basemap={data.basemap} basemapUrl={data.basemapUrl} />
      </aside>
      <main className="order-1 min-w-0 lg:order-2">
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
        <div className="mt-8 grid gap-8 xl:grid-cols-2">
          <WindowsTable windows={metrics?.windows ?? []} onDownload={download} />
          <PowerPanel series={series} metrics={metrics} />
        </div>
      </main>
    </div>
  )
}
