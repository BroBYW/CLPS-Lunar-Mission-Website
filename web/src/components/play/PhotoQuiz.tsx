import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from 'react'
import { loadLroPhotos, type AppData, type LroPhoto, type LroPhotos } from '../../data/load.ts'
import { toStereo } from '../../lib/pinHorizon.ts'
import { formatUtc } from '../../lib/time.ts'
import { TerrainLighter } from '../../workers/terrainLighter.ts'
import { dnOf, hatch, photoComparison, sunImageDir, type PhotoComparison } from '../lroImages.ts'

type Mode = 'real' | 'sun'
const ROUNDS = 6
/** Photos with less sunlit ground than this (share of the pixels) are skipped: nothing to see */
const MIN_LIT_PCT = 5

interface Card {
  siteId: string
  siteName: string
  /** The site in polar stereographic metres, and the crop's pixel (0, 0) */
  xy: [number, number]
  origin: [number, number]
  photo: LroPhoto
}

interface Round {
  card: Card
  c: PhotoComparison
  /** Real or model: which side the photo is on */
  photoLeft: boolean
}

type Answer = { kind: 'real'; correct: boolean } | { kind: 'sun'; guessDeg: number; trueDeg: number; points: number }

function shuffled<T>(list: T[]): T[] {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Clockwise from the picture's top, 0–360. */
const angleOf = (dx: number, dy: number) => ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360
const angleDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)

/**
 * Photo quiz on the LRO photos (lib/lroCompare.ts). "Real or model?": LRO's photo and the app's own terrain, lit for
 * the same moment, side by side; which did LRO take? "Where's the Sun?": the photo alone; point to the Sun from the
 * shadows and the lit slopes.
 */
