import { DailyChallenge } from '../components/play/DailyChallenge.tsx'
import { PhotoQuiz } from '../components/play/PhotoQuiz.tsx'
import { SurviveGame } from '../components/play/SurviveGame.tsx'
import type { AppData } from '../data/load.ts'
import { useApp, type Game } from '../state/store.ts'

const LABELS: [Game, string][] = [
  ['survive', 'Survive the lunar night'],
  ['daily', 'Daily landing challenge'],
  ['quiz', 'Photo quiz'],
  ['rover', 'Outrun the shadows'],
]

/** Games on the planner's own data: the real Sun, Earth, terrain and LRO photos of the south pole. */
export default function Play({ data }: { data: AppData }) {
  const game = useApp((s) => s.game)
  const setGame = useApp((s) => s.setGame)
  const btn = 'rounded-sm border px-3 py-1.5 text-sm'
  return (
    <main className="px-4 py-4 lg:px-6">
      <h2 className="font-display text-2xl font-medium">Play</h2>
      <p className="mt-1 max-w-prose text-sm text-dust">
        Games built on the same data as the planner: the real Sun, Earth and terrain at the south pole, and real photos from LRO.
      </p>
      <nav aria-label="Games" className="mt-4 flex flex-wrap gap-2">
        {LABELS.map(([g, label]) => (
          <button key={g} type="button" aria-pressed={game === g} onClick={() => setGame(g)} className={`${btn} ${game === g ? 'border-bright text-bright' : 'border-regolith text-dust hover:border-dust hover:text-bright'}`}>
            {label}
          </button>
        ))}
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
      <button type="button" className="mt-3 rounded-sm border border-sun px-4 py-1.5 text-sm text-sun hover:bg-sun hover:text-sky" onClick={go}>
        Play in the 3D view
      </button>
    </section>
  )
}
