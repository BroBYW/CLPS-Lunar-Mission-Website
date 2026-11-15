import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cameraAvailable, EarthGlyph, HandGlyph, SunGlyph } from '../components/Glyphs.tsx'
import { MoonBackdrop, type MoonBackdropHandle } from '../components/MoonBackdrop.tsx'
import { TaglineReveal } from '../components/TaglineReveal.tsx'
import type { AppData } from '../data/load.ts'
import { siteFrame } from '../lib/astro.ts'
import { bodiesAt } from '../lib/track.ts'
import { earthVisible, sunFraction } from '../lib/visibility.ts'
import { MAX_MS, MIN_MS, useApp, type Game, type View } from '../state/store.ts'

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
    <span className="caption-1 text-bright/80">
      Now at the {site.name}: <strong className="font-semibold text-bright">{text}</strong>
    </span>
  )
}

/** A way into the playful parts of the app, below the fold so the hero keeps one call to action */
function EntryCard({ img, alt, title, text, action, icon, onClick }: { img: string; alt: string; title: string; text: string; action: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="card group flex flex-col overflow-hidden p-0 text-left transition-[transform,border-color] duration-500 ease-base hover:-translate-y-1 hover:border-white/20 sm:p-0">
      <span className="block aspect-[12/5] w-full overflow-hidden">
        <img src={img} alt={alt} loading="lazy" className="size-full object-cover object-bottom transition-transform duration-500 ease-base group-hover:scale-105" />
      </span>
      <span className="flex flex-1 flex-col gap-2 p-6">
        <span className="title-2 flex items-center gap-2 text-bright">
          {icon}
          {title}
        </span>
        <span className="body-6 text-dust">{text}</span>
        <span className="button-sm mt-auto pt-2 text-sun-soft">{action} →</span>
      </span>
    </button>
  )
}

