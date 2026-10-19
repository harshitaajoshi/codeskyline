import { describe, expect, it } from 'vitest'
import { compact, skylineBadge } from './badge'
import { parseRepoInput } from './github'

describe('badge', () => {
  it('renders a valid svg with one bar per non-empty column', () => {
    const svg = skylineBadge({
      name: 'a/b', head: 'x', files: 1234, lines: 56789, commits: 10, authors: 2, burning: 3, removed: 0,
      firstCommit: 0, lastCommit: 0, languages: {},
      skyline: [{ h: 1, fire: 0 }, { h: 0, fire: 0 }, { h: 0.5, fire: 3 }],
    })
    expect(svg.startsWith('<svg')).toBe(true)
    expect((svg.match(/<rect/g) ?? []).length).toBe(3) // background + 2 bars
    expect(svg).toContain('#ff2d2d')
    expect(svg).toContain('1.2k files')
  })
  it('compacts numbers', () => {
    expect(compact(999)).toBe('999')
    expect(compact(1500)).toBe('1.5k')
    expect(compact(26804)).toBe('27k')
    expect(compact(1_172_344)).toBe('1.2M')
  })
})

describe('parseRepoInput', () => {
  it('accepts urls and owner/name', () => {
    expect(parseRepoInput('https://github.com/expressjs/express')).toEqual({ owner: 'expressjs', name: 'express' })
    expect(parseRepoInput('github.com/Foo/bar.git/')).toEqual({ owner: 'Foo', name: 'bar' })
    expect(parseRepoInput('facebook/react')).toEqual({ owner: 'facebook', name: 'react' })
    expect(parseRepoInput('https://github.com/expressjs/express/tree/main/lib')).toBeNull()
    expect(parseRepoInput('https://gitlab.com/a/b')).toBeNull()
    expect(parseRepoInput('')).toBeNull()
  })
})
