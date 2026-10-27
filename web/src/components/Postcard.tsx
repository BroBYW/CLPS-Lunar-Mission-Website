import { useEffect, useState } from 'react'

export interface PostcardImage {
  url: string
  fileName: string
  alt: string
}

/**
 * Compose a postcard: the 3D view's frame with a caption band underneath. Fonts are the app's own (already loaded).
 */
export async function composePostcard(frameUrl: string, title: string, lines: string[]): Promise<string> {
  const img = new Image()
  img.src = frameUrl
  await img.decode()
  const w = Math.min(1600, img.naturalWidth)
  const h = Math.round((img.naturalHeight * w) / img.naturalWidth)
  const band = Math.round(w * 0.13)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h + band
  const ctx = c.getContext('2d')!
  ctx.drawImage(img, 0, 0, w, h)
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, h, w, band)
  ctx.fillStyle = '#ffc53d'
  ctx.fillRect(0, h, w, Math.max(2, Math.round(w / 400)))
  const pad = Math.round(w * 0.03)
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#ede9e1'
  ctx.font = `500 ${Math.round(band * 0.3)}px "Jost Variable", sans-serif`
  ctx.fillText(title, pad, h + band * 0.14)
  ctx.fillStyle = '#b8b2a7'
  lines.forEach((line, i) => {
    ctx.font = `${Math.round(band * (i ? 0.13 : 0.17))}px "Atkinson Hyperlegible Next Variable", sans-serif`
    ctx.fillText(line, pad, h + band * (0.52 + i * 0.22))
  })
  return c.toDataURL('image/jpeg', 0.92)
}

/** The finished postcard, with download and (where the browser can) share. */
export function PostcardPreview({ card, onClose }: { card: PostcardImage; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  useEffect(() => {
    let live = true
    fetch(card.url)
      .then((r) => r.blob())
      .then((b) => live && setFile(new File([b], card.fileName, { type: 'image/jpeg' })))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [card])
  const canShare = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
  const btn = 'rounded-sm border border-regolith px-3 py-1.5 text-sm text-dust hover:border-dust hover:text-bright'
  return (
    <section aria-label="Earth postcard" className="mt-4 max-w-3xl rounded-sm border border-shadow-2 bg-shadow p-3">
      <img src={card.url} alt={card.alt} className="w-full" />
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={card.url} download={card.fileName} className="rounded-sm border border-sun px-3 py-1.5 text-sm text-sun hover:bg-sun hover:text-sky">
          Download
        </a>
        {canShare && file && (
          <button type="button" className={btn} onClick={() => void navigator.share({ files: [file], title: card.alt }).catch(() => undefined)}>
            Share
          </button>
        )}
        <button type="button" className={btn} onClick={onClose}>
          Close
        </button>
      </div>
    </section>
  )
}
