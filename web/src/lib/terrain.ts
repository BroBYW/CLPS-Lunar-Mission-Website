/**
 * LOLA terrain patches for the 3D views (pipeline/scripts/terrain_patches.py): decoding, Moon-fixed vertex
 * positions, and how much of the Sun each node sees. Heights are metres above the 1737.4 km sphere; positions
 * are metres in the Moon-fixed frame, like the ephemeris (MOON_ME).
 */

export interface GridSpec {
  name: string
  spacing_m: number
  half_m: number
  unit_m: number
}

export interface Grid extends GridSpec {
  /** n × n, row-major, row 0 at +Y in the polar stereographic plane. */
  heights: Float32Array
}

export interface Patch {
  n: number
  /** The site, in polar stereographic metres. */
  center: [number, number]
  /** Finest first: each grid is centred on the site and covers the one before it. */
  grids: Grid[]
}

export const R_M = 1_737_400
const F = 4 * R_M * R_M

/** Undo the planar predictor (value = residual + left + up − upleft), scale to metres and add the base height. */
export function decodeGrid(res: Int16Array, offset: number, n: number, unit: number, base = 0): Float32Array {
  const q = new Int32Array(n * n)
  const out = new Float32Array(n * n)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i
      const left = i > 0 ? q[k - 1] : 0
      const up = j > 0 ? q[k - n] : 0
      const upLeft = i > 0 && j > 0 ? q[k - n - 1] : 0
      q[k] = res[offset + k] + left + up - upLeft
      out[k] = q[k] * unit + base
    }
  }
  return out
}

/** Moon-fixed position (m) of a point given in polar stereographic metres and height above the sphere. */
export function stereoToMoonFixed(x: number, y: number, h: number, out: Float64Array, k = 0): void {
  // Inverse of x = 2R·py/(1 − pz), y = 2R·px/(1 − pz) for a unit vector p (south polar aspect)
  const rho2 = x * x + y * y
  const d = (R_M + h) / (rho2 + F)
  out[k] = 4 * R_M * y * d
  out[k + 1] = 4 * R_M * x * d
  out[k + 2] = (rho2 - F) * d
}

/** Stereographic coordinates of node (i, j). */
export function nodeXY(p: Patch, g: GridSpec, i: number, j: number): [number, number] {
  return [p.center[0] - g.half_m + i * g.spacing_m, p.center[1] + g.half_m - j * g.spacing_m]
}

export function gridPositions(p: Patch, g: Grid): Float64Array {
  const { n } = p
  const pos = new Float64Array(n * n * 3)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const [x, y] = nodeXY(p, g, i, j)
      stereoToMoonFixed(x, y, g.heights[j * n + i], pos, (j * n + i) * 3)
    }
  }
  return pos
}

/** Unit surface normals from central differences, pointing away from the Moon's centre. */
export function gridNormals(pos: Float64Array, n: number): Float32Array {
  const nor = new Float32Array(n * n * 3)
  const at = (i: number, j: number, c: number) => pos[(Math.min(n - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i))) * 3 + c]
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const ax = at(i + 1, j, 0) - at(i - 1, j, 0)
      const ay = at(i + 1, j, 1) - at(i - 1, j, 1)
      const az = at(i + 1, j, 2) - at(i - 1, j, 2)
      const bx = at(i, j - 1, 0) - at(i, j + 1, 0)
      const by = at(i, j - 1, 1) - at(i, j + 1, 1)
      const bz = at(i, j - 1, 2) - at(i, j + 1, 2)
      let nx = ay * bz - az * by
      let ny = az * bx - ax * bz
      let nz = ax * by - ay * bx
      const k = (j * n + i) * 3
      if (nx * pos[k] + ny * pos[k + 1] + nz * pos[k + 2] < 0) {
        nx = -nx
        ny = -ny
        nz = -nz
      }
      const len = Math.hypot(nx, ny, nz) || 1
      nor[k] = nx / len
      nor[k + 1] = ny / len
      nor[k + 2] = nz / len
    }
  }
  return nor
}

/** Visible fraction of a disk whose centre is x radii above a straight horizon. */
export function diskAbove(x: number): number {
  if (x >= 1) return 1
  if (x <= -1) return 0
  return (Math.acos(-x) + x * Math.sqrt(1 - x * x)) / Math.PI
}

