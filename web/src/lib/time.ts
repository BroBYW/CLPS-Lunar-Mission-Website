export const MINUTE_MS = 60_000
export const HOUR_MS = 3_600_000
export const DAY_MS = 86_400_000

const pad = (n: number) => String(n).padStart(2, '0')

/** "2027-03-14 06:00 UTC" */
export function formatUtc(ms: number): string {
  const d = new Date(ms)
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
  )
}

/** "2027-03-14" */
export function formatUtcDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** Parses "YYYY-MM-DD" (midnight UTC) or a full ISO string. Returns NaN when invalid. */
export function parseUtc(s: string): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Date.parse(`${s}T00:00:00Z`)
  return Date.parse(s)
}
