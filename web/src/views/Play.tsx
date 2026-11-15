import { DailyChallenge } from '../components/play/DailyChallenge.tsx'
import { PhotoQuiz } from '../components/play/PhotoQuiz.tsx'
import { SurviveGame } from '../components/play/SurviveGame.tsx'
import type { AppData } from '../data/load.ts'
import { useApp, type Game } from '../state/store.ts'

/** Each game's card: picture, name and a one-line pitch. */
const GAME_CARDS: { game: Game; title: string; pitch: string; img: string; alt: string }[] = [
  {
    game: 'survive',
    title: 'Survive the lunar night',
    pitch: 'Build a lander on a budget and keep it alive through a real month.',
    img: '/home/night.jpg',
    alt: 'Shackleton crater in 3D: a dark floor and a sunlit rim',
  },
  {
    game: 'daily',
    title: 'Daily landing challenge',
    pitch: "Today's mission is the same for everyone. Find the best landing.",
    img: '/play/earth.jpg',
    alt: 'Earth just above the skyline at Haworth',
  },
  {
    game: 'quiz',
    title: 'Photo quiz',
    pitch: 'A real LRO photo or our model? Can you tell them apart?',
    img: '/data/lro/connecting-ridge-20091211t2313.webp',
    alt: 'An LRO photo of the south pole near the Connecting ridge',
  },
  {
    game: 'rover',
    title: 'Outrun the shadows',
    pitch: 'Drive a rover on real terrain while the shadows sweep in.',
    img: '/play/ground.jpg',
    alt: 'Standing on Shackleton rim: craters and the Sun on the skyline',
  },
]

/** Games on the planner's own data: the real Sun, Earth, terrain and LRO photos of the south pole. */
export default function Play({ data }: { data: AppData }) {
  const game = useApp((s) => s.game)
  const setGame = useApp((s) => s.setGame)
  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6">
      <h2 className="heading-4">Play</h2>
      <p className="mt-1 max-w-prose text-sm text-dust">
        Learn the south pole by playing. Every game runs on the same data as the planner: the real Sun, Earth and terrain, and real
        photos from LRO.
      </p>
      <nav aria-label="Games" className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {GAME_CARDS.map((c) => {
          const on = game === c.game
          return (
            <button
              key={c.game}
              type="button"
              aria-pressed={on}
              onClick={() => setGame(c.game)}
              className={`group flex flex-col overflow-hidden rounded-2xl border bg-shadow text-left transition-[transform,border-color] duration-300 hover:-translate-y-0.5 ${
                on ? 'border-sun' : 'border-white/10 hover:border-white/25'
              }`}
            >
              <span className="block aspect-[12/5] w-full overflow-hidden">
                <img src={c.img} alt={c.alt} loading="lazy" className={`size-full object-cover transition-[transform,opacity] duration-500 group-hover:scale-105 ${on ? '' : 'opacity-70'}`} />
              </span>
              <span className="flex flex-col gap-1 p-3 sm:p-4">
                <span className={`title-4 ${on ? 'text-sun' : 'text-bright'}`}>{c.title}</span>
                <span className="text-xs text-dust max-sm:hidden">{c.pitch}</span>
              </span>
            </button>
          )
        })}
      </nav>
      <div className="mt-6">
        {game === 'survive' ? (
          <SurviveGame data={data} />
        ) : game === 'daily' ? (
          <DailyChallenge data={data} />
        ) : game === 'quiz' ? (
          <PhotoQuiz data={data} />
        ) : (
          <RoverIntro />
        )}
      </div>
    </main>
  )
}

/** The rover game runs in the 3D view, on the site's terrain. */
function RoverIntro() {
  const go = () => useApp.setState({ view: '3d', playing: false, roverGamePending: true })
  return (
    <section aria-label="Outrun the shadows" className="max-w-prose">
      <p className="text-sm">
        Drive a rover across the real terrain around a site while time races and the low Sun drags shadows across the ground. Stay
        in the light to keep your battery charged; stay in sight of Earth for bonus points. The shadows come from the same terrain
        and Sun as everything else in the app.
      </p>
      <p className="mt-2 text-sm text-dust">It runs in the 3D view: click or tap the terrain to drive, or use the arrow keys.</p>
      <button type="button" className="mt-3 btn btn-primary" onClick={go}>
        Play in the 3D view
      </button>
    </section>
  )
}