interface Lines {
  /** Line b lies at lateral offset (b − b0)·w from the site; sample s at along offset a0 − s·w. */
  b0: number
  count: number
  m: number
  w: number
  a0: number
  /** Running maximum along each line of the distance from the Sun axis (minus R), and where it was reached. */
  hmax: Float32Array
  aAt: Float32Array
  /** The samples of each line that fall on this grid; earlier samples defer to the coarser grid. */
  entry: Int32Array
  exit: Int32Array
}

const NONE = -1e30
/** How far outside a grid (in cells) a line still samples its edge. */
const EDGE = 1.5

// Results of lookup(), kept in module scope so the hot loops allocate nothing
let foundH = NONE
let foundA = 0

/**
 * How much of the Sun each node of a patch sees. Lines parallel to the Sun's direction are sampled across each
 * grid from the sunward edge. For the Sun's direction s through the Moon's centre, a node sees the Sun's centre
 * when no sunward point on its line lies further from that axis (on a smooth sphere this gives exactly the
 * terminator). Coarser grids hand their running maxima to finer grids where those begin, so ridges out to the
 * far grid's edge (300 km, like the horizon masks) shade the site. The Sun's disk is treated as partly hidden
 * by the highest such point, which gives a penumbra.
 */
export class TerrainSun {
  readonly patch: Patch
  /** Moon-fixed node positions per grid, finest first. */
  readonly positions: Float64Array[]
  private readonly levels: Lines[]

  constructor(patch: Patch) {
    this.patch = patch
    this.positions = patch.grids.map((g) => gridPositions(patch, g))
    this.levels = patch.grids.map((g) => {
      const w = g.spacing_m
      const b0 = Math.ceil((g.half_m * Math.SQRT2) / w) + 2
      const count = 2 * b0 + 1
      return { b0, count, m: count, w, a0: b0 * w, hmax: new Float32Array(count * count), aAt: new Float32Array(count * count), entry: new Int32Array(count), exit: new Int32Array(count) }
    })
  }

  /** sun: vector toward the Sun, Moon-fixed (any length). Fills and returns one array per grid, 0–1. */
  compute(sun: ArrayLike<number>, sunRadiusRad: number, out?: Float32Array[]): Float32Array[] {
    const p = this.patch
    const { n } = p
    const [cx, cy] = p.center
    const sl = Math.hypot(sun[0], sun[1], sun[2])
    const sx = sun[0] / sl
    const sy = sun[1] / sl
    const sz = sun[2] / sl
    // Toward the Sun in the stereographic plane (stereo x follows Moon-fixed y, stereo y follows x)
    const ul = Math.hypot(sy, sx) || 1
    const ux = sy / ul
    const uy = sx / ul
    const vx = -uy
    const vy = ux
    const result = out ?? p.grids.map(() => new Float32Array(n * n))

    for (let gi = p.grids.length - 1; gi >= 0; gi--) {
      const g = p.grids[gi]
      const L = this.levels[gi]
      const coarser = gi + 1 < p.grids.length ? this.levels[gi + 1] : undefined
      const { w, a0, m } = L
      const lim = g.half_m + EDGE * w
      const h = g.heights
      for (let b = 0; b < L.count; b++) {
        const lat = (b - L.b0) * w
        // The stretch of this line over the grid (plus the edge margin)
        let lo = -Infinity
        let hi = Infinity
        for (const [uc, vc] of [
          [ux, vx],
          [uy, vy],
        ]) {
          const off = lat * vc
          if (Math.abs(uc) < 1e-12) {
            if (Math.abs(off) > lim) lo = Infinity
            continue
          }
          const t1 = (-lim - off) / uc
          const t2 = (lim - off) / uc
          lo = Math.max(lo, Math.min(t1, t2))
          hi = Math.min(hi, Math.max(t1, t2))
        }
        const sFirst = lo > hi ? m : Math.max(0, Math.ceil((a0 - hi) / w))
        const sLast = lo > hi ? -1 : Math.min(m - 1, Math.floor((a0 - lo) / w))
        L.entry[b] = sFirst
        L.exit[b] = sLast
        if (sFirst > sLast) {
          L.entry[b] = m
          continue
        }
        let hm = NONE
        let am = 0
        if (coarser) {
          lookup(coarser, lat, a0 - sFirst * w, undefined)
          hm = foundH
          am = foundA
        }
        const row = b * m
        for (let s = sFirst; s <= sLast; s++) {
          const along = a0 - s * w
          const dx = along * ux + lat * vx
          const dy = along * uy + lat * vy
          const fi = Math.min(n - 1, Math.max(0, (dx + g.half_m) / w))
          const fj = Math.min(n - 1, Math.max(0, (g.half_m - dy) / w))
          const i0 = Math.min(n - 2, fi | 0)
          const j0 = Math.min(n - 2, fj | 0)
          const ti = fi - i0
          const tj = fj - j0
          const k = j0 * n + i0
          const top = h[k] + (h[k + 1] - h[k]) * ti
          const z = top + (h[k + n] + (h[k + n + 1] - h[k + n]) * ti - top) * tj
          // Moon-fixed position (see stereoToMoonFixed)
          const x = cx + dx
          const y = cy + dy
          const rho2 = x * x + y * y
          const d = (R_M + z) / (rho2 + F)
          const px = 4 * R_M * y * d
          const py = 4 * R_M * x * d
          const pz = (rho2 - F) * d
          const a = px * sx + py * sy + pz * sz
          const H = Math.sqrt(px * px + py * py + pz * pz - a * a) - R_M
          if (H > hm) {
            hm = H
            am = a
          }
          L.hmax[row + s] = hm
          L.aAt[row + s] = am
        }
      }

      // Every node against the samples at least one step sunward of it
      const pos = this.positions[gi]
      const lit = result[gi]
      for (let j = 0; j < n; j++) {
        const dy = g.half_m - j * w
        for (let i = 0; i < n; i++) {
          const dx = -g.half_m + i * w
          const k = j * n + i
          const px = pos[3 * k]
          const py = pos[3 * k + 1]
          const pz = pos[3 * k + 2]
          const a = px * sx + py * sy + pz * sz
          const H = Math.sqrt(px * px + py * py + pz * pz - a * a) - R_M
          lookup(L, dx * vx + dy * vy, dx * ux + dy * uy + w, coarser)
          lit[k] = foundH > NONE / 2 ? diskAbove((H - foundH) / Math.max(foundA - a, w) / sunRadiusRad) : 1
        }
      }
    }
    return result
  }