export function PhotoQuiz({ data }: { data: AppData }) {
  const [doc, setDoc] = useState<LroPhotos | null>(null)
  const [failed, setFailed] = useState(false)
  const [mode, setMode] = useState<Mode>('real')
  const [deck, setDeck] = useState<Card[]>([])
  const [index, setIndex] = useState(0)
  const [played, setPlayed] = useState(0)
  const [score, setScore] = useState(0)
  const [round, setRound] = useState<Round | null>(null)
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [guessDeg, setGuessDeg] = useState(0)
  const lighter = useRef<TerrainLighter | null>(null)
  const guessId = useId()

  useEffect(() => {
    let live = true
    loadLroPhotos().then(
      (d) => live && setDoc(d),
      () => live && setFailed(true),
    )
    return () => {
      live = false
      lighter.current?.destroy()
      lighter.current = null
    }
  }, [])

  const cards = useMemo(() => {
    if (!doc) return []
    return data.sites.flatMap((s) => {
      const e = doc.sites[s.id]
      const xy = toStereo(s.lat, s.lon)
      return e ? e.photos.map((photo) => ({ siteId: s.id, siteName: s.name, xy, origin: e.origin_m, photo })) : []
    })
  }, [doc, data.sites])

  const restart = (m: Mode = mode) => {
    setMode(m)
    setDeck(shuffled(cards))
    setIndex(0)
    setPlayed(0)
    setScore(0)
    setAnswer(null)
    setRound(null)
  }
  useEffect(() => {
    if (cards.length) restart()
    // a new deck once the photos arrive
  }, [cards])

  // Light the terrain for the round's photo; skip photos with almost nothing lit
  const card = deck[index] ?? null
  useEffect(() => {
    if (!doc || !card || played >= ROUNDS) return
    let live = true
    setRound(null)
    lighter.current ??= new TerrainLighter()
    photoComparison(doc, card.siteId, card.origin, card.photo, lighter.current, () => live).then(
      (c) => {
        if (!live || !c) return
        const litPct = c.agreement.bothLitPct + c.agreement.photoOnlyPct
        if (litPct < MIN_LIT_PCT && index + 1 < deck.length) {
          setIndex(index + 1)
          return
        }
        setGuessDeg(0)
        setRound({ card, c, photoLeft: Math.random() < 0.5 })
      },
      () => live && setFailed(true),
    )
    return () => {
      live = false
    }
  }, [doc, card, index, deck.length, played])

  const finished = played >= ROUNDS
  const next = () => {
    setAnswer(null)
    setPlayed((p) => p + 1)
    setIndex((i) => (i + 1) % Math.max(1, deck.length))
  }

  const pickReal = (left: boolean) => {
    if (!round || answer) return
    const correct = left === round.photoLeft
    if (correct) setScore((s) => s + 1)
    setAnswer({ kind: 'real', correct })
  }
  const lockSun = () => {
    if (!round || answer) return
    const [dx, dy] = sunImageDir(round.card.photo.sun_km)
    const trueDeg = angleOf(dx, dy)
    const points = Math.round(100 * Math.max(0, 1 - angleDiff(guessDeg, trueDeg) / 90))
    setScore((s) => s + points)
    setAnswer({ kind: 'sun', guessDeg, trueDeg, points })
  }

  const btn = 'rounded-sm border border-regolith px-3 py-1.5 text-sm text-dust hover:border-dust hover:text-bright aria-pressed:border-bright aria-pressed:text-bright disabled:opacity-40'
  const primary = 'rounded-sm border border-sun px-3 py-1.5 text-sm text-sun hover:bg-sun hover:text-sky disabled:opacity-40'

  if (failed) return <p className="text-sm text-alert">The photos didn't load. Check your connection and reload the page.</p>
  if (!doc || !deck.length) return <p className="text-sm text-dust">Loading the photos…</p>

  return (
    <section aria-label="Photo quiz">
      <p className="max-w-prose text-sm text-dust">
        LRO photographed the south pole every two hours in 2009–2011. These are those photos of the 48 km around the sites, and the
        app's own terrain lit by the Sun at the same moments.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={btn} aria-pressed={mode === 'real'} onClick={() => restart('real')}>
          Real or model?
        </button>
        <button type="button" className={btn} aria-pressed={mode === 'sun'} onClick={() => restart('sun')}>
          Where's the Sun?
        </button>
      </div>
      <p className="mt-3 text-sm" aria-live="polite">
        {finished ? 'Done.' : `Round ${played + 1} of ${ROUNDS}.`} Score{' '}
        <span className="text-bright tabular">
          {score}
          {mode === 'real' ? ` of ${Math.min(played + (answer ? 1 : 0), ROUNDS)}` : ` of ${ROUNDS * 100}`}
        </span>
      </p>

      {finished ? (
        <div className="mt-4 max-w-prose">
          <p className="font-display text-xl text-bright">
            {mode === 'real'
              ? score >= ROUNDS - 1
                ? 'Sharp eyes.'
                : score >= ROUNDS / 2
                  ? 'Not bad: the model is close.'
                  : 'The model fooled you, which is the point.'
              : score >= 450
                ? 'You read shadows like a mission planner.'
                : 'Shadows point away from the Sun; the slopes facing it are the bright ones.'}
          </p>
          <p className="mt-2 text-sm text-dust">
            {mode === 'real'
              ? `You picked the real photo ${score} times out of ${ROUNDS}. The real ones have darker and brighter soil and craters too small for the elevation maps; the app has only terrain and the Sun, plus the photo's grain for the game.`
              : `${score} points out of ${ROUNDS * 100}: 100 for pointing straight at the Sun, none when 90° or more off.`}
          </p>
          <button type="button" className={`${primary} mt-3`} onClick={() => restart()}>
            Play again
          </button>
        </div>
      ) : !round ? (
        <p className="mt-4 text-sm text-dust">Lighting the terrain…</p>
      ) : mode === 'real' ? (
        <RealOrModel round={round} doc={doc} answer={answer} onPick={pickReal} />
      ) : (
        <WhereIsTheSun round={round} doc={doc} answer={answer} guessDeg={guessDeg} onGuess={setGuessDeg} guessId={guessId} onLock={lockSun} />
      )}

      {answer && !finished && round && (
        <div className="mt-3 max-w-prose text-sm" aria-live="polite">
          {answer.kind === 'real' ? (
            <p>
              <span className={answer.correct ? 'text-sun' : 'text-alert'}>{answer.correct ? 'Right.' : 'Not this time.'}</span> Picture{' '}
              {round.photoLeft ? 'A' : 'B'} is LRO's photo of {round.card.siteName}, {formatUtc(Date.parse(round.card.photo.utc))}. The app's
              terrain agrees with it on {round.c.agreement.agreePct.toFixed(0)}% of the ground; for the game it borrowed the photo's grain and the faint light in its shadows.
            </p>
          ) : (
            <p>
              The Sun was {Math.round(angleDiff(answer.guessDeg, answer.trueDeg))}° from where you pointed:{' '}
              <span className="text-sun tabular">{answer.points} points</span>. The yellow arrow shows it; {round.card.siteName},{' '}
              {formatUtc(Date.parse(round.card.photo.utc))}, with the Sun {Math.abs(round.card.photo.sun_el).toFixed(1)}°{' '}
              {round.card.photo.sun_el >= 0 ? 'above' : 'below'} the level horizon at the site.
            </p>
          )}
          <button type="button" className={`${primary} mt-2`} onClick={next}>
            {played + 1 >= ROUNDS ? 'See your score' : 'Next photo'}
          </button>
        </div>
      )}
      <p className="mt-4 text-xs text-dust">Photos: {doc.credit}.</p>
    </section>
  )
}

