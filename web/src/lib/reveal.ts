/**
 * Scroll reveals: a card that starts below the fold rises and fades in the first time it enters the viewport.
 * Cards already on screen when they mount are left alone, so nothing visible ever blinks out. One
 * IntersectionObserver for every card; new cards are found by a MutationObserver, batched per frame.
 */
export function startReveals(selector = '.card'): () => void {
  if (typeof IntersectionObserver === 'undefined') return () => {}
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        e.target.classList.add('revealed')
        io.unobserve(e.target)
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  )
  const seen = new WeakSet<Element>()
  let queued = 0
  const scan = () => {
    queued = 0
    for (const el of document.querySelectorAll(selector)) {
      if (seen.has(el)) continue
      seen.add(el)
      if (el.getBoundingClientRect().top < window.innerHeight) continue
      el.classList.add('reveal')
      io.observe(el)
    }
  }
  const mo = new MutationObserver(() => {
    if (!queued) queued = requestAnimationFrame(scan)
  })
  mo.observe(document.body, { childList: true, subtree: true })
  scan()
  return () => {
    mo.disconnect()
    io.disconnect()
    if (queued) cancelAnimationFrame(queued)
  }
}
