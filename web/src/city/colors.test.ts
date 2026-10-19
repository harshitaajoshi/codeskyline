import { describe, expect, it } from 'vitest'
import { gradient, hex, languageColor, hashColor, fileColor, makeColorContext, DIM } from './colors'
import { height, percentileRanks } from './scales'
import type { City, File } from './types'

const file = (over: Partial<File>): File => ({
  id: 0, path: 'a', dir: 0, lang: 'Go', size: 0, lines: 10, code: 10, comment: 0, blank: 0, complexity: 1,
  commits: 1, recentCommits: 0, added: 0, deleted: 0, created: 1, lastTouched: 1, bugFixes: 0, hotspot: 0,
  fire: 0, owners: [], x: 0, z: 0, w: 1, d: 1, maxLines: 10, ...over,
})

describe('colors', () => {
  it('parses hex and interpolates gradients', () => {
    expect(hex('#ff0000')).toEqual([1, 0, 0])
    expect(gradient([[0, 0, 0], [1, 1, 1]], 0.5)).toEqual([0.5, 0.5, 0.5])
    expect(gradient([[0, 0, 0], [1, 1, 1]], 2)).toEqual([1, 1, 1])
  })
  it('gives known languages their color and hashes the rest stably', () => {
    expect(languageColor('Go')).toEqual(hex('#00add8'))
    expect(hashColor('Brainfuck')).toEqual(hashColor('Brainfuck'))
  })
  it('dims generated files in every mode', () => {
    const city = { version: 1, repo: {}, authors: [], dirs: [], files: [file({ generated: true })], stats: {} } as unknown as City
    for (const mode of ['churn', 'hotspots', 'owners', 'language', 'age'] as const) {
      expect(fileColor(city.files[0]!, 0, makeColorContext(city, mode))).toEqual(DIM)
    }
  })
})

describe('scales', () => {
  it('ranks ties equally and zeros as zero', () => {
    const fs = [file({ commits: 0 }), file({ commits: 5 }), file({ commits: 5 }), file({ commits: 9 })]
    const r = Array.from(percentileRanks(fs, (f) => f.commits))
    expect(r[0]).toBe(0)
    expect(r[1]).toBe(r[2])
    expect(r[3]).toBe(1)
  })
  it('clamps heights', () => {
    expect(height(0, 'sqrt', 100)).toBe(0.6)
    expect(height(1_000_000, 'sqrt', 100)).toBe(70)
    expect(height(100, 'linear', 100)).toBe(70)
  })
})
