/**
 * Shared geometry (PLAN.md §4.2). Mirrors pipeline/clps/geometry.py and pipeline/clps/ephem.py;
 * Vitest checks both against fixtures exported by the pipeline.
 */

export const R_MOON_KM = 1737.4
export const R_SUN_KM = 695_700
export const R_EARTH_KM = 6_378.137
export const AU_KM = 149_597_870.7
export const SOLAR_CONSTANT_W_M2 = 1361

export const DEG = Math.PI / 180
export const RAD = 180 / Math.PI

export interface EphemerisMeta {
  t0_utc: string
  step_s: number
  count: number
  columns: string[]
  frame: string
  abcorr: string
}

const littleEndian = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1

/** Hourly Moon-centered Sun and Earth vectors (km, MOON_ME), linearly interpolated. */
export class Ephemeris {
  readonly t0Ms: number
  readonly stepMs: number
  readonly count: number
  readonly data: Float32Array

  constructor(buffer: ArrayBuffer, meta: EphemerisMeta) {
    if (buffer.byteLength !== meta.count * 6 * 4) {
      throw new Error(`ephemeris.bin has ${buffer.byteLength} bytes, expected ${meta.count * 24}`)
    }
    if (littleEndian) {
      this.data = new Float32Array(buffer)
    } else {
      const view = new DataView(buffer)
      this.data = new Float32Array(meta.count * 6)
      for (let i = 0; i < this.data.length; i++) this.data[i] = view.getFloat32(i * 4, true)
    }
    this.t0Ms = Date.parse(meta.t0_utc)
    this.stepMs = meta.step_s * 1000
    this.count = meta.count
  }

  get startMs(): number {
    return this.t0Ms
  }

  get endMs(): number {
    return this.t0Ms + (this.count - 1) * this.stepMs
  }

  /** Writes [sunX, sunY, sunZ, earthX, earthY, earthZ] at UTC milliseconds into out. */
  sample(tMs: number, out: Float64Array): Float64Array {
    const last = this.count - 1
    let f = (tMs - this.t0Ms) / this.stepMs
    if (f < 0) f = 0
    else if (f > last) f = last
    let k = Math.floor(f)
    if (k > last - 1) k = last - 1
    const w = f - k
    const d = this.data
    const a = k * 6
    for (let i = 0; i < 6; i++) {
      const va = d[a + i]
      out[i] = va + w * (d[a + 6 + i] - va)
    }
    return out
  }
}

/** A surface point with its local east/north/up axes, all in MOON_ME. */
export interface SiteFrame {
  latDeg: number
  lonDeg: number
  heightM: number
  sx: number
  sy: number
  sz: number
  ex: number
  ey: number
  nx: number
  ny: number
  nz: number
  ux: number
  uy: number
  uz: number
}

/** heightM is metres above the 1737.4 km sphere (terrain height plus observer height). */
export function siteFrame(latDeg: number, lonDeg: number, heightM = 0): SiteFrame {
  const lat = latDeg * DEG
  const lon = lonDeg * DEG
  const cl = Math.cos(lat)
  const sl = Math.sin(lat)
  const co = Math.cos(lon)
  const so = Math.sin(lon)
  const r = R_MOON_KM + heightM / 1000
  return {
    latDeg,
    lonDeg,
    heightM,
    sx: r * cl * co,
    sy: r * cl * so,
    sz: r * sl,
    ex: -so,
    ey: co,
    nx: -sl * co,
    ny: -sl * so,
    nz: cl,
    ux: cl * co,
    uy: cl * so,
    uz: sl,
  }
}

export interface AzEl {
  /** Degrees clockwise from north, 0–360 */
  az: number
  /** Degrees above the local horizontal plane */
  el: number
  /** Topocentric distance, km */
  dist: number
}

export function newAzEl(): AzEl {
  return { az: 0, el: 0, dist: 0 }
}

/** Azimuth and elevation of a Moon-centered body vector (km) seen from the site. */
export function azElTo(f: SiteFrame, bx: number, by: number, bz: number, out: AzEl = newAzEl()): AzEl {
  const vx = bx - f.sx
  const vy = by - f.sy
  const vz = bz - f.sz
  const ve = vx * f.ex + vy * f.ey
  const vn = vx * f.nx + vy * f.ny + vz * f.nz
  const vu = vx * f.ux + vy * f.uy + vz * f.uz
  out.el = Math.atan2(vu, Math.sqrt(ve * ve + vn * vn)) * RAD
  const az = Math.atan2(ve, vn) * RAD
  out.az = az < 0 ? az + 360 : az
  out.dist = Math.sqrt(vx * vx + vy * vy + vz * vz)
  return out
}

export function angularRadiusDeg(bodyRadiusKm: number, distKm: number): number {
  return Math.asin(bodyRadiusKm / distKm) * RAD
}

/** Signed difference a − b in degrees, wrapped to [−180, 180). */
export function azDiff(a: number, b: number): number {
  return ((((a - b + 180) % 360) + 360) % 360) - 180
}
