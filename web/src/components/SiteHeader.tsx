import type { Site } from '../data/load.ts'
import { fmtLatLon } from '../lib/format.ts'
import { GROUP_LABELS } from '../data/groups.ts'

export function SiteHeader({ site }: { site: Site }) {
  return (
    <header>
      <p className="text-xs text-dust">{GROUP_LABELS[site.group]}</p>
      <h2 className="font-display text-2xl font-medium">{site.name}</h2>
      <p className="mt-1 text-sm tabular text-dust">
        {fmtLatLon(site.lat, site.lon, 4)}. Terrain {site.height_m.toFixed(0)} m above the 1737.4 km reference sphere.
      </p>
      <details className="mt-2 max-w-prose text-sm text-dust">
        <summary className="cursor-pointer text-bright">
          {site.kind === 'exact' ? 'Published point' : 'Approximate point'}: where this comes from
        </summary>
        <p className="mt-2">{site.point}.</p>
        <p className="mt-1">
          Source:{' '}
          <a href={site.url} className="text-bright underline decoration-regolith underline-offset-2 hover:decoration-bright" target="_blank" rel="noreferrer">
            {site.source}
          </a>
        </p>
        {site.notes && <p className="mt-1">{site.notes}</p>}
      </details>
    </header>
  )
}
