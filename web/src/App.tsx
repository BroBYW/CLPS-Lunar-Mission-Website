import { formatUtc } from './lib/time.ts'

export default function App() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="font-display text-2xl font-medium">CLPS Lunar Mission Browser</h1>
      <p className="mt-4 max-w-prose text-dust">
        Pick a south pole site and a date range. See when it has sunlight, when it can see Earth,
        and how it compares to other sites.
      </p>
      <p className="tabular mt-8 text-sm text-dust">Build started {formatUtc(Date.now())}</p>
    </main>
  )
}
