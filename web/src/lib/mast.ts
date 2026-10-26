/** Mast planner: the mast height that reaches a target, between the heights the masks were computed for. */

/** Linear between computed heights; the lowest height if it already meets the target, null if the tallest doesn't. */
export function heightFor(heights: number[], values: number[], target: number): number | null {
  if (values[0] >= target) return heights[0]
  for (let i = 1; i < heights.length; i++) {
    if (values[i] >= target) {
      const t = (target - values[i - 1]) / (values[i] - values[i - 1])
      return heights[i - 1] + t * (heights[i] - heights[i - 1])
    }
  }
  return null
}
