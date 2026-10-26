/**
 * 3D-print file of the terrain around a site: one height grid as a watertight solid in binary STL, millimetres.
 * The top is the LOLA surface (heights above the 1737.4 km sphere, so the Moon's curvature is taken out), the sides
 * drop to a flat base, and the base is a fan from its centre so every edge is shared by exactly two triangles.
 */

export interface StlOptions {
  /** Use every step-th node of the grid */
  step: number
  /** Print width of the square, mm */
  widthMm: number
  /** Solid below the lowest point, mm */
  baseMm: number
  /** Vertical exaggeration (1 = true scale) */
  exaggeration: number
  /** ASCII header, at most 80 characters; must not start with "solid" */
  title: string
}

type V = [number, number, number]

/** heights: n × n, row 0 at +Y. Returns the binary STL. */
export function terrainStl(heights: Float32Array, n: number, spacingM: number, o: StlOptions): ArrayBuffer {
  const m = Math.floor((n - 1) / o.step) + 1
  const scale = o.widthMm / ((m - 1) * o.step * spacingM)
  let hMin = Infinity
  for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) hMin = Math.min(hMin, heights[j * o.step * n + i * o.step])
  const top = (i: number, j: number): V => [
    i * o.step * spacingM * scale,
    (m - 1 - j) * o.step * spacingM * scale,
    o.baseMm + (heights[j * o.step * n + i * o.step] - hMin) * scale * o.exaggeration,
  ]
  const bottom = (v: V): V => [v[0], v[1], 0]

  const tris: [V, V, V][] = []
  // Top surface, counter-clockwise seen from above
  for (let j = 0; j < m - 1; j++) {
    for (let i = 0; i < m - 1; i++) {
      const a = top(i, j + 1)
      const b = top(i + 1, j + 1)
      const c = top(i + 1, j)
      const d = top(i, j)
      tris.push([a, b, c], [a, c, d])
    }
  }
  // The boundary, counter-clockwise seen from above: bottom row, right column, top row, left column
  const ring: V[] = []
  for (let i = 0; i < m - 1; i++) ring.push(top(i, m - 1))
  for (let j = m - 1; j > 0; j--) ring.push(top(m - 1, j))
  for (let i = m - 1; i > 0; i--) ring.push(top(i, 0))
  for (let j = 0; j < m - 1; j++) ring.push(top(0, j))
  const centre: V = [((m - 1) * o.step * spacingM * scale) / 2, ((m - 1) * o.step * spacingM * scale) / 2, 0]
  for (let k = 0; k < ring.length; k++) {
    const p = ring[k]
    const q = ring[(k + 1) % ring.length]
    // Side wall, facing out
    tris.push([bottom(p), bottom(q), q], [bottom(p), q, p])
    // Base, facing down
    tris.push([centre, bottom(q), bottom(p)])
  }

  const buf = new ArrayBuffer(84 + tris.length * 50)
  const dv = new DataView(buf)
  const title = o.title.slice(0, 80)
  for (let k = 0; k < title.length; k++) dv.setUint8(k, title.charCodeAt(k) & 0x7f)
  dv.setUint32(80, tris.length, true)
  let off = 84
  for (const [a, b, c] of tris) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
    const wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2]
    let nx = uy * wz - uz * wy
    let ny = uz * wx - ux * wz
    let nz = ux * wy - uy * wx
    const l = Math.hypot(nx, ny, nz) || 1
    nx /= l
    ny /= l
    nz /= l
    for (const v of [nx, ny, nz, ...a, ...b, ...c]) {
      dv.setFloat32(off, v, true)
      off += 4
    }
    off += 2
  }
  return buf
}
