import { useEffect, useMemo, useRef, useState } from 'react'
import { EarthGlyph, SunGlyph } from '../components/Glyphs.tsx'
import { MoonBackdrop, type MoonBackdropHandle } from '../components/MoonBackdrop.tsx'
import type { AppData } from '../data/load.ts'
import { siteFrame } from '../lib/astro.ts'
import { bodiesAt } from '../lib/track.ts'
import { earthVisible, sunFraction } from '../lib/visibility.ts'
import { MAX_MS, MIN_MS, useApp, type View } from '../state/store.ts'

const FEATURED = 'connecting-ridge'

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="19" cy="17" r="5" fill="var(--color-sun)" />
      <path d="M1 22 L7 17.5 L11 19.5 L16 14.5 L22 20 L26 18 L31 22" fill="none" stroke="var(--color-bright)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function LiveBadge({ data }: { data: AppData }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])
  const site = data.sites.find((s) => s.id === FEATURED)!
  const text = useMemo(() => {
    const t = Math.min(MAX_MS, Math.max(MIN_MS, now))
    const frame = siteFrame(site.lat, site.lon, site.height_m + 2)
    const mask = data.horizons.mask(site.mask_index, 0)
    const b = bodiesAt(data.ephemeris, frame, t)
    const f = sunFraction(mask, b.sunAz, b.sunEl, b.sunRadius, { az: b.earthAz, el: b.earthEl, radius: b.earthRadius })
    const earth = earthVisible(mask, b.earthAz, b.earthEl)
    const sun = f <= 0 ? 'Sun hidden' : `Sun ${b.sunEl.toFixed(1)}° up${f < 1 ? `, ${Math.round(f * 100)}% visible` : ''}`
    return `${sun}, Earth ${earth ? 'in view' : 'hidden'}`
  }, [data, site, now])
  return (
    <span className="text-[13px] text-bright/80">
      Now at the {site.name}: <strong className="font-semibold text-bright">{text}</strong>
    </span>
  )
}

export function Home({ data }: { data: AppData | null }) {
  const setView = useApp((s) => s.setView)
  const backdrop = useRef<MoonBackdropHandle>(null)
  const [leaving, setLeaving] = useState(false)
  const [nowMs] = useState(() => Math.min(MAX_MS, Math.max(MIN_MS, Date.now())))

  const go = (view: View) => setView(view)
  // The planner is built for desktops; on phones the guided story is the better start
  const start = async () => {
    setLeaving(true)
    await backdrop.current?.flyToPole()
    go(window.matchMedia('(min-width: 1024px)').matches ? 'plan' : 'explore')
  }

  return (
    <div className="relative h-svh min-h-[560px] w-full overflow-hidden bg-sky">
      {data && <MoonBackdrop ref={backdrop} ephemeris={data.ephemeris} timeMs={nowMs} />}
      <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.42) 38%, transparent 62%)' }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, transparent 22%, transparent 70%, rgba(0,0,0,0.5) 100%)' }} />
      {/* On phones the Moon sits behind the credits line; darken it there so the text stays readable */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 sm:hidden" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.9) 35%, rgba(0,0,0,0.55) 70%, transparent 100%)' }} />

      <nav aria-label="Main" className={`rise absolute inset-x-0 top-0 z-20 flex items-center justify-between px-6 py-6 md:px-11 ${leaving ? 'opacity-0 transition-opacity duration-500' : ''}`}>
        <a href="/" onClick={(e) => e.preventDefault()} className="flex items-center gap-3 text-bright no-underline" aria-label="CLPS Lunar Mission Browser, home">
          <Logo />
          <span className="font-display text-base font-medium max-sm:hidden">CLPS Lunar Mission Browser</span>
        </a>
        <div className="flex items-center gap-7 text-sm text-bright/80">
          <button type="button" onClick={() => go('plan')} className="hover:text-bright">
            Plan
          </button>
          <button type="button" onClick={() => go('compare')} className="hover:text-bright max-sm:hidden">
            Compare
          </button>
          <button type="button" onClick={() => go('3d')} className="hover:text-bright max-sm:hidden">
            3D
          </button>
          <button type="button" onClick={() => go('explore')} className="hover:text-bright">
            Explore
          </button>
        </div>
      </nav>

      <main className={`relative z-10 flex h-full flex-col px-6 pt-[24vh] md:px-16 ${leaving ? 'opacity-0 transition-opacity duration-700' : ''}`}>
        {data && (
          <div className="rise flex w-fit items-center gap-2.5 rounded-full border border-bright/15 bg-bright/5 py-1.5 pl-2 pr-4 backdrop-blur-md" style={{ animationDelay: '0.1s' }}>
            <span className="flex items-center gap-0.5 rounded-full bg-sky/70 px-1.5 py-1">
              <SunGlyph size={13} className="text-sun" />
              <EarthGlyph size={13} className="text-earth" />
            </span>
            <LiveBadge data={data} />
          </div>
        )}
        <h1
          className="rise mt-6 max-w-[580px] font-display font-medium text-bright"
          style={{ fontSize: 'clamp(2.4rem, 4.6vw, 4.1rem)', lineHeight: 1.08, letterSpacing: '-0.02em', animationDelay: '0.25s' }}
        >
          Where the Sun
          <br />
          skims the horizon
        </h1>
        <p className="rise mt-4 max-w-[400px] text-[15px] leading-relaxed text-dust" style={{ animationDelay: '0.42s' }}>
          Compare lunar south pole landing sites by how much sunlight they get and how often they can see Earth, for
          any dates from 2026 to 2030.
        </p>
        <div className="rise mt-8 flex items-center gap-3.5" style={{ animationDelay: '0.58s' }}>
          <button
            type="button"
            onClick={start}
            disabled={leaving}
            className="rounded-full bg-bright px-7 py-3.5 text-sm font-semibold text-sky transition-transform hover:scale-[1.03] active:scale-[0.97] disabled:opacity-80"
          >
            Let's start
          </button>
          <button
            type="button"
            onClick={() => backdrop.current?.playMonth()}
            aria-label="Play a month of sunlight on the Moon"
            title="Play a month of sunlight"
            className="flex size-11 items-center justify-center rounded-full border border-bright/25 bg-bright/10 backdrop-blur-sm transition-transform hover:scale-[1.08] active:scale-[0.93]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--color-bright)" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        </div>
      </main>

      <footer className={`rise absolute bottom-7 left-6 z-10 max-w-[520px] text-xs text-dust md:left-16 ${leaving ? 'opacity-0' : ''}`} style={{ animationDelay: '0.75s' }}>
        Sun and Earth positions from NASA JPL SPICE ephemerides. Terrain from LRO LOLA (NASA GSFC). Imagery: NASA Moon
        Trek, LRO WAC mosaic. Built for the NASA Space Apps Challenge 2026.{' '}
        <button type="button" onClick={() => go('about')} className="underline underline-offset-2 hover:text-bright">
          How it works
        </button>{' '}
        <button type="button" onClick={() => go('credits')} className="ml-2 underline underline-offset-2 hover:text-bright">
          Credits
        </button>
      </footer>
    </div>
  )
}
