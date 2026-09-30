import { windowsOf, type Criteria } from './metrics.ts'
import type { Series } from './series.ts'

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16) + 'Z'

/** Sunlit, Earth-visible and overlap windows for one or more sites, one row per window. */
export function windowsCsv(entries: { siteId: string; series: Series }[], c: Criteria, heightM: number): string {
  const lines = ['site,observer_height_m,type,start_utc,end_utc,duration_h']
  for (const { siteId, series: s } of entries) {
    const lit = (i: number) => s.fSun[i] > c.darkThreshold
    const earth = (i: number) => s.earthClear[i] > c.earthMarginDeg
    const kinds: [string, (i: number) => boolean][] = [
      ['sunlit', lit],
      ['earth_visible', earth],
      ['both', (i) => lit(i) && earth(i)],
    ]
    for (const [type, pred] of kinds) {
      for (const w of windowsOf(s, pred)) {
        lines.push([siteId, heightM, type, iso(w.startMs), iso(w.endMs), w.hours.toFixed(2)].join(','))
      }
    }
  }
  return lines.join('\n') + '\n'
}

export function downloadText(filename: string, text: string, type = 'text/csv'): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
