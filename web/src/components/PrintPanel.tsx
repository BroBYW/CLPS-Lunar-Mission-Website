import { useId, useState } from 'react'
import type { Site } from '../data/load.ts'
import { terrainStl } from '../lib/stl.ts'

/** Grids of the site's terrain patch that make good prints, by name (pipeline/scripts/terrain_patches.py). */
const AREAS = [
  { grid: 'fine', label: '12 km across, 30 m detail' },
  { grid: 'mid', label: '48 km across, 120 m detail' },
  { grid: 'coarse', label: '96 km across, 240 m detail' },
]
const EXAGGERATIONS = [1, 2, 3]
const WIDTH_MM = 150
const BASE_MM = 6

/** Download the LOLA terrain around a site as a 3D-print file (lib/stl.ts). Lives in the 3D view's lazy chunk. */
export function PrintPanel({ site }: { site: Site }) {
  const [area, setArea] = useState('fine')
  const [exaggeration, setExaggeration] = useState(2)
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle')
  const ids = { area: useId(), ex: useId() }

  const download = async () => {
    setState('busy')
    try {
      const { loadPatch } = await import('../globe/terrainPatch.ts')
      const patch = await loadPatch(site.id)
      const g = patch.grids.find((x) => x.name === area)
      if (!g) throw new Error(`no ${area} grid`)
      const km = Math.round(((patch.n - 1) * g.spacing_m) / 1000)
      const buf = terrainStl(g.heights, patch.n, g.spacing_m, {
        step: 2,
        widthMm: WIDTH_MM,
        baseMm: BASE_MM,
        exaggeration,
        title: `CLPS Lunar Mission Browser: ${site.name}, LOLA terrain ${km} km, height x${exaggeration}`,
      })
      const url = URL.createObjectURL(new Blob([buf], { type: 'model/stl' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${site.id}-${km}km-x${exaggeration}.stl`
      a.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setState('idle')
    } catch {
      setState('failed')
    }
  }

  const select = 'rounded-sm border border-regolith bg-sky px-2 py-1 text-sm text-bright'
  return (
    <section aria-label="3D print" className="mt-8">
      <h3 className="font-display text-lg font-medium">3D-print this site</h3>
      <p className="mt-1 max-w-prose text-xs text-dust">
        The LOLA terrain around {site.name} as an STL file for a 3D printer: a {WIDTH_MM} mm square on a {BASE_MM} mm base, with the
        Moon's curvature taken out. Raising the heights makes low polar relief easier to see and feel.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-3">
        <label htmlFor={ids.area} className="flex flex-col gap-1 text-xs text-dust">
          Area
          <select id={ids.area} value={area} onChange={(e) => setArea(e.target.value)} className={select}>
            {AREAS.map((a) => (
              <option key={a.grid} value={a.grid}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={ids.ex} className="flex flex-col gap-1 text-xs text-dust">
          Heights
          <select id={ids.ex} value={exaggeration} onChange={(e) => setExaggeration(Number(e.target.value))} className={select}>
            {EXAGGERATIONS.map((x) => (
              <option key={x} value={x}>
                {x === 1 ? 'True scale' : `× ${x}`}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void download()}
          disabled={state === 'busy'}
          className="rounded-sm border border-regolith px-3 py-1 text-sm hover:border-dust disabled:opacity-50"
        >
          {state === 'busy' ? 'Preparing…' : 'Download STL (about 4 MB)'}
        </button>
      </div>
      {state === 'failed' && (
        <p role="alert" className="mt-2 text-sm text-alert">
          The terrain for this site didn't load, so there is nothing to print. Try again.
        </p>
      )}
    </section>
  )
}
