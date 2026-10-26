import { useState } from 'react'
import type { AppData } from '../data/load.ts'
import { usePin } from '../state/pin.ts'
import { SiteGlobe } from './SiteGlobe.tsx'
import { SiteMap } from './SiteMap.tsx'

type Mode = 'globe' | 'flat'
const KEY = 'clps.mapMode'

function stored(): Mode {
  try {
    return localStorage.getItem(KEY) === 'flat' ? 'flat' : 'globe'
  } catch {
    return 'globe'
  }
}

/** The site map: a 3D Moon by default, the flat polar map on request or when WebGL is missing. */
export function SiteMapPanel({ data, selected, onSelect }: { data: AppData; selected: string; onSelect: (id: string) => void }) {
  const [mode, setMode] = useState<Mode>(stored)
  const [failed, setFailed] = useState(false)
  const shown: Mode = failed ? 'flat' : mode
  const choose = (m: Mode) => {
    setMode(m)
    try {
      localStorage.setItem(KEY, m)
    } catch {
      /* private mode: the choice just isn't remembered */
    }
  }
  const pin = usePin((s) => s.pin)
  const armed = usePin((s) => s.armed)
  const status = usePin((s) => s.status)
  const pinError = usePin((s) => s.error)
  const arm = usePin((s) => s.arm)
  const drop = usePin((s) => s.drop)
  const onPick = armed ? (lat: number, lon: number) => void drop(lat, lon, data.horizons.heightsM) : undefined
  const btn = (m: Mode, label: string) => (
    <button
      type="button"
      aria-pressed={shown === m}
      disabled={m === 'globe' && failed}
      onClick={() => choose(m)}
      className={`rounded-sm px-2 py-1 text-xs ${shown === m ? 'bg-shadow-2 text-bright' : 'text-dust hover:text-bright'} disabled:opacity-40`}
    >
      {label}
    </button>
  )

  return (
    <section aria-label="Map of the sites" className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-lg font-medium">Map</h2>
        <div role="group" aria-label="Map style" className="flex gap-1">
          {btn('globe', '3D Moon')}
          {btn('flat', 'Flat map')}
        </div>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          aria-pressed={armed}
          onClick={() => arm(!armed)}
          disabled={status === 'loading'}
          className="rounded-sm border border-regolith px-2 py-1 text-xs text-dust hover:border-dust hover:text-bright aria-pressed:border-sun aria-pressed:text-sun disabled:opacity-50"
        >
          {armed ? 'Cancel pin' : pin ? 'Move the pin' : 'Drop a pin'}
        </button>
        <p className={`text-xs ${status === 'failed' ? 'text-alert' : 'text-dust'}`} aria-live="polite">
          {status === 'loading'
            ? 'Casting the horizon from a 480 m map…'
            : status === 'failed'
              ? pinError
              : armed
                ? 'Click anywhere south of 82°S for a rough horizon there.'
                : ''}
        </p>
      </div>
      {shown === 'globe' ? (
        <>
          <SiteGlobe data={data} selected={selected} onSelect={onSelect} onFail={() => setFailed(true)} pin={pin} onPick={onPick} />
          <p className="mt-2 text-xs text-dust">
            Drag to turn, scroll to zoom, click a site to select it. Lit by the Sun at the time shown. Relief: LRO LOLA;
            imagery: NASA Moon Trek, LRO WAC. Dashed squares are Artemis region footprints (2022 list).
          </p>
        </>
      ) : (
        <SiteMap sites={data.sites} selected={selected} onSelect={onSelect} basemap={data.basemap} basemapUrl={data.basemapUrl} pin={pin} onPick={onPick} />
      )}
      {failed && <p className="mt-2 text-xs text-dust">The 3D Moon needs WebGL, which this browser didn't provide, so the flat map is shown.</p>}
    </section>
  )
}