/**
 * The camera's look, measured on the photo's own shadows (where photo and model agree there is no Sun): the faint
 * light scattered into them (median) and the noise around it (median absolute deviation, as a standard deviation).
 */
function cameraLook(c: PhotoComparison, iofLit: number): { floor: number; sigma: number } {
  const v: number[] = []
  const pred = c.agreement.predicted
  for (let k = 0; k < c.iof.length; k += 3) if (c.iof[k] < iofLit && pred[k] < iofLit) v.push(c.iof[k])
  if (v.length < 100) return { floor: 0, sigma: 0 }
  v.sort((a, b) => a - b)
  const floor = v[v.length >> 1]
  const dev = v.map((x) => Math.abs(x - floor)).sort((a, b) => a - b)
  return { floor, sigma: 1.4826 * dev[dev.length >> 1] }
}

/** Gaussian noise from a seeded generator, so a round looks the same on every redraw. */
function gaussian(seed: number): () => number {
  let a = seed >>> 0
  const u = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), a | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return (((t ^ (t >>> 14)) >>> 0) + 0.5) / 4294967296
  }
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u())
}

/**
 * RGBA of the photo or the model, both only where the photo has data. For the game the model gets the photo's
 * scattered light and noise, so the two can't be told apart by grain alone.
 */
function pictureRgba(c: PhotoComparison, doc: LroPhotos, which: 'photo' | 'model'): Uint8ClampedArray {
  const n = doc.size
  const out = new Uint8ClampedArray(n * n * 4)
  const pred = c.agreement.predicted
  const look = which === 'model' ? cameraLook(c, doc.iof_lit) : { floor: 0, sigma: 0 }
  const noise = gaussian(c.key.length * 7919 + Math.round(c.agreement.agreePct * 1000))
  for (let k = 0; k < n * n; k++) {
    const noData = Number.isNaN(c.iof[k]) || Number.isNaN(pred[k])
    const v = noData
      ? hatch(k % n, Math.floor(k / n))
      : which === 'photo'
        ? c.photo.data[4 * k]
        : dnOf(Math.max(pred[k], look.floor) + look.sigma * noise(), doc.stretch_iof)
    out[4 * k] = v
    out[4 * k + 1] = v
    out[4 * k + 2] = v
    out[4 * k + 3] = 255
  }
  return out
}

/** The site's pixel in its photo (the crop is centred on the frame pixel nearest the site). */
function sitePixel(card: Card, pixelM: number): [number, number] {
  return [(card.xy[0] - card.origin[0]) / pixelM, (card.origin[1] - card.xy[1]) / pixelM]
}

