import type { Summary } from './types'

// The site palette: near-black, off-white, and the one orange, with fire
// levels running from a warm ember to the orange itself.
const FIRE = ['#6b6b6b', '#b8552f', '#e7633b', '#ff6a3d']

export interface BadgeOptions {
  label?: string
  theme?: 'dark' | 'light'
  /** Only the silhouette: no frame, label or stats (gallery thumbnails). */
  bare?: boolean
}

/**
 * A README badge that is a tiny silhouette of the repo's own city: 48
 * columns of normalized height, hot columns colored by fire level.
 */
export function skylineBadge(s: Summary, opts: BadgeOptions = {}): string {
  const bare = opts.bare === true
  const label = bare ? '' : (opts.label ?? 'codeskyline')
  const dark = opts.theme !== 'light'
  const bg = dark ? '#0c0c0c' : '#f1efe8'
  const fg = dark ? '#f1efe8' : '#0c0c0c'
  const muted = dark ? '#8a8a85' : '#6b6b6b'
  const line = dark ? '#2a2a2a' : '#d9d6cc'
  const bar = dark ? '#5a5a57' : '#9a9a94'
  const font = "'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"

  const h = 28
  const skyW = 120
  const skyH = 18
  const pad = bare ? 0 : 10
  const labelW = label ? 7.2 * label.length + 12 : 0
  const stats = bare ? '' : `${compact(s.files)} files · ${compact(s.lines)} lines${s.burning ? ` · ${s.burning} on fire` : ''}`
  const statsW = stats ? 6.6 * stats.length + 12 : 0
  const w = pad + labelW + skyW + (stats ? pad + statsW : 0)

  const cols = s.skyline
  const cw = skyW / cols.length
  const bars = cols
    .map((c, i) => {
      if (c.h <= 0) return ''
      const bh = Math.max(1, c.h * skyH)
      const x = pad + labelW + i * cw
      const y = (h - skyH) / 2 + (skyH - bh)
      return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${Math.max(0.8, cw - 0.6).toFixed(2)}" height="${bh.toFixed(2)}" fill="${c.fire ? FIRE[c.fire] : bar}"/>`
    })
    .join('')

  const baseline = `<line x1="${pad + labelW}" y1="${(h + skyH) / 2 + 0.5}" x2="${pad + labelW + skyW}" y2="${(h + skyH) / 2 + 0.5}" stroke="${line}"/>`
  if (bare) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${skyW}" height="${h}" role="img" aria-label="${esc(s.name)} skyline">${baseline}${bars}</svg>`
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(0)}" height="${h}" role="img" aria-label="${esc(label)}: ${esc(stats)}">
<title>${esc(label)}: ${esc(stats)}</title>
<rect width="${w.toFixed(0)}" height="${h}" fill="${bg}" stroke="${line}"/>
<text x="${pad}" y="18" font-family="${font}" font-size="11" font-weight="600" letter-spacing="0.06em" fill="${fg}">${esc(label)}</text>
${baseline}
${bars}
<text x="${pad + labelW + skyW + pad}" y="18" font-family="${font}" font-size="10.5" letter-spacing="0.02em" fill="${muted}">${esc(stats)}</text>
</svg>`
}

export function compact(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '')}k`
  return String(n)
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
}
