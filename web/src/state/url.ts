/**
 * Shareable URL (PLAN.md §8 feature 11): the view, site(s), dates, time, observer height and criteria
 * live in the query string, e.g. ?site=connecting-ridge&from=2027-01-01&to=2027-01-31&t=2027-01-12T06:00Z&h=2
 */

import { formatUtcDate, parseUtc } from '../lib/time.ts'
import { DAY_MS } from '../lib/time.ts'
import { MAX_MS, MIN_MS, useApp, type View } from './store.ts'

function isoMinute(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16) + 'Z'
}

export function applyUrl(search: string, siteIds: string[], heightsM: number[]): void {
  const q = new URLSearchParams(search)
  const s = useApp.getState()
  const view = q.get('view')
  // A bare URL opens the home page; any shared state opens the app directly
  if (view === 'plan' || view === 'compare' || view === '3d') s.setView(view as View)
  else if ([...q.keys()].length > 0) s.setView('plan')
  const site = q.get('site')
  if (site && siteIds.includes(site)) s.setSite(site)
  const cmp = q.get('cmp')
  if (cmp) {
    const ids = cmp.split(',').filter((id) => siteIds.includes(id))
    if (ids.length) s.setCompare(ids)
  }
  const from = parseUtc(q.get('from') ?? '')
  const to = parseUtc(q.get('to') ?? '')
  if (!Number.isNaN(from) && from >= MIN_MS && from < MAX_MS) {
    const end = !Number.isNaN(to) && to >= from ? Math.min(MAX_MS, to + DAY_MS) : Math.min(MAX_MS, from + 30 * DAY_MS)
    s.setRange(from, end)
  }
  const t = parseUtc(q.get('t') ?? '')
  if (!Number.isNaN(t)) s.setTime(t)
  const h = Number(q.get('h'))
  const hi = heightsM.indexOf(h)
  if (hi >= 0) s.setHeightIndex(hi)
  const dark = Number(q.get('dark'))
  if (q.has('dark') && Number.isFinite(dark)) s.setDarkThreshold(dark / 100)
  const margin = Number(q.get('margin'))
  if (q.has('margin') && Number.isFinite(margin)) s.setEarthMargin(margin)
}

export function buildQuery(heightsM: number[]): string {
  const s = useApp.getState()
  if (s.view === 'home') return ''
  const q = new URLSearchParams()
  if (s.view !== 'plan') q.set('view', s.view)
  q.set('site', s.siteId)
  if (s.view === 'compare') q.set('cmp', s.compareIds.join(','))
  q.set('from', formatUtcDate(s.startMs))
  q.set('to', formatUtcDate(s.endMs - DAY_MS))
  q.set('t', isoMinute(s.timeMs))
  q.set('h', String(heightsM[s.heightIndex]))
  if (s.darkThreshold > 0) q.set('dark', String(Math.round(s.darkThreshold * 100)))
  if (s.earthMarginDeg > 0) q.set('margin', String(s.earthMarginDeg))
  return `?${q.toString()}`
}

/** Keep the address bar in step with the state (not while playing, to avoid flooding history). */
export function syncUrl(heightsM: number[]): () => void {
  let timer = 0
  return useApp.subscribe((s, prev) => {
    if (s.playing && prev.playing) return
    clearTimeout(timer)
    timer = window.setTimeout(() => {
      const next = buildQuery(heightsM)
      if (next !== window.location.search) window.history.replaceState(null, '', next || window.location.pathname)
    }, 250)
  })
}
