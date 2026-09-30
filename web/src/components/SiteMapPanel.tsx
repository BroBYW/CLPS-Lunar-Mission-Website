import { useState } from 'react'
import type { AppData } from '../data/load.ts'
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
        <h3 className="font-display text-lg font-medium">Map</h3>
        <div role="group" aria-label="Map style" className="flex gap-1">
          {btn('globe', '3D Moon')}
          {btn('flat', 'Flat map')}
        </div>
      </div>
      {shown === 'globe' ? (
        <>
          <SiteGlobe data={data} selected={selected} onSelect={onSelect} onFail={() => setFailed(true)} />
          <p className="mt-2 text-xs text-dust">
            Drag to turn, scroll to zoom, click a site to select it. Lit by the Sun at the time shown. Relief: LRO LOLA;
            imagery: NASA Moon Trek, LRO WAC. Dashed squares are Artemis region footprints (2022 list).
          </p>
        </>
      ) : (
        <SiteMap sites={data.sites} selected={selected} onSelect={onSelect} basemap={data.basemap} basemapUrl={data.basemapUrl} />
      )}
      {failed && <p className="mt-2 text-xs text-dust">The 3D Moon needs WebGL, which this browser didn't provide, so the flat map is shown.</p>}
    </section>
  )
}
