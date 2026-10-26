/**
 * "Hear the horizon": one sweep around the skyline in sound, clockwise from north. Pitch follows the terrain
 * (higher ground, higher note) and pans from west (left) to east (right). As the sweep passes the Sun and the
 * Earth, a chime marks each: bright if visible, low and muffled if the terrain hides it. Web Audio only.
 */

import { horizonAt } from './horizon.ts'

export interface SweepOptions {
  mask: Float32Array
  sunAz: number
  sunVisible: boolean
  earthAz: number
  earthVisible: boolean
  durationS: number
}

/** Pitch range of the skyline tone, Hz (two octaves) */
const F_LO = 220
const F_HI = 880
const CURVE_POINTS = 720

/** 0–1 position of an elevation between the lowest and highest horizon, for pitch. */
function pitchCurve(mask: Float32Array): Float32Array {
  let lo = Infinity
  let hi = -Infinity
  for (const v of mask) {
    lo = Math.min(lo, v)
    hi = Math.max(hi, v)
  }
  const span = Math.max(1, hi - lo)
  const out = new Float32Array(CURVE_POINTS)
  for (let i = 0; i < CURVE_POINTS; i++) {
    const t = (horizonAt(mask, (i / CURVE_POINTS) * 360) - lo) / span
    out[i] = F_LO * (F_HI / F_LO) ** t
  }
  return out
}

/** A short decaying tone (or two), for the Sun and Earth marks. */
function chime(ctx: AudioContext, out: AudioNode, at: number, freqs: number[], bright: boolean): void {
  freqs.forEach((f, k) => {
    const t = at + k * 0.14
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = bright ? 'sine' : 'triangle'
    osc.frequency.value = bright ? f : f / 4
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(bright ? 0.32 : 0.22, t + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, t + (bright ? 0.9 : 0.4))
    osc.connect(gain).connect(out)
    osc.start(t)
    osc.stop(t + 1)
  })
}

/** Plays the sweep now; returns when it ends (in the context's clock) and a way to stop it early. */
export function playSweep(ctx: AudioContext, o: SweepOptions): { start: number; end: number; stop: () => void } {
  const start = ctx.currentTime + 0.05
  const end = start + o.durationS
  const master = ctx.createGain()
  master.gain.value = 0.9
  master.connect(ctx.destination)

  const tone = ctx.createOscillator()
  tone.type = 'triangle'
  tone.frequency.setValueCurveAtTime(pitchCurve(o.mask), start, o.durationS)
  const level = ctx.createGain()
  level.gain.setValueAtTime(0, start)
  level.gain.linearRampToValueAtTime(0.12, start + 0.2)
  level.gain.setValueAtTime(0.12, end - 0.3)
  level.gain.linearRampToValueAtTime(0, end)
  // East to the right, west to the left, as for someone facing north
  const pan = ctx.createStereoPanner()
  const panCurve = new Float32Array(CURVE_POINTS)
  for (let i = 0; i < CURVE_POINTS; i++) panCurve[i] = 0.8 * Math.sin((i / CURVE_POINTS) * 2 * Math.PI)
  pan.pan.setValueCurveAtTime(panCurve, start, o.durationS)
  tone.connect(level).connect(pan).connect(master)
  tone.start(start)
  tone.stop(end)

  const at = (az: number) => start + ((((az % 360) + 360) % 360) / 360) * o.durationS
  chime(ctx, master, at(o.sunAz), [1320], o.sunVisible)
  chime(ctx, master, at(o.earthAz), [990, 1320], o.earthVisible)

  return {
    start,
    end,
    stop: () => {
      master.gain.cancelScheduledValues(ctx.currentTime)
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime)
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.05)
      tone.stop(ctx.currentTime + 0.06)
    },
  }
}
