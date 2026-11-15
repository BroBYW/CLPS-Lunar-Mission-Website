import { DrawingUtils, HandLandmarker } from '@mediapipe/tasks-vision'
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url'
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'
import { useEffect, useRef, useState } from 'react'
import { classifyPose, HandDrag, OneEuro, palmX, type Grip } from '../lib/gesture.ts'
import { formatUtc, HOUR_MS } from '../lib/time.ts'
import { useApp } from '../state/store.ts'

/** A sweep across the whole camera frame moves time as far as this many seconds of playback at the chosen speed. */
const SWEEP_SECONDS = 2
/** MediaPipe Hand Landmarker, float16 v1 (Apache-2.0), self-hosted */
const MODEL_URL = '/models/hand_landmarker.task'
const CAMERA: MediaStreamConstraints = {
  video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
  audio: false,
}

type Status = 'starting' | 'running' | { error: string }

const HINT: Record<Grip, string> = {
  none: 'Hold an open hand up to the camera.',
  open: 'Move your open hand left or right to move time.',
  fist: 'Fist: time holds. Open your hand to drag again.',
}

async function createLandmarker(): Promise<HandLandmarker> {
  const fileset = { wasmLoaderPath, wasmBinaryPath }
  const options = (delegate: 'GPU' | 'CPU') => ({
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: 'VIDEO' as const,
    numHands: 1,
  })
  try {
    return await HandLandmarker.createFromOptions(fileset, options('GPU'))
  } catch {
    // Without a WebGL context for MediaPipe, the CPU path is slower but still keeps up
    return HandLandmarker.createFromOptions(fileset, options('CPU'))
  }
}

function cameraError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : ''
  if (name === 'NotAllowedError') return 'Camera permission was denied. Allow it from the address bar to use hand control.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found.'
  if (name === 'NotReadableError') return 'Another app is using the camera.'
  return "Hand control couldn't start the camera in this browser."
}

const sweepLabel = (h: number) => (h < 24 ? `${h} h` : `${h / 24} day${h === 24 ? '' : 's'}`)

/**
 * Camera hand control: an open hand drags the time shown left or right, a fist holds it.
 * Frames go only to MediaPipe running in this page; nothing is uploaded.
 */
export default function HandControl() {
  const video = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<Status>('starting')
  const [grip, setGrip] = useState<Grip>('none')
  const timeMs = useApp((s) => s.timeMs)
  const speedHps = useApp((s) => s.speedHps)
  const setHandControl = useApp((s) => s.setHandControl)

  useEffect(() => {
    const v = video.current!
    const c = canvas.current!
    const ctx = c.getContext('2d')!
    let stopped = false
    let raf = 0
    // Ask for the camera and load the model at once; cleanup releases whichever arrived
    const camera = navigator.mediaDevices.getUserMedia(CAMERA)
    const model = createLandmarker()

    void (async () => {
      let landmarker: HandLandmarker
      try {
        v.srcObject = await camera
        await v.play()
      } catch (e) {
        if (!stopped) setStatus({ error: cameraError(e) })
        return
      }
      try {
        landmarker = await model
      } catch {
        if (!stopped) setStatus({ error: "The hand model didn't load. Close this and try again." })
        return
      }
      if (stopped) return
      setStatus('running')

      const css = getComputedStyle(document.documentElement)
      const sun = css.getPropertyValue('--color-sun').trim() || '#ffc53d'
      const dust = css.getPropertyValue('--color-dust').trim() || '#b8b2a7'
      const draw = new DrawingUtils(ctx)
      const drag = new HandDrag()
      const smooth = new OneEuro()
      let lastFrame = -1
      let shown: Grip = 'none'

      const tick = () => {
        raf = requestAnimationFrame(tick)
        if (v.readyState < 2 || v.currentTime === lastFrame) return
        lastFrame = v.currentTime
        const now = performance.now()
        const lm = landmarker.detectForVideo(v, now).landmarks[0]
        if (c.width !== v.videoWidth || c.height !== v.videoHeight) {
          c.width = v.videoWidth
          c.height = v.videoHeight
        }
        ctx.clearRect(0, 0, c.width, c.height)

        let dx = 0
        if (lm) {
          dx = drag.step(classifyPose(lm, v.videoWidth / v.videoHeight), smooth.filter(palmX(lm), now / 1000))
          const color = drag.grip === 'open' ? sun : dust
          draw.drawConnectors(lm, HandLandmarker.HAND_CONNECTIONS, { color, lineWidth: 3 })
          draw.drawLandmarks(lm, { color, fillColor: color, radius: 3, lineWidth: 1 })
        } else {
          drag.step(null, 0)
          smooth.reset()
        }

        const s = useApp.getState()
        if (drag.grip !== shown) {
          shown = drag.grip
          setGrip(shown)
          // Showing a hand takes over from playback; a fist is the pause
          if (shown !== 'none' && s.playing) s.setPlaying(false)
        }
        if (dx !== 0) s.setTime(s.timeMs + dx * s.speedHps * HOUR_MS * SWEEP_SECONDS)
      }
      raf = requestAnimationFrame(tick)
    })()

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      camera.then((s) => s.getTracks().forEach((t) => t.stop())).catch(() => {})
      model.then((m) => m.close()).catch(() => {})
    }
  }, [])

  return (
    <section
      aria-label="Hand control"
      className="fixed right-3 bottom-3 z-50 w-60 rounded-sm border border-regolith bg-shadow p-2 shadow-lg shadow-sky/60"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm">Hand control</h2>
        <button
          type="button"
          className="rounded-sm px-2 text-dust hover:text-bright"
          onClick={() => setHandControl(false)}
          aria-label="Turn off hand control"
        >
          ✕
        </button>
      </div>
      {/* Mirrored, so moving the hand right moves it right on screen */}
      <div className="relative mt-1 min-h-24 overflow-hidden rounded-sm bg-sky">
        <video ref={video} muted playsInline className="block w-full -scale-x-100" />
        <canvas ref={canvas} className="absolute inset-0 h-full w-full -scale-x-100" />
        {status === 'starting' && (
          <p className="absolute inset-0 flex items-center justify-center text-xs text-dust" role="status">
            Starting the camera…
          </p>
        )}
      </div>
      {typeof status === 'object' ? (
        <p role="alert" className="mt-2 text-xs text-alert">
          {status.error}
        </p>
      ) : (
        <>
          <p className={`mt-2 text-xs ${grip === 'open' ? 'text-sun' : ''}`} aria-live="polite">
            {HINT[grip]}
          </p>
          <p className="font-display text-sm tabular">{formatUtc(timeMs)}</p>
          <p className="mt-1 text-xs text-dust">
            A sweep across the camera moves time {sweepLabel(speedHps * SWEEP_SECONDS)}; the Speed menu sets this.
          </p>
        </>
      )}
      <p className="mt-1 text-xs text-dust">The camera image stays on this device.</p>
    </section>
  )
}
