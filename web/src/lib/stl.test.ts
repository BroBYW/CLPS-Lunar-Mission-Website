import { describe, expect, it } from 'vitest'
import { terrainStl } from './stl.ts'

function readTriangles(buf: ArrayBuffer): number[][][] {
  const dv = new DataView(buf)
  const count = dv.getUint32(80, true)
  const out: number[][][] = []
  for (let t = 0; t < count; t++) {
    const o = 84 + t * 50 + 12
    out.push([0, 1, 2].map((v) => [0, 1, 2].map((c) => dv.getFloat32(o + (v * 3 + c) * 4, true))))
  }
  return out
}

describe('terrainStl', () => {
  const n = 9
  const heights = Float32Array.from({ length: n * n }, (_, k) => 100 * Math.sin(k))
  const buf = terrainStl(heights, n, 30, { step: 2, widthMm: 120, baseMm: 5, exaggeration: 2, title: 'CLPS test' })
  const tris = readTriangles(buf)

  it('has the expected triangle count and size', () => {
    const m = 5
    expect(tris.length).toBe(2 * (m - 1) ** 2 + 3 * 4 * (m - 1))
    expect(buf.byteLength).toBe(84 + tris.length * 50)
  })

  it('is watertight: every edge is shared by exactly two triangles, in opposite directions', () => {
    const key = (p: number[]) => p.map((v) => v.toFixed(4)).join(',')
    const edges = new Map<string, number>()
    for (const t of tris) {
      for (let k = 0; k < 3; k++) {
        const a = key(t[k])
        const b = key(t[(k + 1) % 3])
        edges.set(`${a}>${b}`, (edges.get(`${a}>${b}`) ?? 0) + 1)
      }
    }
    for (const [e, count] of edges) {
      const [a, b] = e.split('>')
      expect(count).toBe(1)
      expect(edges.get(`${b}>${a}`)).toBe(1)
    }
  })

  it('spans the print width and keeps the base flat', () => {
    const xs = tris.flat().map((p) => p[0])
    const zs = tris.flat().map((p) => p[2])
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(120, 3)
    expect(Math.min(...zs)).toBe(0)
    expect(Math.min(...zs.filter((z) => z > 0))).toBeGreaterThanOrEqual(5 - 1e-4)
  })
})
