import { ImageResponse, loadGoogleFont } from 'workers-og'
import type { Summary } from './types'
import { compact } from './badge'

const W = 1200
const H = 630
const FIRE = ['#6b6b6b', '#b8552f', '#e7633b', '#ff6a3d']

/**
 * The link preview for a city: its skyline silhouette across the bottom,
 * the repository's name set large, the counts beneath. Rendered to PNG in
 * the Worker so Slack, X and LinkedIn unfurl a shared city with a picture.
 */
export async function ogImage(s: Summary): Promise<Response> {
  const [owner, name] = s.name.split('/')
  const title = name ?? s.name
  const [archivo, serif, mono] = await Promise.all([
    loadGoogleFont({ family: 'Archivo', weight: 800, text: `${title}${owner ?? ''}/codeskyline` }),
    loadGoogleFont({ family: 'Instrument Serif', weight: 400, text: 'skyline' }),
    loadGoogleFont({ family: 'JetBrains Mono', weight: 400, text: `0123456789.kM files lines commits on fire · ${(owner ?? '').toUpperCase()}` }),
  ])

  const cols = s.skyline
  const cw = W / Math.max(1, cols.length)
  const skyH = 250
  // The silhouette as one SVG: Satori's HTML parser chokes on a flex row of
  // dozens of empty absolutely positioned divs, and an SVG is what it is anyway.
  const rects = cols
    .map((c, i) => {
      if (c.h <= 0) return ''
      const bh = Math.max(3, c.h * skyH)
      return `<rect x="${(i * cw).toFixed(1)}" y="${(skyH - bh).toFixed(1)}" width="${Math.max(2, cw - 3).toFixed(1)}" height="${bh.toFixed(1)}" fill="${c.fire ? FIRE[c.fire] : '#5a5a57'}"/>`
    })
    .join('')
  // Satori's HTML parser does not take inline <svg>; an <img> with a data URI does.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${skyH}" viewBox="0 0 ${W} ${skyH}">${rects}</svg>`
  const bars = `<img src="data:image/svg+xml;base64,${btoa(svg)}" width="${W}" height="${skyH}" style="position:absolute;left:0;bottom:3px"/>`
  const stats = `${compact(s.files)} files · ${compact(s.lines)} lines · ${compact(s.commits)} commits${s.burning ? ` · ${s.burning} on fire` : ''}`

  const html = `
<div style="display:flex;flex-direction:column;width:${W}px;height:${H}px;background:#0c0c0c;color:#f1efe8;font-family:Archivo;position:relative">
  <div style="display:flex;align-items:baseline;position:absolute;left:64px;top:52px;font-size:26px;letter-spacing:-0.5px">
    <span style="font-family:Archivo;font-weight:800">code</span><span style="font-family:'Instrument Serif';font-style:italic;color:#e7633b;margin-left:2px">skyline</span>
  </div>
  <div style="display:flex;flex-direction:column;position:absolute;left:64px;top:150px">
    <div style="display:flex;font-family:'JetBrains Mono';font-size:22px;color:#8a8a85;letter-spacing:3px">${esc((owner ?? '').toUpperCase())}</div>
    <div style="display:flex;font-family:Archivo;font-weight:800;font-size:${title.length > 18 ? 72 : 104}px;line-height:1;letter-spacing:-3px;margin-top:8px">${esc(title)}</div>
    <div style="display:flex;font-family:'JetBrains Mono';font-size:24px;color:#bdbbb4;margin-top:22px">${esc(stats)}</div>
  </div>
  ${bars}
  <div style="display:flex;position:absolute;left:0;right:0;bottom:0;height:3px;background:#2a2a2a"></div>
</div>`

  // Satori treats whitespace between tags as text children, and a div with
  // several children must be flex; strip it so the layout is what it says.
  return new ImageResponse(html.replace(/>\s+</g, '><').trim(), {
    width: W,
    height: H,
    fonts: [
      { name: 'Archivo', data: archivo, weight: 800, style: 'normal' },
      { name: 'Instrument Serif', data: serif, weight: 400, style: 'italic' },
      { name: 'JetBrains Mono', data: mono, weight: 400, style: 'normal' },
    ],
  })
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
}
