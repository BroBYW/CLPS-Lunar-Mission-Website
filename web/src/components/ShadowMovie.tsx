import { useEffect, useId, useRef, useState } from 'react'
import type { AppData, Site } from '../data/load.ts'
import { loadPatch } from '../data/patches.ts'
import { GridShader, TYPICAL_SCALE } from '../lib/lroCompare.ts'
import { DAY_MS, HOUR_MS, formatUtc, formatUtcDate } from '../lib/time.ts'
import { useApp } from '../state/store.ts'
import { TerrainLighter } from '../workers/terrainLighter.ts'
import { PHOTO_GRID, dnOf, sunImageDir } from './lroImages.ts'

const MAX_FRAMES = 180
const FPS = 12
/** The movie is drawn twice the grid's size, so captions stay sharp in the video */
const SCALE = 2
/** The LRO photos' grey scale, so the movie looks like them */
const STRETCH_IOF = 0.08

interface Movie {
  key: string
  n: number
  frames: Uint8Array[]
  times: number[]
  suns: number[][]
}

/**
 * Shadow movie: the 48 km around the site, lit by the app's own terrain and Sun through the Plan view's dates, like
 * LRO's polar movies (brightness as in lib/lroCompare.ts, with the scale typical of the LRO photos). Plays here, or
 * records to a video file.
 */
