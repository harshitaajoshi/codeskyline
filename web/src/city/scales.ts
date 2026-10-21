import type { City, File } from './types'

export type HeightScale = 'sqrt' | 'log' | 'linear'

const MIN_H = 0.6
const MAX_H = 70

/** Building height in world units for a line count. */
export function height(lines: number, scale: HeightScale, maxLines: number): number {
  if (lines <= 0) return MIN_H
  let h: number
  switch (scale) {
    case 'log':
      h = Math.log2(1 + lines) * 2.2
      break
    case 'linear':
      h = (lines / Math.max(1, maxLines)) * MAX_H
      break
    default:
      h = Math.sqrt(lines) * 0.4
  }
  return Math.min(MAX_H, Math.max(MIN_H, h))
}

/** Fraction in [0,1] of a file's rank among the city's files for a metric. */
export function percentileRanks(files: File[], metric: (f: File) => number): Float32Array {
  const idx = files.map((_, i) => i).sort((a, b) => metric(files[a]!) - metric(files[b]!))
  const out = new Float32Array(files.length)
  const n = idx.length
  for (let r = 0; r < n; ) {
    let k = r
    const v = metric(files[idx[r]!]!)
    while (k < n && metric(files[idx[k]!]!) === v) k++
    const p = v === 0 ? 0 : (r + 1) / n
    for (; r < k; r++) out[idx[r]!] = p
  }
  return out
}

export function cityBounds(city: City) {
  const root = city.dirs[0]
  if (!root) return { cx: 0, cz: 0, size: 10 }
  return { cx: root.x + root.w / 2, cz: root.z + root.d / 2, size: Math.max(root.w, root.d) }
}

export function githubFileUrl(city: City, f: File): string | undefined {
  if (!city.repo.url) return undefined
  return `${city.repo.url}/blob/${city.repo.head}/${f.path}`
}

export function formatDate(unix: number): string {
  if (!unix) return 'n/a'
  return new Date(unix * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/** Compact ISO date for mono table cells. */
export function formatISO(unix: number): string {
  if (!unix) return 'n/a'
  return new Date(unix * 1000).toISOString().slice(0, 10)
}

export function formatNum(n: number): string {
  return n.toLocaleString()
}
