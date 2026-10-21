import { describe, expect, it } from 'vitest'
import { activeAuthors, simulateDeparture } from './knowledge'
import type { City } from './types'

const YEAR = 365 * 24 * 3600
const now = 2_000_000_000

const city = {
  repo: { lastCommit: now },
  authors: [
    { name: 'A', lastSeen: now - 10 },
    { name: 'B', lastSeen: now - 20 },
    { name: 'Old', lastSeen: now - 3 * YEAR },
  ],
  dirs: [
    { id: 0, path: '', parent: -1, depth: 0 },
    { id: 1, path: 'src', parent: 0, depth: 1 },
  ],
  files: [
    { id: 0, dir: 1, owners: [{ author: 0, share: 0.9 }] }, // only A knows it
    { id: 1, dir: 1, owners: [{ author: 0, share: 0.5 }, { author: 1, share: 0.4 }] }, // A and B
    { id: 2, dir: 1, owners: [{ author: 0, share: 0.6 }, { author: 2, share: 0.4 }] }, // A and someone gone
    { id: 3, dir: 0, owners: [{ author: 1, share: 1 }] }, // B only
    { id: 4, dir: 0, owners: [{ author: 0, share: 1 }], generated: true }, // ignored
  ],
} as unknown as City

describe('knowledge', () => {
  it('counts only authors seen within the last year as active', () => {
    expect([...activeAuthors(city)]).toEqual([0, 1])
  })
  it('finds the files that would lose their last active owner', () => {
    const r = simulateDeparture(city, 0)
    expect([...r.lost].sort()).toEqual([0, 2])
    expect(r.total).toBe(4)
    expect(r.districts[0]).toEqual({ path: 'src', lost: 2, files: 3 })
  })
  it('does not blame someone for files they share', () => {
    expect(simulateDeparture(city, 1).lost.size).toBe(1) // only file 3
  })
})
