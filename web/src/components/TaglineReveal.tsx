import { useEffect, useRef, useState } from 'react'

/**
 * Large type that lights up word by word as it scrolls past a trigger line, in reading order. One scroll listener,
 * throttled through requestAnimationFrame. Under reduced motion the text shows at full colour straight away.
 */
export function TaglineReveal({ lines, className = '' }: { lines: string[]; className?: string }) {
  const root = useRef<HTMLParagraphElement>(null)
  const words = lines.map((l) => l.split(' '))
  const total = words.reduce((n, w) => n + w.length, 0)
  const [lit, setLit] = useState(0)

  useEffect(() => {
    const el = root.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setLit(total)
      return
    }
    let frame = 0
    const update = () => {
      frame = 0
      const trigger = window.innerHeight * 0.62
      const spans = el.querySelectorAll<HTMLElement>('[data-word]')
      // At the foot of the page the last words can never reach the line, so they all light
      const atEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4
      let n = atEnd ? spans.length : 0
      for (const s of spans) {
        if (atEnd) break
        if (s.getBoundingClientRect().top < trigger) n++
        else break
      }
      // Words only ever light up, so the section never replays when scrolled back
      setLit((prev) => Math.max(prev, n))
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    update()
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [total])

  let i = 0
  return (
    <p ref={root} className={className} aria-label={lines.join(' ')}>
      {words.map((line, li) => (
        <span key={li} className="block" aria-hidden="true">
          {line.map((w, wi) => {
            const on = i++ < lit
            return (
              <span key={wi}>
                <span data-word className={`transition-colors duration-500 ease-base ${on ? 'text-bright' : 'text-bright/30'}`}>
                  {w}
                </span>
                {wi < line.length - 1 ? ' ' : ''}
              </span>
            )
          })}
        </span>
      ))}
    </p>
  )
}
