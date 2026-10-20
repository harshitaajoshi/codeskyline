import type { City, File } from './types'
import { percentileRanks } from './scales'

export type ColorMode = 'churn' | 'activity' | 'hotspots' | 'owners' | 'language' | 'age'

export const MODES: { id: ColorMode; label: string; hint: string }[] = [
  { id: 'churn', label: 'Churn', hint: 'Commits so far (cumulative)' },
  { id: 'activity', label: 'Activity', hint: 'What is being worked on right now' },
  { id: 'hotspots', label: 'Hotspots', hint: 'Changes often and is complex' },
  { id: 'owners', label: 'Owners', hint: 'Who maintains each file' },
  { id: 'language', label: 'Language', hint: 'Language per file' },
  { id: 'age', label: 'Age', hint: 'When a file was created' },
]

/** Modes whose colors come from the timeline textures on the GPU. */
export const GPU_MODE: Record<ColorMode, number> = { churn: 1, activity: 2, hotspots: 3, owners: 4, language: 0, age: 0 }

export const OWNER_SLOTS = 16

export type RGB = [number, number, number]

export function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export function lerp(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/** Piecewise-linear gradient over evenly spaced stops. */
export function gradient(stops: RGB[], t: number): RGB {
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(x))
  return lerp(stops[i]!, stops[i + 1]!, x - i)
}

export const GRAY: RGB = hex('#3a4256')
export const DIM: RGB = hex('#262c3b')

export const CHURN: RGB[] = ['#2f4a7a', '#2d8fa8', '#8fd36b', '#f5d442', '#f28b2b', '#e8382b'].map(hex)
export const ACTIVITY: RGB[] = ['#1f2a44', '#2b4c7e', '#3f8fd2', '#8fe3ff', '#ffffff'].map(hex)
const AGE: RGB[] = ['#f8f1a6', '#8ad5c9', '#4a7aa8', '#2b3659'].map(hex) // new → old
export const FIRE: RGB[] = [GRAY, hex('#f5a623'), hex('#ff6a3d'), hex('#ff2d2d')]
export const RUIN: RGB = hex('#171c2a')
export const GHOST: RGB = hex('#1c1f2b') // owners mode: nobody active owns this

// Linguist-ish colors for common languages; everything else hashes to a palette.
const LANG: Record<string, string> = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572a5', Go: '#00add8', Rust: '#dea584',
  Java: '#b07219', 'C++': '#f34b7d', C: '#555555', 'C#': '#178600', Ruby: '#701516', PHP: '#4f5d95',
  Swift: '#f05138', Kotlin: '#a97bff', Dart: '#00b4ab', Scala: '#c22d40', Shell: '#89e051',
  HTML: '#e34c26', CSS: '#563d7c', SCSS: '#c6538c', Vue: '#41b883', Svelte: '#ff3e00', Markdown: '#6b7280',
  JSON: '#8b8f9a', YAML: '#cb171e', TOML: '#9c4221', SQL: '#e38c00', Lua: '#000080', Elixir: '#6e4a7e',
  Haskell: '#5e5086', Clojure: '#db5855', 'Objective C': '#438eff', Zig: '#ec915c', Nim: '#ffc200',
}
const PALETTE: RGB[] = ['#7cc4ff', '#ffb86b', '#9ae66e', '#ff79c6', '#bd93f9', '#8be9fd', '#f1fa8c', '#ff5555',
  '#50fa7b', '#ffa07a', '#87cefa', '#dda0dd', '#f0e68c', '#20b2aa', '#ff6347', '#9370db'].map(hex)

export function hashColor(key: string): RGB {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  return PALETTE[(h >>> 0) % PALETTE.length]!
}

export function languageColor(lang: string): RGB {
  const c = LANG[lang]
  return c ? hex(c) : hashColor(lang)
}

/** Top authors get stable palette slots; the long tail shares gray. */
export function ownerPalette(city: City, top = OWNER_SLOTS): Map<number, RGB> {
  const m = new Map<number, RGB>()
  ownerSlots(city, top).forEach((slot, author) => m.set(author, PALETTE[slot % PALETTE.length]!))
  return m
}

/** author index → palette slot for the top authors by commits. */
export function ownerSlots(city: City, top = OWNER_SLOTS): Map<number, number> {
  const order = city.authors.map((a, i) => ({ i, commits: a.commits })).sort((a, b) => b.commits - a.commits || a.i - b.i)
  const m = new Map<number, number>()
  order.slice(0, top).forEach((a, k) => m.set(a.i, k))
  return m
}

export function paletteSlot(slot: number): RGB {
  return PALETTE[slot % PALETTE.length]!
}

export interface ColorContext {
  mode: ColorMode
  churnRank: Float32Array
  ageRank: Float32Array
  owners: Map<number, RGB>
}

export function makeColorContext(city: City, mode: ColorMode): ColorContext {
  return {
    mode,
    churnRank: percentileRanks(city.files, (f) => f.commits),
    ageRank: percentileRanks(city.files, (f) => (f.created ? -f.created : 0)), // newest → 0
    owners: ownerPalette(city),
  }
}

export function fileColor(f: File, i: number, ctx: ColorContext): RGB {
  if (f.removed) return RUIN
  if (f.generated || f.vendored || f.binary) return DIM
  switch (ctx.mode) {
    case 'churn':
      return gradient(CHURN, ctx.churnRank[i] ?? 0)
    case 'activity':
      return gradient(ACTIVITY, Math.min(1, f.recentCommits / 10))
    case 'hotspots':
      return f.fire > 0 ? FIRE[f.fire]! : lerp(DIM, hex('#6b4a2a'), f.hotspot)
    case 'owners': {
      if (f.ghost) return GHOST
      const o = f.owners[0]
      return (o && ctx.owners.get(o.author)) ?? GRAY
    }
    case 'language':
      return languageColor(f.lang)
    case 'age':
      return gradient(AGE, 1 - (ctx.ageRank[i] ?? 0))
  }
}
