import { useEffect, useId, useRef, useState } from 'react'

/** Widest the help card gets, in px; on a phone it narrows to fit the screen. */
const CARD_W = 300
/** Gap the card keeps from the screen's edges, in px. */
const EDGE = 12

/**
 * A small circled "i" beside a section's title. Pressing it opens a short card that says what the section is and how
 * to use it, for visitors who don't know yet. It closes on a second press, Escape or a click elsewhere.
 */
export function InfoTip({ topic, what, how }: { topic: string; what: string; how: string }) {
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState({ left: 0, width: CARD_W })
  const root = useRef<HTMLSpanElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const id = useId()

  const toggle = () => {
    if (!open && button.current) {
      // Keep the card on screen: start at the icon, and shift left when it would run off the right edge
      const r = button.current.getBoundingClientRect()
      const width = Math.min(CARD_W, window.innerWidth - 2 * EDGE)
      const left = Math.max(EDGE - r.left, Math.min(0, window.innerWidth - EDGE - (r.left + width)))
      setPlace({ left, width })
    }
    setOpen(!open)
  }

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      button.current?.focus()
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <span ref={root} className="relative inline-flex align-middle">
      <button
        ref={button}
        type="button"
        aria-label={`About ${topic}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={toggle}
        className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] leading-none font-bold transition-colors ${
          open ? 'border-sun bg-sun text-sky' : 'border-white/30 text-dust hover:border-sun hover:text-sun'
        }`}
      >
        i
      </button>
      {open && (
        <span
          id={id}
          role="note"
          style={{ left: place.left, width: place.width }}
          className="absolute top-full z-50 mt-2 block rounded-xl border border-white/15 bg-shadow p-4 text-left text-sm leading-relaxed font-normal tracking-normal text-dust normal-case shadow-lg shadow-black/60"
        >
          <span className="block">
            <span className="font-semibold text-bright">What it is. </span>
            {what}
          </span>
          <span className="mt-2 block">
            <span className="font-semibold text-bright">How to use it. </span>
            {how}
          </span>
        </span>
      )}
    </span>
  )
}
