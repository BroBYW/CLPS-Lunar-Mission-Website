/**
 * Pictures for the LRO photo tools (the Plan view's comparison, the photo quiz and the shadow movie): decoding the
 * photos, lighting a site's terrain for a photo's moment, and drawing either with the photos' grey scale.
 */

import { lroPhotoUrl, type LroPhoto, type LroPhotos } from '../data/load.ts'
import { loadPatch } from '../data/patches.ts'
import { comparePhoto, modelBrightness, type Agreement } from '../lib/lroCompare.ts'
import type { TerrainLighter } from '../workers/terrainLighter.ts'

/** The patch grid that matches the photos: 120 m spacing over the same 48 km */
export const PHOTO_GRID = 'mid'

export interface PhotoComparison {
  key: string
  photo: ImageData
  /** The photo in I/F, NaN where the frame has no data */
  iof: Float32Array
  agreement: Agreement
}

export async function decodePhoto(url: string, size: number): Promise<ImageData> {
  const img = new Image()
  img.src = url
  await img.decode()
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0)
  return ctx.getImageData(0, 0, size, size)
}

/** The photos store DN = 255·sqrt(I/F / stretch); alpha 0 marks no data. */
export function photoIof(img: ImageData, stretchIof: number): Float32Array {
  const iof = new Float32Array(img.width * img.height)
  for (let k = 0; k < iof.length; k++) {
    const v = img.data[4 * k] / 255
    iof[k] = img.data[4 * k + 3] < 128 ? Number.NaN : stretchIof * v * v
  }
  return iof
}

/** Grey level for an I/F value, as the photos store it. */
export const dnOf = (iof: number, stretchIof: number) => 255 * Math.sqrt(Math.min(1, Math.max(0, iof) / stretchIof))

/** Diagonal hatching for pixels without data. */
export const hatch = (i: number, j: number) => ((i + j) % 8 === 0 ? 70 : 24)

/** Paint an I/F picture into RGBA with the photos' grey scale, hatching where it has no data (NaN). */
export function paintIof(iof: Float32Array, width: number, stretchIof: number, out: Uint8ClampedArray): void {
  for (let k = 0; k < iof.length; k++) {
    const v = Number.isNaN(iof[k]) ? hatch(k % width, Math.floor(k / width)) : dnOf(iof[k], stretchIof)
    out[4 * k] = v
    out[4 * k + 1] = v
    out[4 * k + 2] = v
    out[4 * k + 3] = 255
  }
}

/**
 * Load a photo and the site's terrain, light the terrain for the photo's moment and compare the two. Null if a newer
 * request replaced this one (the lighter serves one patch at a time).
 */
export async function photoComparison(doc: LroPhotos, siteId: string, origin: [number, number], photo: LroPhoto, lighter: TerrainLighter, live: () => boolean): Promise<PhotoComparison | null> {
  const [patch, img] = await Promise.all([loadPatch(siteId), decodePhoto(lroPhotoUrl(photo.file), doc.size)])
  if (!live()) return null
  const gi = patch.grids.findIndex((g) => g.name === PHOTO_GRID)
  if (gi < 0) throw new Error(`no ${PHOTO_GRID} grid`)
  const lit = await lighter.light(siteId, patch, gi, photo.sun_km)
  if (!lit || !live()) return null
  const model = modelBrightness(patch, gi, lit, photo.sun_km, { size: doc.size, pixelM: doc.pixel_m, x0: origin[0], y0: origin[1] })
  const iof = photoIof(img, doc.stretch_iof)
  return { key: `${siteId}/${photo.frame}`, photo: img, iof, agreement: comparePhoto(iof, model, doc.iof_lit) }
}

/**
 * Unit direction toward the Sun in a polar stereographic picture (x right, y down on screen): stereographic x follows
 * the Moon-fixed y axis and stereographic y the x axis, and the screen's y points down.
 */
export function sunImageDir(sunKm: ArrayLike<number>): [number, number] {
  const len = Math.hypot(sunKm[0], sunKm[1]) || 1
  return [sunKm[1] / len, -sunKm[0] / len]
}
