import type { City } from '../city/types'

/** The public address of a city, printed on everything that leaves the site. */
export const PUBLIC_HOST = 'codeskyline.dev'

const FONTS = ['700 24px Archivo', 'italic 24px "Instrument Serif"', '12px "JetBrains Mono"']

/** The credit uses the site's fonts; make sure the canvas has them first. */
export async function loadCreditFonts(): Promise<void> {
  try {
    await Promise.all(FONTS.map((f) => document.fonts.load(f)))
  } catch {
    /* fall back to system fonts */
  }
}

function compact(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}k`
  return String(n)
}

/**
 * The credit along the bottom of a postcard or a video frame: the repository
 * and its numbers on the left, the wordmark and the city's address on the
 * right, over a dark fade so it reads on any skyline.
 */
export function drawCredit(ctx: CanvasRenderingContext2D, w: number, h: number, city: City): void {
  const s = w / 1440
  const pad = Math.round(36 * s)
  const base = h - pad

  const fade = ctx.createLinearGradient(0, h - 170 * s, 0, h)
  fade.addColorStop(0, 'rgba(12, 12, 12, 0)')
  fade.addColorStop(1, 'rgba(12, 12, 12, 0.78)')
  ctx.fillStyle = fade
  ctx.fillRect(0, h - 170 * s, w, 170 * s)

  ctx.textBaseline = 'alphabetic'
  // Left: the repository, then what it is made of.
  ctx.textAlign = 'left'
  ctx.fillStyle = 'rgba(241, 239, 232, 0.96)'
  ctx.font = `700 ${Math.round(26 * s)}px Archivo, system-ui, sans-serif`
  ctx.fillText(city.repo.name, pad, base - 22 * s)
  const facts = [`${compact(city.stats.files)} files`, `${compact(city.repo.commits)} commits`, `${compact(city.authors.length)} authors`]
  if (city.stats.burning) facts.push(`${city.stats.burning} on fire`)
  ctx.font = `${Math.round(13 * s)}px "JetBrains Mono", ui-monospace, monospace`
  ctx.fillStyle = 'rgba(241, 239, 232, 0.6)'
  ctx.fillText(facts.join('  ·  '), pad, base)

  // Right: the wordmark, then where to find this city.
  ctx.textAlign = 'right'
  ctx.font = `${Math.round(13 * s)}px "JetBrains Mono", ui-monospace, monospace`
  ctx.fillStyle = 'rgba(241, 239, 232, 0.6)'
  ctx.fillText(`${PUBLIC_HOST}/${city.repo.name}`, w - pad, base)
  ctx.font = `italic ${Math.round(30 * s)}px "Instrument Serif", Georgia, serif`
  ctx.fillStyle = 'rgb(231, 99, 59)'
  ctx.fillText('skyline', w - pad, base - 22 * s)
  const skyline = ctx.measureText('skyline').width
  ctx.font = `700 ${Math.round(28 * s)}px Archivo, system-ui, sans-serif`
  ctx.fillStyle = 'rgba(241, 239, 232, 0.96)'
  ctx.fillText('code', w - pad - skyline - 2 * s, base - 22 * s)
  ctx.textAlign = 'left'
}

/** Hands a file to the visitor: a download on desktop, the share sheet's save on phones. */
export function saveBlob(blob: Blob, name: string): void {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000)
}

export const fileStem = (city: City) => city.repo.name.replace('/', '__')