export function Home({ data }: { data: AppData | null }) {
  const setView = useApp((s) => s.setView)
  const setGame = useApp((s) => s.setGame)
  const setSpeed = useApp((s) => s.setSpeed)
  const setHandControl = useApp((s) => s.setHandControl)
  const playGame = (g: Game) => {
    setGame(g)
    setView('play')
  }
  // The story's first step, with the camera on: a sweep of the hand moves the Sun six days
  const handStory = () => {
    setView('explore')
    setSpeed(72)
    setHandControl(true)
  }
  const backdrop = useRef<MoonBackdropHandle>(null)
  const [leaving, setLeaving] = useState(false)
  const [nowMs] = useState(() => Math.min(MAX_MS, Math.max(MIN_MS, Date.now())))

  const go = (view: View) => setView(view)
  // Everyone starts with the guided story; its last step opens the planner
  const start = async () => {
    setLeaving(true)
    await backdrop.current?.flyToPole()
    go('explore')
  }

  const navLink = 'title-4 rounded-lg px-3 py-2 text-dust transition-colors hover:bg-shadow-2 hover:text-bright'
  const cta = (
    <button type="button" onClick={start} disabled={leaving} className="btn btn-primary button-md rounded-full px-6">
      Find a sunlit site
    </button>
  )

  return (
    <div className="bg-sky">
      <div className="relative h-svh min-h-[560px] w-full overflow-hidden">
        {data && <MoonBackdrop ref={backdrop} ephemeris={data.ephemeris} timeMs={nowMs} />}
        {/* On phones the Moon sits behind the copy: a flat shade keeps it readable */}
        <div className="pointer-events-none absolute inset-0 bg-sky/55 sm:hidden" />

        <nav
          aria-label="Main"
          className={`rise absolute inset-x-3 top-4 z-20 mx-auto flex w-auto items-center justify-between gap-6 rounded-2xl border border-white/10 bg-shadow/60 p-2 backdrop-blur-xl sm:w-fit ${leaving ? 'opacity-0 transition-opacity duration-500' : ''}`}
        >
          <a href="/" onClick={(e) => e.preventDefault()} className="title-3 flex items-center gap-2 pl-2 text-bright no-underline" aria-label="CLPS Lunar Mission Browser, home">
            <Logo size={24} />
            <span className="whitespace-nowrap max-sm:hidden">CLPS Lunar Mission Browser</span>
          </a>
          <div className="flex items-center gap-0.5">
            <button type="button" onClick={() => go('plan')} className={navLink}>
              Plan
            </button>
            <button type="button" onClick={() => go('compare')} className={`${navLink} max-sm:hidden`}>
              Compare
            </button>
            <button type="button" onClick={() => go('3d')} className={`${navLink} max-sm:hidden`}>
              3D
            </button>
            <button type="button" onClick={() => go('explore')} className={navLink}>
              Explore
            </button>
          </div>
        </nav>

        <main className={`relative z-10 flex h-full flex-col justify-center px-6 md:px-16 ${leaving ? 'opacity-0 transition-opacity duration-700' : ''}`}>
          {data && (
            <div className="rise flex w-fit items-center gap-2 rounded-full border border-white/15 bg-shadow/60 py-2 pl-2 pr-4 backdrop-blur-xl" style={{ animationDelay: '0.1s' }}>
              <span className="flex items-center gap-0.5 rounded-full bg-sky/70 px-2 py-1">
                <SunGlyph size={13} className="text-sun" />
                <EarthGlyph size={13} className="text-earth" />
              </span>
              <LiveBadge data={data} />
            </div>
          )}
          <h1 className="rise heading-3 sm:heading-2 lg:heading-1 text-lit mt-6 max-w-[680px] pb-1" style={{ animationDelay: '0.25s' }}>
            Where the Sun
            <br />
            skims the horizon
          </h1>
          <p className="rise body-3 mt-4 max-w-[680px] text-dust" style={{ animationDelay: '0.42s' }}>
            Compare lunar south pole landing sites by how much sunlight they get
            <br className="max-md:hidden" /> and how often they can see Earth, for any dates from 2024 to 2030.
          </p>
          <div className="rise mt-8 flex items-center gap-3" style={{ animationDelay: '0.58s' }}>
            {cta}
            <button
              type="button"
              onClick={() => backdrop.current?.playMonth()}
              aria-label="Play a month of sunlight on the Moon"
              title="Play a month of sunlight"
              className="flex size-10 items-center justify-center rounded-full border border-white/20 bg-shadow/60 backdrop-blur-xl transition-transform duration-300 hover:scale-105 active:scale-[0.98]"
            >
              <svg width="16" height="16" viewBox="0 0 256 256" fill="var(--color-bright)" aria-hidden="true">
                <path d="M240 128a15.74 15.74 0 0 1-7.6 13.51L88.32 229.65a16 16 0 0 1-16.2.3A15.86 15.86 0 0 1 64 216.13V39.87a15.86 15.86 0 0 1 8.12-13.82a16 16 0 0 1 16.2.3l144.08 88.14A15.74 15.74 0 0 1 240 128" />
              </svg>
            </button>
          </div>
          <p className="rise caption-4 mt-6 text-dust" style={{ animationDelay: '0.7s' }}>
            Checked against 1,022 LRO photos: the model calls sunlight or shadow right in 99.3% of the cases that can tell.
          </p>
        </main>
      </div>

      <section aria-label="Why it matters" className="px-6 pt-24 pb-24 md:px-16">
        <TaglineReveal
          className="heading-4 sm:heading-3 max-w-[680px]"
          lines={['Sunlight decides when a lander wakes.', 'Earth decides when it can call home.', 'Plan for both before you land.']}
        />
        <div className="mt-12">{cta}</div>
        <div className="mt-16 grid max-w-5xl gap-6 sm:grid-cols-2">
          {cameraAvailable && (
            <EntryCard
              img="/home/skyline.jpg"
              alt="Standing on the LOLA terrain at Shackleton rim, the Sun sitting just above the skyline"
              icon={<HandGlyph className="text-sun" />}
              title="Move the Sun with your hand"
              text="Turn on your camera and sweep an open hand left or right. The Sun slides along the real skyline of the Connecting ridge; a fist holds it still."
              action="Try it"
              onClick={handStory}
            />
          )}
          <EntryCard
            img="/home/night.jpg"
            alt="Shackleton crater in 3D, its floor in permanent shadow and its rim lit by a low Sun"
            icon={<SunGlyph size={18} className="text-sun" />}
            title="Survive a lunar night"
            text="Choose solar panels and a battery on a budget, then see whether your lander lasts a real month at a real south pole site."
            action="Play"
            onClick={() => playGame('survive')}
          />
        </div>
      </section>

      <footer className={`px-6 pb-12 text-xs text-dust md:px-16 ${leaving ? 'opacity-0' : ''}`}>
        <p className="max-w-[680px]">
          Sun and Earth positions from NASA JPL SPICE ephemerides. Terrain from LRO LOLA (NASA GSFC). Moon model: NASA
          SVS (Goddard Space Flight Center). Built for the NASA Space Apps Challenge 2026.{' '}
          <button type="button" onClick={() => go('about')} className="underline underline-offset-2 hover:text-bright">
            How it works
          </button>
          <button type="button" onClick={() => go('credits')} className="ml-2 underline underline-offset-2 hover:text-bright">
            Credits
          </button>
        </p>
      </footer>
    </div>
  )
}
