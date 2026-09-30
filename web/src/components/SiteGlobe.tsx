import { useEffect, useRef, useState } from 'react'
import type { AppData } from '../data/load.ts'
import { useApp } from '../state/store.ts'

type MoonMod = typeof import('../globe/moonViewer.ts')
type LayerMod = typeof import('../globe/siteLayer.ts')

const START_DISTANCE_M = 720_000

/**
 * The site picker as a 3D Moon: every site on the surface, lit by the Sun at the time shown. Drag to turn,
 * scroll to zoom, click a site to select it. Loads CesiumJS lazily; calls onFail if WebGL isn't available.
 */
export function SiteGlobe({ data, selected, onSelect, onFail }: { data: AppData; selected: string; onSelect: (id: string) => void; onFail: () => void }) {
  const container = useRef<HTMLDivElement>(null)
  const inst = useRef<{ mod: MoonMod; mv: ReturnType<MoonMod['createMoonViewer']>; layer: ReturnType<LayerMod['addSiteLayer']> } | null>(null)
  const [ready, setReady] = useState(false)
  const timeMs = useApp((s) => s.timeMs)
  const v = useRef(new Float64Array(6))
  const selectRef = useRef(onSelect)
  selectRef.current = onSelect

  useEffect(() => {
    let cancelled = false
    Promise.all([import('../globe/moonViewer.ts'), import('../globe/siteLayer.ts')])
      .then(([mod, sl]) => {
        if (cancelled || !container.current) return
        const mv = mod.createMoonViewer(container.current, { interactive: true, showBodies: false })
        mv.viewer.cesiumWidget.creditContainer.setAttribute('style', 'display:none') // credited below the globe
        const cam = mv.viewer.scene.screenSpaceCameraController
        cam.minimumZoomDistance = 25_000
        cam.maximumZoomDistance = 5_000_000
        void mod.addPolarCap(mv.viewer)
        const layer = sl.addSiteLayer(mv.viewer, data.sites, { onSelect: (id) => selectRef.current(id), selected })
        mod.viewSouthPole(mv.viewer, START_DISTANCE_M)
        inst.current = { mod, mv, layer }
        setReady(true)
      })
      .catch(onFail)
    return () => {
      cancelled = true
      inst.current?.layer.destroy()
      inst.current?.mv.destroy()
      inst.current = null
    }
    // Created once per data set; selection and time are pushed in by the effects below
  }, [data])

  useEffect(() => {
    inst.current?.layer.select(selected)
  }, [selected, ready])

  useEffect(() => {
    const i = inst.current
    if (!i) return
    data.ephemeris.sample(timeMs, v.current)
    i.mv.setSun(v.current)
  }, [timeMs, ready, data])

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-sm bg-sky">
      <div ref={container} className="absolute inset-0" aria-hidden="true" />
      {!ready && <p className="absolute inset-0 flex items-center justify-center text-sm text-dust">Loading the 3D Moon…</p>}
      {ready && (
        <button
          type="button"
          onClick={() => inst.current && inst.current.mod.viewSouthPole(inst.current.mv.viewer, START_DISTANCE_M)}
          className="absolute right-2 top-2 rounded-sm border border-regolith bg-sky/70 px-2 py-1 text-xs text-dust backdrop-blur-sm hover:border-dust hover:text-bright"
        >
          Reset view
        </button>
      )}
    </div>
  )
}
