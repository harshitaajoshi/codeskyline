import { describe, expect, it } from 'vitest'
import { buildTimeline, fireAt, linesAt } from './timeline'
import type { City } from './types'

const city = {
  files: [{}, {}, {}],
  timeline: {
    keyframes: [0, 1, 2, 3].map((i) => ({ index: i, time: 1000 + i * 10, hash: '', subject: '', author: 0 })),
    // file 0: born k0 with 10 lines, grows to 30 at k2, fire 2 at k2
    // file 1: born k1 with 5 lines, deleted at k3
    // file 2: never exists
    events: [0, 0, 10, 1, 0, 0, 0, 2, 30, 3, 1, 2, 1, 1, 5, 1, -1, 0, 1, 3, 0, 1, -1, 0],
  },
} as unknown as City

describe('buildTimeline', () => {
  const t = buildTimeline(city, (a) => a)
  it('fills runs between events', () => {
    expect([0, 1, 2, 3].map((k) => linesAt(t, 0, k))).toEqual([10, 10, 30, 30])
    expect([0, 1, 2, 3].map((k) => linesAt(t, 1, k))).toEqual([0, 5, 5, 0])
    expect([0, 1, 2, 3].map((k) => linesAt(t, 2, k))).toEqual([0, 0, 0, 0])
  })
  it('records fire, owner slot and birth', () => {
    expect(fireAt(t, 0, 2)).toBe(2)
    expect(fireAt(t, 0, 1)).toBe(0)
    expect(Array.from(t.born)).toEqual([0, 1, -1])
    expect(t.meta[(0 * t.K + 2) * 4 + 1]).toBe(1) // owner slot
    expect(t.meta[(1 * t.K + 1) * 4 + 1]).toBe(255) // no owner
  })
  it('pulses activity only at the keyframe it happened', () => {
    expect(t.meta[(0 * t.K + 2) * 4]).toBe(3)
    expect(t.meta[(0 * t.K + 3) * 4]).toBe(0)
  })
  it('accumulates churn monotonically', () => {
    const churn = (k: number) => t.meta[(0 * t.K + k) * 4 + 3]!
    expect(churn(0)).toBeLessThan(churn(2))
    expect(churn(2)).toBe(255) // file 0 has the max cumulative commits (4)
  })
})
