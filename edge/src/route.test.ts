import { describe, expect, it } from 'vitest'
import { repoFromPath } from './route'

describe('repoFromPath', () => {
  it('reads /owner/repo', () => {
    expect(repoFromPath('/apache/iggy')).toEqual({ owner: 'apache', name: 'iggy', path: '/apache/iggy' })
  })
  it('folds old links, .git, deep GitHub paths and a pasted host into the city', () => {
    for (const p of ['/r/apache/iggy', '/apache/iggy.git', '/apache/iggy/', '/apache/iggy/tree/main/core', '/apache/iggy/pull/12', '/github.com/apache/iggy'])
      expect(repoFromPath(p)?.path).toBe('/apache/iggy')
  })
  it('leaves the site alone', () => {
    for (const p of ['/', '/favicon.svg', '/api/repo/a/b', '/og/a/b.png', '/badge/a/b.svg', '/s/abc', '/samples/x.json', '/a%20b/c'])
      expect(repoFromPath(p)).toBeNull()
  })
})
