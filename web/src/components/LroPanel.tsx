import { useEffect, useId, useRef, useState, type PointerEvent, type RefObject } from 'react'
import { loadLroPhotos, type LroPhoto, type LroPhotos, type Site } from '../data/load.ts'
import { toStereo } from '../lib/pinHorizon.ts'
import { formatUtc } from '../lib/time.ts'
import { TerrainLighter } from '../workers/terrainLighter.ts'
import { dnOf, hatch, photoComparison, sunImageDir, type PhotoComparison } from './lroImages.ts'

const SCALE_KM = 10

/**
 * Compare with an LRO photo: LROC Wide Angle Camera photos of the 48 km around the site, taken 2009–2011, beside the
 * app's own terrain lit by the Sun at the same moment (lib/lroCompare.ts), and how often photos and horizon agree.
 */
export function LroPanel({ site }: { site: Site }) {
  const sectionRef = useRef<HTMLElement>(null)
  const near = useNearViewport(sectionRef)
  const [doc, setDoc] = useState<LroPhotos | null>(null)
  const [failed, setFailed] = useState(false)
  const [pick, setPick] = useState(0)
  const [split, setSplit] = useState(50)
  const [diff, setDiff] = useState(false)
  const splitId = useId()

  useEffect(() => {
    if (!near) return
    let live = true
    loadLroPhotos().then(
      (d) => live && setDoc(d),
      () => live && setFailed(true),
    )
    return () => {
      live = false
    }
  }, [near])

  useEffect(() => setPick(0), [site.id])

  const entry = doc?.sites[site.id]
  const photo = entry?.photos[Math.min(pick, entry.photos.length - 1)] ?? null
  const { result, error } = useComparison(doc, site.id, entry?.origin_m ?? null, photo)
  const ready = result && photo && result.key === `${site.id}/${photo.frame}` ? result : null

  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !ready || !doc || !entry || !photo) return
    draw(canvas, ready, doc, split, diff, siteOffset(site, entry.origin_m, doc.pixel_m), photo.sun_km)
  }, [ready, doc, entry, photo, site, split, diff])

  const dragTo = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setSplit(Math.round(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100))))
  }

  const t = entry?.check
  const a = ready?.agreement
  const km2 = a && doc ? (a.pixels * doc.pixel_m * doc.pixel_m) / 1e6 : 0

  return (
    <section ref={sectionRef} aria-label="Compare with an LRO photo" className="mt-8">
      <h3 className="font-display text-lg font-medium">Compare with an LRO photo</h3>
      <p className="mt-1 max-w-prose text-xs text-dust">
        From 2009 to 2011 the Lunar Reconnaissance Orbiter photographed the south pole about every two hours. Here is one of those
        photos of the 48 km around {site.name}, next to the app's own terrain lit by the Sun at that same moment. Drag across the
        picture to compare them; nothing in the app's picture is taken from the photo except its overall brightness.
      </p>
      {site.mask_index < 0 ? (
        <p className="mt-3 text-sm text-dust">Photos are prepared for the listed sites only, not for a dropped pin.</p>
      ) : failed || error ? (
        <p className="mt-3 text-sm text-alert">The photo comparison didn't load. Check your connection and reload the page.</p>
      ) : doc && !entry?.photos.length ? (
        <p className="mt-3 text-sm text-dust">No photo covers this site well enough to compare.</p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
          <div>
            <div className="relative aspect-square w-full max-w-[30rem] bg-shadow">
              <canvas
                ref={canvasRef}
                width={doc?.size ?? 480}
                height={doc?.size ?? 480}
                className="h-full w-full cursor-ew-resize touch-none"
                role="img"
                aria-label={
                  photo
                    ? `The LRO photo of ${formatUtc(Date.parse(photo.utc))} on the left and the app's terrain lit for the same moment on the right, divided at ${split}%.`
                    : 'Loading the photo comparison'
                }
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId)
                  dragTo(e)
                }}
                onPointerMove={(e) => e.buttons && dragTo(e)}
              />
              {ready ? (
                <>
                  {split > 15 && <span className="pointer-events-none absolute top-2 left-2 rounded-sm bg-sky/70 px-1.5 py-0.5 text-xs text-bright">LRO photo</span>}
                  {split < 85 && <span className="pointer-events-none absolute top-2 right-2 rounded-sm bg-sky/70 px-1.5 py-0.5 text-xs text-bright">App model</span>}
                </>
              ) : (
                <span className="absolute inset-0 grid place-items-center text-sm text-dust">Lighting the terrain…</span>
              )}
            </div>
            <div className="mt-2 flex max-w-[30rem] flex-wrap items-center gap-x-4 gap-y-2">
              <label htmlFor={splitId} className="sr-only">
                Divider between the photo (left) and the app's model (right)
              </label>
              <input id={splitId} type="range" min={0} max={100} value={split} onChange={(e) => setSplit(Number(e.target.value))} className="min-w-40 flex-1 accent-sun" />
              <label className="flex items-center gap-1.5 text-sm text-dust">
                <input type="checkbox" checked={diff} onChange={(e) => setDiff(e.target.checked)} className="accent-sun" />
                Show differences
              </label>
            </div>
            <p className="mt-1 max-w-[30rem] text-xs text-dust">
              The ring marks the site; the yellow dot at the bottom left points toward the Sun. Up is toward 0° longitude. Hatching: no
              photo data.
            </p>
            {diff && (
              <p className="mt-1 max-w-[30rem] text-xs text-dust">
                <span className="mr-1 inline-block size-2.5 rounded-xs bg-alert align-middle" aria-hidden="true" />
                Sunlit in the app, dark in the photo
                <span className="mr-1 ml-3 inline-block size-2.5 rounded-xs bg-earth align-middle" aria-hidden="true" />
                Dark in the app, sunlit in the photo
              </p>
            )}
          </div>
          <div className="min-w-0 text-sm">
            {entry && entry.photos.length > 1 && (
              <fieldset>
                <legend className="text-dust">Photo</legend>
                <div className="mt-1 flex flex-col gap-1">
                  {entry.photos.map((p, i) => (
                    <label
                      key={p.frame}
                      className={`cursor-pointer rounded-sm border px-2 py-1 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-bright ${
                        p === photo ? 'border-bright text-bright' : 'border-regolith text-dust hover:border-dust'
                      }`}
                    >
                      <input type="radio" name="lro-photo" className="sr-only" checked={p === photo} onChange={() => setPick(i)} />
                      <span className="tabular">{formatUtc(Date.parse(p.utc))}</span>
                      <span className="text-dust"> · site {p.photo_lit ? 'in sunlight' : 'in shadow'}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {photo && (
              <div className="mt-3" aria-live="polite">
                <p>
                  The Sun was {Math.abs(photo.sun_el).toFixed(1)}° {photo.sun_el >= 0 ? 'above' : 'below'} the level horizon at the site, from{' '}
                  {photo.sun_az.toFixed(0)}°. The photo shows the site {photo.photo_lit ? 'in sunlight' : 'in shadow'}; its horizon gave{' '}
                  {photo.f >= 0.99 ? 'the whole Sun' : photo.f <= 0.01 ? 'no Sun' : `${Math.round(photo.f * 100)}% of the Sun`}.
                </p>
                {a && (
                  <p className="mt-2">
                    Over the {Math.round(km2).toLocaleString('en-US')} km² the photo covers, the app and the photo agree on{' '}
                    <span className="text-bright tabular">{a.agreePct.toFixed(0)}%</span>: {a.modelOnlyPct.toFixed(0)}% is sunlit in the app but dark in
                    the photo, and {a.photoOnlyPct.toFixed(0)}% the other way round. Of the ground sunlit in either picture,{' '}
                    <span className="text-bright tabular">{a.litOverlapPct.toFixed(0)}%</span> is sunlit in both.
                  </p>
                )}
              </div>
            )}
            {t && t.agree_pct !== null && doc && (
              <p className="mt-3 text-dust">
                In {t.photos - t.not_called} more photos of this site from {doc.check.first.slice(11, 15)} to {doc.check.last.slice(11, 15)} that can tell
                (the whole Sun lighting the ground clearly, or no Sun at all), the site's horizon called it sunlit or in shadow as the photo
                showed it <span className="text-bright tabular">{t.agree_pct.toFixed(0)}%</span> of the time.
              </p>
            )}
            <p className="mt-3 text-xs text-dust">
              Differences come mostly at shadow edges: the photo has 100 m pixels, the terrain 120 m, and the Sun is so low that a few metres of
              height move a shadow's edge by hundreds of metres. Shadows in the photo are not quite black, from light scattered off nearby
              sunlit slopes.
            </p>
            {doc && photo && (
              <p className="mt-2 text-xs text-dust">
                Photo: {doc.credit}, frame{' '}
                <a href={photo.url} target="_blank" rel="noreferrer" className="underline decoration-regolith underline-offset-2 hover:text-bright">
                  {photo.frame}
                </a>
                .
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

/** Starts as false and turns true once the element comes within a screen or so of the viewport. */
function useNearViewport(ref: RefObject<Element | null>): boolean {
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || near) return
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true)
      return
    }
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [ref, near])
  return near
}

/** Loads the photo and the site's terrain, lights the terrain in a worker and compares the two. */
function useComparison(doc: LroPhotos | null, siteId: string, origin: [number, number] | null, photo: LroPhoto | null) {
  const [result, setResult] = useState<PhotoComparison | null>(null)
  const [error, setError] = useState(false)
  const lighter = useRef<TerrainLighter | null>(null)

  useEffect(
    () => () => {
      lighter.current?.destroy()
      lighter.current = null
    },
    [],
  )

  useEffect(() => {
    if (!doc || !origin || !photo) return
    let live = true
    setError(false)
    lighter.current ??= new TerrainLighter()
    photoComparison(doc, siteId, origin, photo, lighter.current, () => live).then(
      (c) => live && c && setResult(c),
      () => live && setError(true),
    )
    return () => {
      live = false
    }
  }, [doc, siteId, origin, photo])

  return { result, error }
}

/** The site's position in photo pixels (the crop is centred on the frame pixel nearest the site). */
function siteOffset(site: Site, origin: [number, number], pixelM: number): [number, number] {
  const [x, y] = toStereo(site.lat, site.lon)
  return [(x - origin[0]) / pixelM, (origin[1] - y) / pixelM]
}

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

function rgb(hex: string): [number, number, number] {
  const v = Number.parseInt(hex.replace('#', ''), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

function draw(canvas: HTMLCanvasElement, c: PhotoComparison, doc: LroPhotos, split: number, diff: boolean, site: [number, number], sun: number[]) {
  const n = doc.size
  canvas.width = n
  canvas.height = n
  const ctx = canvas.getContext('2d')!
  const out = ctx.createImageData(n, n)
  const cut = Math.round((split / 100) * n)
  const pred = c.agreement.predicted
  const lit = doc.iof_lit
  const modelOnly = rgb(css('--color-alert'))
  const photoOnly = rgb(css('--color-earth'))
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i
      const p = c.iof[k]
      const m = pred[k]
      const fromPhoto = i < cut
      let v: number
      if (fromPhoto ? Number.isNaN(p) : Number.isNaN(m)) {
        v = hatch(i, j)
      } else {
        v = fromPhoto ? c.photo.data[4 * k] : dnOf(m, doc.stretch_iof)
      }
      let r = v
      let g = v
      let b = v
      if (diff && !Number.isNaN(p) && !Number.isNaN(m) && p > lit !== m > lit) {
        const tint = m > lit ? modelOnly : photoOnly
        r = 0.35 * v + 0.65 * tint[0]
        g = 0.35 * v + 0.65 * tint[1]
        b = 0.35 * v + 0.65 * tint[2]
      }
      out.data[4 * k] = r
      out.data[4 * k + 1] = g
      out.data[4 * k + 2] = b
      out.data[4 * k + 3] = 255
    }
  }
  ctx.putImageData(out, 0, 0)

  const bright = css('--color-bright')
  // Divider
  ctx.fillStyle = bright
  ctx.fillRect(Math.min(n - 1, Math.max(0, cut - 1)), 0, 2, n)
  // The site
  ctx.strokeStyle = css('--color-sun')
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(site[0], site[1], 7, 0, 2 * Math.PI)
  ctx.stroke()
  const [dx, dy] = sunImageDir(sun)
  const ox = 34
  const oy = n - 34
  ctx.strokeStyle = bright
  ctx.fillStyle = css('--color-sun')
  ctx.beginPath()
  ctx.moveTo(ox - dx * 18, oy - dy * 18)
  ctx.lineTo(ox + dx * 18, oy + dy * 18)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(ox + dx * 22, oy + dy * 22, 5, 0, 2 * Math.PI)
  ctx.fill()
  // Scale bar
  const bar = (SCALE_KM * 1000) / doc.pixel_m
  ctx.fillStyle = bright
  ctx.fillRect(n - 16 - bar, n - 20, bar, 3)
  ctx.font = '13px system-ui, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(`${SCALE_KM} km`, n - 16, n - 27)
}