export function ShadowMovie({ data, site }: { data: AppData; site: Site }) {
  const startMs = useApp((s) => s.startMs)
  const endMs = useApp((s) => s.endMs)
  const [movie, setMovie] = useState<Movie | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [recording, setRecording] = useState(false)
  const [video, setVideo] = useState<{ url: string; name: string } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lighter = useRef<TerrainLighter | null>(null)
  const token = useRef(0)
  const frameId = useId()

  const key = `${site.id}/${startMs}/${endMs}`
  const stepMs = Math.max(HOUR_MS, Math.ceil((endMs - startMs) / MAX_FRAMES / HOUR_MS) * HOUR_MS)
  const total = Math.floor((endMs - startMs) / stepMs) + 1
  const current = movie?.key === key ? movie : null
  const canRecord = typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function'

  useEffect(
    () => () => {
      token.current++
      lighter.current?.destroy()
      lighter.current = null
    },
    [],
  )
  // New site or dates: the old movie no longer applies
  useEffect(() => {
    token.current++
    setProgress(null)
    setPlaying(false)
    setVideo(null)
  }, [key])

  const make = async () => {
    const my = ++token.current
    setFailed(false)
    setVideo(null)
    setProgress(0)
    try {
      const patch = await loadPatch(site.id)
      const gi = patch.grids.findIndex((g) => g.name === PHOTO_GRID)
      const shader = new GridShader(patch, gi)
      lighter.current ??= new TerrainLighter()
      const v = new Float64Array(6)
      const out: Movie = { key, n: patch.n, frames: [], times: [], suns: [] }
      for (let t = startMs; t <= endMs; t += stepMs) {
        data.ephemeris.sample(t, v)
        const sun = [v[0], v[1], v[2]]
        const lit = await lighter.current.light(site.id, patch, gi, sun)
        if (my !== token.current) return
        if (!lit) throw new Error('terrain changed')
        const b = shader.brightness(lit, sun)
        const img = new Uint8Array(b.length)
        for (let k = 0; k < b.length; k++) img[k] = dnOf(TYPICAL_SCALE * b[k], STRETCH_IOF)
        out.frames.push(img)
        out.times.push(t)
        out.suns.push(sun)
        if (out.frames.length % 4 === 0) setProgress(out.frames.length / total)
      }
      setMovie(out)
      setProgress(null)
      setIndex(0)
      setPlaying(true)
    } catch {
      if (my === token.current) {
        setFailed(true)
        setProgress(null)
      }
    }
  }

  // Draw the frame, with the site, the Sun's direction, the time and a scale bar
  useEffect(() => {
    const c = canvasRef.current
    if (!c || !current) return
    const n = current.n
    const off = document.createElement('canvas')
    off.width = n
    off.height = n
    const octx = off.getContext('2d')!
    const img = octx.createImageData(n, n)
    const f = current.frames[Math.min(index, current.frames.length - 1)]
    for (let k = 0; k < f.length; k++) {
      img.data[4 * k] = f[k]
      img.data[4 * k + 1] = f[k]
      img.data[4 * k + 2] = f[k]
      img.data[4 * k + 3] = 255
    }
    octx.putImageData(img, 0, 0)
    const W = n * SCALE
    c.width = W
    c.height = W
    const ctx = c.getContext('2d')!
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(off, 0, 0, W, W)
    const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    ctx.strokeStyle = css('--color-sun')
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(W / 2, W / 2, 12, 0, 2 * Math.PI)
    ctx.stroke()
    const [dx, dy] = sunImageDir(current.suns[Math.min(index, current.suns.length - 1)])
    ctx.fillStyle = css('--color-sun')
    ctx.beginPath()
    ctx.arc(W / 2 + dx * (W / 2 - 24), W / 2 + dy * (W / 2 - 24), 10, 0, 2 * Math.PI)
    ctx.fill()
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(0, 0, W, 44)
    ctx.fillStyle = css('--color-bright')
    ctx.font = '22px "Atkinson Hyperlegible Next Variable", sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${site.name} · ${formatUtc(current.times[Math.min(index, current.times.length - 1)])}`, 14, 22)
    const bar = ((10_000 / 120) * SCALE) | 0
    ctx.fillRect(W - 24 - bar, W - 30, bar, 5)
    ctx.textAlign = 'right'
    ctx.fillText('10 km', W - 24, W - 50)
    ctx.textAlign = 'left'
  }, [current, index, site.name])

  // Play: loop through the frames
  useEffect(() => {
    if (!playing || !current || recording) return
    const id = window.setInterval(() => setIndex((i) => (i + 1) % current.frames.length), 1000 / FPS)
    return () => clearInterval(id)
  }, [playing, current, recording])

  const record = () => {
    const c = canvasRef.current
    if (!c || !current) return
    const mime = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m))
    if (!mime) return
    const rec = new MediaRecorder(c.captureStream(FPS), { mimeType: mime, videoBitsPerSecond: 5_000_000 })
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    rec.onstop = () => {
      const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm'
      setVideo({ url: URL.createObjectURL(new Blob(chunks, { type: mime.split(';')[0] })), name: `shadows-${site.id}-${formatUtcDate(startMs)}.${ext}` })
      setRecording(false)
    }
    setRecording(true)
    setPlaying(false)
    setIndex(0)
    rec.start()
    let i = 0
    const id = window.setInterval(() => {
      i++
      if (i >= current.frames.length) {
        clearInterval(id)
        rec.stop()
        return
      }
      setIndex(i)
    }, 1000 / FPS)
  }

  const btn = 'rounded-sm border border-regolith px-3 py-1.5 text-sm text-dust hover:border-dust hover:text-bright disabled:opacity-40'
  const days = (endMs - startMs) / DAY_MS

  return (
    <section aria-label="Shadow movie" className="mt-8">
      <h3 className="font-display text-lg font-medium">Shadow movie</h3>
      <p className="mt-1 max-w-prose text-xs text-dust">
        LRO made movies of the poles from its photos, one frame every two hours. This is one made from the app instead: the 48 km
        around {site.name} lit by the Sun over your {days.toFixed(0)} days, one frame every {stepMs / HOUR_MS} hours, with the terrain's own
        shadows. The yellow dot on the edge points to the Sun.
      </p>
      {site.mask_index < 0 ? (
        <p className="mt-3 text-sm text-dust">Movies are made for the listed sites only, not for a dropped pin.</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className={btn} disabled={progress !== null || recording} onClick={() => void make()}>
              {progress !== null ? `Lighting frame ${Math.round(progress * total)} of ${total}…` : current ? 'Make it again' : `Make the movie (${total} frames)`}
            </button>
            {current && (
              <button type="button" className={btn} disabled={recording} onClick={() => setPlaying(!playing)}>
                {playing ? 'Pause' : 'Play'}
              </button>
            )}
            {current && canRecord && (
              <button type="button" className={btn} disabled={recording} onClick={record}>
                {recording ? 'Recording…' : 'Save as a video'}
              </button>
            )}
            {video && (
              <a href={video.url} download={video.name} className="rounded-sm border border-sun px-3 py-1.5 text-sm text-sun hover:bg-sun hover:text-sky">
                Download {video.name.endsWith('mp4') ? 'MP4' : 'WebM'}
              </a>
            )}
          </div>
          {failed && <p className="mt-2 text-sm text-alert">The terrain didn't load. Check your connection and try again.</p>}
          {current && (
            <div className="mt-3 max-w-[30rem]">
              <canvas ref={canvasRef} role="img" aria-label={`Shadow movie of ${site.name}, frame ${index + 1} of ${current.frames.length}: ${formatUtc(current.times[index] ?? startMs)}`} className="aspect-square w-full bg-shadow" />
              <label htmlFor={frameId} className="sr-only">
                Frame
              </label>
              <input id={frameId} type="range" min={0} max={current.frames.length - 1} value={index} disabled={recording} onChange={(e) => { setPlaying(false); setIndex(Number(e.target.value)) }} className="mt-2 w-full accent-sun" />
            </div>
          )}
        </>
      )}
    </section>
  )
}
