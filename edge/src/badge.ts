import type { Summary } from './types'

const FIRE = ['#5b6478', '#f5a623', '#ff6a3d', '#ff2d2d']

/**
 * A README badge that is a tiny silhouette of the repo's own city: 48
 * columns of normalized height, hot columns colored by fire level.
 */
export function skylineBadge(s: Summary, opts: { label?: string; theme?: 'dark' | 'light' } = {}): string {
  const label = opts.label ?? 'codeskyline' // "" hides the label (gallery thumbnails)
  const dark = opts.theme !== 'light'
  const bg = dark ? '#0b0f1a' : '#f6f8fb'
  const fg = dark ? '#e6ebf5' : '#1b2233'
  const muted = dark ? '#8a95ad' : '#5b6478'
  const line = dark ? '#243049' : '#d6dce8'

  const h = 28
  const skyW = 120
  const skyH = 18
  const pad = 8
  const labelW = label ? 7 * label.length + 8 : 0
  const stats = `${compact(s.files)} files · ${compact(s.lines)} lines${s.burning ? ` · ${s.burning}🔥` : ''}`
  const statsW = 6.2 * stats.length + 8
  const w = pad + labelW + skyW + pad + statsW

  const cols = s.skyline
  const cw = skyW / cols.length
  const bars = cols
    .map((c, i) => {
      if (c.h <= 0) return ''
      const bh = Math.max(1, c.h * skyH)
      const x = pad + labelW + i * cw
      const y = (h - skyH) / 2 + (skyH - bh)
      return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${Math.max(0.8, cw - 0.6).toFixed(2)}" height="${bh.toFixed(2)}" fill="${c.fire ? FIRE[c.fire] : muted}" rx="0.4"/>`
    })
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(0)}" height="${h}" role="img" aria-label="${esc(label)}: ${esc(stats)}">
<title>${esc(label)}: ${esc(stats)}</title>
<rect width="${w.toFixed(0)}" height="${h}" rx="5" fill="${bg}" stroke="${line}"/>
<text x="${pad}" y="18" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="12" font-weight="600" fill="${fg}">${esc(label)}</text>
<line x1="${pad + labelW}" y1="${(h + skyH) / 2 + 0.5}" x2="${pad + labelW + skyW}" y2="${(h + skyH) / 2 + 0.5}" stroke="${line}"/>
${bars}
<text x="${pad + labelW + skyW + pad}" y="18" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="11" fill="${muted}">${esc(stats)}</text>
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
