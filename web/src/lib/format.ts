export function fmtLat(lat: number, digits = 2): string {
  return `${Math.abs(lat).toFixed(digits)}°${lat < 0 ? 'S' : 'N'}`
}

export function fmtLon(lon: number, digits = 2): string {
  const l = ((((lon + 180) % 360) + 360) % 360) - 180
  return `${Math.abs(l).toFixed(digits)}°${l < 0 ? 'W' : 'E'}`
}

export function fmtLatLon(lat: number, lon: number, digits = 2): string {
  return `${fmtLat(lat, digits)}, ${fmtLon(lon, digits)}`
}

export function fmtDeg(v: number, digits = 1): string {
  return `${v.toFixed(digits)}°`
}

export function fmtPct(fraction: number, digits = 0): string {
  return `${(fraction * 100).toFixed(digits)}%`
}

export function fmtHours(h: number): string {
  if (h >= 48) return `${h.toFixed(0)} h (${(h / 24).toFixed(1)} days)`
  return `${h.toFixed(1)} h`
}

const CARDINALS: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }

export function azLabel(az: number): string {
  const a = ((Math.round(az) % 360) + 360) % 360
  return CARDINALS[a] ?? `${a}°`
}
