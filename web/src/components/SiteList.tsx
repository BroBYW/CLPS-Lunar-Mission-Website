import { GROUP_LABELS, GROUP_ORDER } from '../data/groups.ts'
import type { Site } from '../data/load.ts'
import { fmtLatLon } from '../lib/format.ts'
import { usePin } from '../state/pin.ts'

export function SiteList({ sites, selected, onSelect }: { sites: Site[]; selected: string; onSelect: (id: string) => void }) {
  const clearPin = usePin((s) => s.clear)
  return (
    <fieldset>
      <legend className="font-display text-lg font-medium">Sites</legend>
      {GROUP_ORDER.map((g) => {
        const items = sites.filter((s) => s.group === g)
        if (!items.length) return null
        return (
          <div key={g} className="mt-3">
            <p className="flex items-center justify-between text-xs text-dust">
              {GROUP_LABELS[g]}
              {g === 'pin' && (
                <button type="button" onClick={clearPin} className="underline decoration-regolith underline-offset-2 hover:text-bright">
                  Remove pin
                </button>
              )}
            </p>
            <ul className="mt-1">
              {items.map((s) => (
                <li key={s.id}>
                  <label
                    className={`flex cursor-pointer items-baseline gap-2 rounded-sm px-2 py-1 hover:bg-shadow-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-bright ${
                      s.id === selected ? 'bg-shadow-2 text-bright' : 'text-dust'
                    }`}
                  >
                    <input
                      type="radio"
                      name="site"
                      value={s.id}
                      checked={s.id === selected}
                      onChange={() => onSelect(s.id)}
                      aria-label={s.name}
                      aria-description={`${fmtLatLon(s.lat, s.lon, 1)}, ${s.kind === 'exact' ? 'published point' : 'approximate point for a region'}`}
                      className="sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={`inline-block size-2 shrink-0 translate-y-[-1px] rounded-full ${
                        s.kind === 'exact' ? 'bg-bright' : 'border border-bright'
                      }`}
                    />
                    <span className="flex-1 text-sm">{s.name}</span>
                    <span className="text-xs tabular text-dust">{fmtLatLon(s.lat, s.lon, 1)}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
      <p className="mt-3 text-xs text-dust">
        <span aria-hidden="true" className="mr-1 inline-block size-2 rounded-full bg-bright" /> published point{' '}
        <span aria-hidden="true" className="ml-3 mr-1 inline-block size-2 rounded-full border border-bright" /> approximate
        point for a region
      </p>
    </fieldset>
  )
}