function Picture({ rgba, size, label, site, arrows, onPointer }: {
  rgba: Uint8ClampedArray
  size: number
  label: string
  site: [number, number]
  arrows?: { deg: number; color: string }[]
  onPointer?: (deg: number) => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    ctx.putImageData(new ImageData(rgba.slice(), size, size), 0, 0)
    const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    ctx.strokeStyle = css('--color-sun')
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(site[0], site[1], 7, 0, 2 * Math.PI)
    ctx.stroke()
    for (const a of arrows ?? []) {
      const r = (a.deg * Math.PI) / 180
      const dx = Math.sin(r)
      const dy = -Math.cos(r)
      const len = size * 0.38
      ctx.strokeStyle = css(a.color)
      ctx.fillStyle = css(a.color)
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(site[0], site[1])
      ctx.lineTo(site[0] + dx * len, site[1] + dy * len)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(site[0] + dx * (len + 10), site[1] + dy * (len + 10), 9, 0, 2 * Math.PI)
      ctx.fill()
    }
  }, [rgba, size, site, arrows])

  const point = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!onPointer) return
    const r = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * size - site[0]
    const y = ((e.clientY - r.top) / r.height) * size - site[1]
    if (Math.hypot(x, y) > 4) onPointer(Math.round(angleOf(x, y)))
  }

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label}
      className={`aspect-square w-full bg-shadow ${onPointer ? 'cursor-crosshair touch-none' : ''}`}
      onPointerDown={(e) => {
        if (!onPointer) return
        e.currentTarget.setPointerCapture(e.pointerId)
        point(e)
      }}
      onPointerMove={(e) => e.buttons && point(e)}
    />
  )
}

function RealOrModel({ round, doc, answer, onPick }: { round: Round; doc: LroPhotos; answer: Answer | null; onPick: (left: boolean) => void }) {
  const photo = useMemo(() => pictureRgba(round.c, doc, 'photo'), [round, doc])
  const model = useMemo(() => pictureRgba(round.c, doc, 'model'), [round, doc])
  const site = useMemo(() => sitePixel(round.card, doc.pixel_m), [round, doc])
  const [left, right] = round.photoLeft ? [photo, model] : [model, photo]
  const btn = 'rounded-sm border border-regolith px-3 py-1.5 text-sm text-dust hover:border-dust hover:text-bright disabled:opacity-40'
  return (
    <div className="mt-4">
      <p className="text-sm">One of these is LRO's photo; the other is the app's terrain, lit by the Sun at the same moment. Which is real?</p>
      <div className="mt-3 grid max-w-3xl grid-cols-2 gap-3">
        {[left, right].map((rgba, i) => (
          <figure key={i}>
            <Picture rgba={rgba} size={doc.size} site={site} label={`Picture ${i ? 'B' : 'A'}: the 48 km around ${round.card.siteName}`} />
            <figcaption className="mt-1 flex items-center justify-between gap-2 text-sm">
              <span className="text-dust">Picture {i ? 'B' : 'A'}</span>
              <button type="button" className={btn} disabled={answer !== null} onClick={() => onPick(i === 0)}>
                {i ? 'B' : 'A'} is real
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}

function WhereIsTheSun({ round, doc, answer, guessDeg, onGuess, guessId, onLock }: {
  round: Round
  doc: LroPhotos
  answer: Answer | null
  guessDeg: number
  onGuess: (deg: number) => void
  guessId: string
  onLock: () => void
}) {
  const photo = useMemo(() => pictureRgba(round.c, doc, 'photo'), [round, doc])
  const site = useMemo(() => sitePixel(round.card, doc.pixel_m), [round, doc])
  const arrows = answer?.kind === 'sun' ? [{ deg: answer.guessDeg, color: '--color-bright' }, { deg: answer.trueDeg, color: '--color-sun' }] : [{ deg: guessDeg, color: '--color-bright' }]
  const primary = 'rounded-sm border border-sun px-3 py-1.5 text-sm text-sun hover:bg-sun hover:text-sky disabled:opacity-40'
  return (
    <div className="mt-4 max-w-md">
      <p className="text-sm">Which way was the Sun? Shadows point away from it, and slopes facing it are bright. Tap the photo or use the slider.</p>
      <div className="mt-3">
        <Picture rgba={photo} size={doc.size} site={site} arrows={arrows} label={`LRO photo of the 48 km around ${round.card.siteName}`} onPointer={answer ? undefined : onGuess} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label htmlFor={guessId} className="text-sm text-dust">
          Sun direction
        </label>
        <input id={guessId} type="range" min={0} max={359} value={guessDeg} disabled={answer !== null} onChange={(e) => onGuess(Number(e.target.value))} className="min-w-40 flex-1 accent-sun" />
        <span className="w-12 text-sm tabular text-bright">{guessDeg}°</span>
        <button type="button" className={primary} disabled={answer !== null} onClick={onLock}>
          Lock it in
        </button>
      </div>
      <p className="mt-1 text-xs text-dust">The ring marks the site. Angles go clockwise from the top of the picture.</p>
    </div>
  )
}
