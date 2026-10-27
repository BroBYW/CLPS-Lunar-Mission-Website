/**
 * Which way a phone is facing, for "look around": clockwise from north, in degrees. iOS gives it directly
 * (webkitCompassHeading); elsewhere it comes from the absolute device orientation. Held upright, a phone faces where
 * its back camera looks (the W3C Device Orientation spec's compass-heading example); lying flat, where its top
 * edge points.
 */
export function compassHeading(alpha: number, beta: number, gamma: number): number {
  const r = Math.PI / 180
  if (Math.abs(beta) < 20 && Math.abs(gamma) < 20) return (360 - alpha + 360) % 360
  const sX = Math.sin(beta * r)
  const cY = Math.cos(gamma * r)
  const sY = Math.sin(gamma * r)
  const cZ = Math.cos(alpha * r)
  const sZ = Math.sin(alpha * r)
  const vx = -cZ * sY - sZ * sX * cY
  const vy = -sZ * sY + cZ * sX * cY
  return ((Math.atan2(vx, vy) / r) % 360 + 360) % 360
}
