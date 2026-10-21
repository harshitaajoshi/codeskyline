import type { SVGProps } from 'react'
import type { ColorMode } from '../city/colors'

/* Single-stroke line glyphs, 16px grid, no fills — the same language as the landing legend. */

const base = (props: SVGProps<SVGSVGElement>): SVGProps<SVGSVGElement> => ({
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.25,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  ...props,
})

export const Glyph = {
  churn: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M13 6.5A5.2 5.2 0 0 0 3.6 5M3 9.5A5.2 5.2 0 0 0 12.4 11" />
      <path d="M13 2.5v4h-4M3 13.5v-4h4" />
    </svg>
  ),
  activity: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M9 1.5 3.5 9H8l-1 5.5L12.5 7H8l1-5.5Z" />
    </svg>
  ),
  hotspots: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M8 14.5c-3 0-4.5-2-4.5-4.3 0-2.6 2.3-3.6 2.6-6.2 1.2.8 1.6 2 1.6 3 1-.6 1.5-1.4 1.5-2.6 2 1.4 3.3 3.5 3.3 5.8 0 2.3-1.5 4.3-4.5 4.3Z" />
      <path d="M8 14.5c-1.3 0-2-1-2-2.1 0-1.2 1-1.7 1.3-2.9.9.6 1.3 1.4 1.3 2.1.5-.3.8-.7.8-1.2.6.6 1 1.3 1 2 0 1.1-1 2.1-2.4 2.1Z" strokeWidth="1" />
    </svg>
  ),
  owners: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <circle cx="6" cy="5.5" r="2.5" />
      <path d="M1.5 14a4.5 4.5 0 0 1 9 0" />
      <path d="M10.5 3.5a2.5 2.5 0 0 1 0 4.5M12 10.2a4.5 4.5 0 0 1 2.5 3.8" />
    </svg>
  ),
  language: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M5.5 4 2 8l3.5 4M10.5 4 14 8l-3.5 4M9.2 2.5l-2.4 11" />
    </svg>
  ),
  age: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.5V8l2.5 1.8" />
    </svg>
  ),
  walk: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <circle cx="9" cy="2.5" r="1.3" />
      <path d="M8.5 5 6 7.5l1 3-2.5 4M8.5 5l2 1.8 2.5.7M8.5 5l-1.5 5.5 3 1.8 1 2.7" />
    </svg>
  ),
  share: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M6 9.5h4M9.5 2.5H13.5v4M13.5 2.5 7.5 8.5" />
      <path d="M11 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3" />
    </svg>
  ),
  open: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M2 4.5A1 1 0 0 1 3 3.5h3l1.5 1.5H13a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-7.5Z" />
    </svg>
  ),
  help: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <circle cx="8" cy="8" r="6" />
      <path d="M6.2 6.3A1.9 1.9 0 0 1 10 6.5c0 1.3-2 1.5-2 3" />
      <circle cx="8" cy="11.6" r=".5" fill="currentColor" stroke="none" />
    </svg>
  ),
  search: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3.5 3.5" />
    </svg>
  ),
  play: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base({ ...p, fill: 'currentColor', stroke: 'none' })}>
      <path d="M5 3.2v9.6c0 .6.6.9 1.1.6l7.3-4.8c.5-.3.5-1 0-1.3L6.1 2.6c-.5-.3-1.1 0-1.1.6Z" />
    </svg>
  ),
  pause: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base({ ...p, fill: 'currentColor', stroke: 'none' })}>
      <rect x="4" y="3" width="2.6" height="10" rx=".8" />
      <rect x="9.4" y="3" width="2.6" height="10" rx=".8" />
    </svg>
  ),
  record: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="8" cy="8" r="2.2" fill="currentColor" stroke="none" />
    </svg>
  ),
  close: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="m4 4 8 8M12 4l-8 8" />
    </svg>
  ),
  chevron: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="m6 3.5 4.5 4.5L6 12.5" />
    </svg>
  ),
  external: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}>
      <path d="M6.5 3.5h-3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3M9.5 2.5h4v4M13.5 2.5 7.5 8.5" />
    </svg>
  ),
}

export const MODE_GLYPH: Record<ColorMode, (p: SVGProps<SVGSVGElement>) => React.JSX.Element> = {
  churn: Glyph.churn,
  activity: Glyph.activity,
  hotspots: Glyph.hotspots,
  owners: Glyph.owners,
  language: Glyph.language,
  age: Glyph.age,
}
