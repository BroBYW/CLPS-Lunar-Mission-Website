import { useLayoutEffect, useState, type RefObject } from 'react'

export function useElementWidth(ref: RefObject<HTMLElement | null>, initial = 800): number {
  const [width, setWidth] = useState(initial)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // Measure before the first paint, then follow resizes
    const w0 = Math.round(el.getBoundingClientRect().width)
    if (w0 > 0) setWidth(w0)
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width)
      if (w > 0) setWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return width
}
