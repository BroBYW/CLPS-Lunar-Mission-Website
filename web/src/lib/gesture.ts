/**
 * Hand control: reads a hand pose from MediaPipe's 21 hand landmarks and turns palm
 * movement into timeline drags. Pure, so it runs in tests without a camera.
 */

export interface HandPoint {
  x: number
  y: number
  z: number
}

export type Pose = 'open' | 'fist' | 'other'
export type Grip = 'none' | 'open' | 'fist'

const WRIST = 0
/** Middle joint (PIP) and tip of the index, middle, ring and little fingers */
const FINGERS: [number, number][] = [
  [6, 8],
  [10, 12],
  [14, 16],
  [18, 20],
]
/** Wrist and the four knuckles: their mean is the palm centre */
const PALM = [0, 5, 9, 13, 17]

/**
 * Open hand or fist, from landmarks in normalized image coordinates. A straight finger's tip
 * lies well beyond its middle joint as seen from the wrist; a curled one folds back inside it.
 * aspect is the frame's width over its height, since x and y are normalized separately.
 */
export function classifyPose(lm: HandPoint[], aspect: number): Pose {
  const w = lm[WRIST]
  const dist = (p: HandPoint) => Math.hypot((p.x - w.x) * aspect, p.y - w.y, (p.z - w.z) * aspect)
  let straight = 0
  let curled = 0
  for (const [pip, tip] of FINGERS) {
    const r = dist(lm[tip]) / dist(lm[pip])
    if (r > 1.2) straight++
    else if (r < 0.95) curled++
  }
  if (straight >= 3) return 'open'
  if (curled >= 3) return 'fist'
  return 'other'
}

/** Palm centre across the frame as the user sees it in a mirror: 0 at their left, 1 at their right. */
export function palmX(lm: HandPoint[]): number {
  let s = 0
  for (const i of PALM) s += lm[i].x
  return 1 - s / PALM.length
}

/**
 * One Euro filter (Casiez, Roussel and Vogel, CHI 2012): smooths hard while the hand is still
 * and follows closely while it moves.
 */
export class OneEuro {
  private x: number | null = null
  private dx = 0
  private t = 0

  constructor(
    private readonly minCutoffHz = 1.2,
    private readonly beta = 3,
    private readonly dCutoffHz = 1,
  ) {}

  filter(value: number, tSec: number): number {
    if (this.x === null || tSec <= this.t) {
      this.x = value
      this.t = tSec
      return value
    }
    const dt = tSec - this.t
    this.t = tSec
    const alpha = (cutoff: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt))
    const ad = alpha(this.dCutoffHz)
    this.dx = ad * ((value - this.x) / dt) + (1 - ad) * this.dx
    const a = alpha(this.minCutoffHz + this.beta * Math.abs(this.dx))
    this.x = a * value + (1 - a) * this.x
    return this.x
  }

  reset(): void {
    this.x = null
    this.dx = 0
  }
}

/**
 * Turns per-frame hand readings into timeline drags. An open hand drags time with it; a fist or
 * a lost hand lets go. A new open or fist reading takes over only after it repeats for
 * confirmFrames frames, so one misread frame doesn't drop or grab the timeline.
 */
export class HandDrag {
  grip: Grip = 'none'
  private pending: Pose = 'other'
  private count = 0
  private lastX: number | null = null

  constructor(
    private readonly confirmFrames = 3,
    /** Smaller moves, in frame widths, wait until they add up, so a still hand leaves time alone */
    private readonly deadband = 0.004,
  ) {}

  /** Feeds one frame (pose null when no hand is in view). Returns the drag in frame widths, rightward positive. */
  step(pose: Pose | null, x: number): number {
    if (pose === null) {
      this.grip = 'none'
      this.pending = 'other'
      this.count = 0
      this.lastX = null
      return 0
    }
    if (pose !== 'other') {
      this.count = pose === this.pending ? this.count + 1 : 1
      this.pending = pose
      if (this.count >= this.confirmFrames && this.grip !== pose) {
        this.grip = pose
        this.lastX = null
      }
    }
    if (this.grip !== 'open') return 0
    if (this.lastX === null) {
      this.lastX = x
      return 0
    }
    const dx = x - this.lastX
    if (Math.abs(dx) < this.deadband) return 0
    this.lastX = x
    return dx
  }
}
