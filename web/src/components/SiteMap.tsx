import type { MouseEvent } from 'react'
import type { BasemapMeta, Site } from '../data/load.ts'
import { R_MOON_KM } from '../lib/astro.ts'
import { fromStereo } from '../lib/pinHorizon.ts'

/** South polar stereographic on the 1737.4 km sphere (same grid as the LOLA maps and the basemap). */
function polarStereo(lat: number, lon: number): [number, number] {
  const la = (lat * Math.PI) / 180
  const lo = (lon * Math.PI) / 180
  const rho = 2 * R_MOON_KM * 1000 * Math.tan(Math.PI / 4 + la / 2)
  return [rho * Math.sin(lo), rho * Math.cos(lo)]
}

const SIZE = 1000

export function SiteMap({
  sites,
  selected,
  onSelect,
  basemap,
  basemapUrl,
  pin,
  onPick,
}: {
  sites: Site[]
  selected: string
  onSelect: (id: string) => void
  basemap: BasemapMeta
  basemapUrl: string
  /** A dropped pin to mark */
  pin?: { lat: number; lon: number } | null
  /** When set, a click anywhere picks that point instead of selecting a site */
  onPick?: (lat: number, lon: number) => void
}) {
  const [x0, y0, x1, y1] = basemap.extent_m
  const px = (lat: number, lon: number): [number, number] => {
    const [x, y] = polarStereo(lat, lon)
    return [((x - x0) / (x1 - x0)) * SIZE, ((y1 - y) / (y1 - y0)) * SIZE]
  }
  const pick = (e: MouseEvent<SVGSVGElement>) => {
    if (!onPick) return
    const r = e.currentTarget.getBoundingClientRect()
    const x = x0 + ((e.clientX - r.left) / r.width) * (x1 - x0)
    const y = y1 - ((e.clientY - r.top) / r.height) * (y1 - y0)
    onPick(...fromStereo(x, y))
  }
  const ring = (lat: number) => {
    const [x] = polarStereo(lat, 90)
    return (x / (x1 - x0)) * SIZE
  }
  const sel = sites.find((s) => s.id === selected)

  return (
    <figure>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className={`block w-full rounded-sm ${onPick ? 'cursor-crosshair' : ''}`}
        onClick={pick}
        role="img"
        aria-label={`Map of the lunar south pole to about 83° south, with ${sites.length} sites. ${sel ? `Selected: ${sel.name}.` : ''}`}
      >
        <image href={basemapUrl} x={0} y={0} width={SIZE} height={SIZE} preserveAspectRatio="none" />
        <g fill="none" stroke="var(--color-bright)" strokeOpacity={0.18} strokeWidth={1.5}>
          {[85, 88].map((l) => (
            <circle key={l} cx={SIZE / 2} cy={SIZE / 2} r={ring(-l)} />
          ))}
          <line x1={SIZE / 2} y1={0} x2={SIZE / 2} y2={SIZE} />
          <line x1={0} y1={SIZE / 2} x2={SIZE} y2={SIZE / 2} />
        </g>
        <g className="fill-dust text-[26px]" aria-hidden="true">
          <text x={SIZE / 2 + 8} y={30}>0° (toward Earth)</text>
          <text x={SIZE - 12} y={SIZE / 2 - 10} textAnchor="end">90°E</text>
          <text x={SIZE / 2 + 8} y={SIZE - 14}>180°</text>
          <text x={12} y={SIZE / 2 - 10}>90°W</text>
          <text x={SIZE / 2 + ring(-85) + 6} y={SIZE / 2 + 30}>85°S</text>
        </g>

        {sites.map((s) =>
          s.footprint_lonlat ? (
            <polygon
              key={`fp-${s.id}`}
              points={s.footprint_lonlat.map(([lon, lat]) => px(lat, lon).join(',')).join(' ')}
              fill="none"
              stroke="var(--color-bright)"
              strokeOpacity={s.id === selected ? 0.9 : 0.35}
              strokeDasharray="6 6"
              strokeWidth={2}
            />
          ) : null,
        )}

        {sites.map((s) => {
          const [cx, cy] = px(s.lat, s.lon)
          const isSel = s.id === selected
          return (
            <g key={s.id} onClick={() => !onPick && onSelect(s.id)} className={onPick ? '' : 'cursor-pointer'} aria-hidden="true">
              <title>{s.name}</title>
              <circle cx={cx} cy={cy} r={18} fill="transparent" />
              <circle
                cx={cx}
                cy={cy}
                r={isSel ? 11 : 8}
                fill={s.kind === 'exact' ? 'var(--color-bright)' : 'var(--color-sky)'}
                stroke="var(--color-bright)"
                strokeWidth={3}
              />
              {isSel && <circle cx={cx} cy={cy} r={20} fill="none" stroke="var(--color-bright)" strokeWidth={2} />}
            </g>
          )
        })}

        {pin &&
          (() => {
            const [cx, cy] = px(pin.lat, pin.lon)
            return (
              <g aria-hidden="true">
                <path d={`M${cx},${cy - 16}L${cx + 10},${cy}L${cx},${cy + 16}L${cx - 10},${cy}Z`} fill="var(--color-sun)" stroke="var(--color-sky)" strokeWidth={3} />
              </g>
            )
          })()}

        {sel &&
          (() => {
            const [cx, cy] = px(sel.lat, sel.lon)
            const right = cx < SIZE * 0.6
            return (
              <text
                x={right ? cx + 30 : cx - 30}
                y={cy + 9}
                textAnchor={right ? 'start' : 'end'}
                className="fill-bright text-[30px]"
                stroke="var(--color-sky)"
                strokeWidth={6}
                paintOrder="stroke"
                aria-hidden="true"
              >
                {sel.name}
              </text>
            )
          })()}
      </svg>
      <figcaption className="mt-2 text-xs text-dust">
        LOLA hillshade, polar stereographic. Dashed squares are Artemis region footprints (2022 list).
      </figcaption>
    </figure>
  )
}