  /**
   * After compute(): the visible fraction of the Sun at a point h metres above the ground at the site (the centre
   * of the fine grid), for comparing with the horizon masks, which are computed for observers above the ground.
   */
  probeSite(sun: ArrayLike<number>, sunRadiusRad: number, h: number): number {
    const p = this.patch
    const g = p.grids[0]
    const L = this.levels[0]
    const sl = Math.hypot(sun[0], sun[1], sun[2])
    const P = new Float64Array(3)
    stereoToMoonFixed(p.center[0], p.center[1], g.heights[((p.n - 1) / 2) * p.n + (p.n - 1) / 2] + h, P)
    const a = (P[0] * sun[0] + P[1] * sun[1] + P[2] * sun[2]) / sl
    const H = Math.sqrt(P[0] * P[0] + P[1] * P[1] + P[2] * P[2] - a * a) - R_M
    lookup(L, 0, L.w, this.levels[1])
    return foundH > NONE / 2 ? diskAbove((H - foundH) / Math.max(foundA - a, L.w) / sunRadiusRad) : 1
  }
}

/** Convenience for one-off use: sunlight on every node of a patch. */
export function sunlight(p: Patch, sun: ArrayLike<number>, sunRadiusRad: number): Float32Array[] {
  return new TerrainSun(p).compute(sun, sunRadiusRad)
}

/** Running maximum at a lateral offset and along position, blending the two nearest lines (into foundH/foundA). */
function lookup(L: Lines, lat: number, along: number, coarser: Lines | undefined): void {
  const fb = lat / L.w + L.b0
  const b = Math.max(0, Math.min(L.count - 2, Math.floor(fb)))
  const t = Math.max(0, Math.min(1, fb - b))
  const s = Math.floor((L.a0 - along) / L.w)
  let h = 0
  let a = 0
  let wsum = 0
  for (let e = 0; e < 2; e++) {
    const bb = b + e
    const wt = e === 0 ? 1 - t : t
    if (wt <= 0) continue
    let hv = NONE
    let av = 0
    if (s >= L.entry[bb]) {
      const sc = Math.min(s, L.exit[bb])
      hv = L.hmax[bb * L.m + sc]
      av = L.aAt[bb * L.m + sc]
    } else if (coarser) {
      lookup(coarser, lat, along, undefined)
      hv = foundH
      av = foundA
    }
    // A line with no terrain sunward of this point cannot block the Sun, so it adds no weight
    if (hv <= NONE / 2) continue
    h += hv * wt
    a += av * wt
    wsum += wt
  }
  foundH = wsum > 0 ? h / wsum : NONE
  foundA = wsum > 0 ? a / wsum : 0
}
