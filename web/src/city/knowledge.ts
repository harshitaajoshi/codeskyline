import type { City, File } from './types'

const YEAR = 365 * 24 * 3600

/** Authors who committed within the last year of the repo's history. */
export function activeAuthors(city: City): Set<number> {
  const since = city.repo.lastCommit - YEAR
  const s = new Set<number>()
  city.authors.forEach((a, i) => {
    if (a.lastSeen >= since) s.add(i)
  })
  return s
}

/** Owners with a meaningful share who are still around; mirrors the analyzer. */
export function knowers(f: File, active: Set<number>): number[] {
  return f.owners.filter((o) => o.share >= 0.1 && active.has(o.author)).map((o) => o.author)
}

export interface DepartureImpact {
  author: number
  lost: Set<number> // file ids that would have no active owner left
  total: number // live, non-generated files considered
  districts: { path: string; lost: number; files: number }[]
}

/**
 * "What if this person left?": every live file whose only remaining active
 * owner is them goes dark. Districts are ranked by how much they would lose.
 */
export function simulateDeparture(city: City, author: number): DepartureImpact {
  const active = activeAuthors(city)
  const lost = new Set<number>()
  let total = 0
  const perDir = new Map<number, { lost: number; files: number }>()
  for (const f of city.files) {
    if (f.removed || f.generated || f.vendored || f.binary) continue
    total++
    const ks = knowers(f, active)
    const gone = ks.length > 0 && ks.every((a) => a === author)
    if (gone) lost.add(f.id)
    // Attribute to the district at depth ≤ 2 for a readable summary.
    let d = city.dirs[f.dir]
    while (d && d.depth > 2) d = city.dirs[d.parent]
    if (d) {
      const e = perDir.get(d.id) ?? { lost: 0, files: 0 }
      e.files++
      if (gone) e.lost++
      perDir.set(d.id, e)
    }
  }
  const districts = [...perDir.entries()]
    .filter(([, e]) => e.lost > 0)
    .map(([id, e]) => ({ path: city.dirs[id]!.path || '(root)', lost: e.lost, files: e.files }))
    .sort((a, b) => b.lost - a.lost)
    .slice(0, 4)
  return { author, lost, total, districts }
}

/** The active human whose departure would orphan the most files, if any. */
export function worstDeparture(city: City): DepartureImpact | null {
  const active = [...activeAuthors(city)].filter((i) => !/\[bot\]|dependabot|renovate/i.test(city.authors[i]!.name))
  let worst: DepartureImpact | null = null
  for (const a of active.slice(0, 40)) {
    const r = simulateDeparture(city, a)
    if (r.lost.size > 0 && (!worst || r.lost.size > worst.lost.size)) worst = r
  }
  return worst && worst.total > 0 ? worst : null
}
