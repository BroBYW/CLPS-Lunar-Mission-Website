import { useState } from 'react'
import { fmtHours } from '../lib/format.ts'
import type { Window } from '../lib/metrics.ts'
import { formatUtc } from '../lib/time.ts'
import { useApp } from '../state/store.ts'

export function WindowsTable({ windows, onDownload }: { windows: Window[]; onDownload: () => void }) {
  const [showAll, setShowAll] = useState(false)
  const setTime = useApp((s) => s.setTime)
  const shown = showAll ? windows : windows.slice(0, 8)
  return (
    <section aria-label="Sun and Earth windows">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg font-medium">Windows with sunlight and Earth in view</h3>
        <button type="button" onClick={onDownload} className="rounded-sm border border-regolith px-3 py-1 text-sm hover:border-dust">
          Download CSV
        </button>
      </div>
      {windows.length === 0 ? (
        <p className="mt-2 text-sm text-dust">No overlap in these dates: the Sun and Earth are never both visible.</p>
      ) : (
        <table className="mt-2 w-full text-sm tabular">
          <caption className="sr-only">Overlap windows, UTC. Select a start time to jump there.</caption>
          <thead>
            <tr className="text-left text-xs text-dust">
              <th scope="col" className="py-1 font-normal">Start (UTC)</th>
              <th scope="col" className="py-1 font-normal">End (UTC)</th>
              <th scope="col" className="py-1 text-right font-normal">Duration</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((w) => (
              <tr key={w.startMs} className="border-t border-shadow-2">
                <td className="py-1">
                  <button type="button" className="underline decoration-regolith underline-offset-2 hover:decoration-bright" onClick={() => setTime(w.startMs)}>
                    {formatUtc(w.startMs)}
                  </button>
                </td>
                <td className="py-1 text-dust">{formatUtc(w.endMs)}</td>
                <td className="py-1 text-right">{fmtHours(w.hours)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {windows.length > 8 && (
        <button type="button" className="mt-2 text-sm text-dust underline underline-offset-2 hover:text-bright" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show fewer' : `Show all ${windows.length} windows`}
        </button>
      )}
    </section>
  )
}
