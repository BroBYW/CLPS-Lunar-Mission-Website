import { useEffect } from 'react'
import { HOUR_MS } from '../lib/time.ts'
import { useApp } from './store.ts'

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Advances time while playing. With reduced motion, time moves in one-second steps
 * (one step of "speed" hours per second) instead of continuously.
 */
export function usePlayback(): void {
  const playing = useApp((s) => s.playing)
  useEffect(() => {
    if (!playing) return
    const reduced = prefersReducedMotion()
    let raf = 0
    let last = performance.now()
    let acc = 0
    const tick = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000)
      last = now
      const s = useApp.getState()
      let advance = 0
      if (reduced) {
        acc += dt
        if (acc >= 1) {
          acc = 0
          advance = s.speedHps * HOUR_MS
        }
      } else {
        advance = dt * s.speedHps * HOUR_MS
      }
      if (advance > 0) {
        const t = s.timeMs + advance
        if (t >= s.endMs) {
          s.setTime(s.endMs)
          s.setPlaying(false)
          return
        }
        s.setTime(t)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])
}
