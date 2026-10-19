// Mirrors analyzer/internal/model/model.go. Keep the two in sync.

export interface Rect {
  x: number
  z: number
  w: number
  d: number
}

export interface Repo {
  name: string
  url?: string
  head: string
  defaultBranch?: string
  analyzedAt: number
  commits: number
  firstCommit: number
  lastCommit: number
  truncated?: boolean
}

export interface Author {
  name: string
  email: string
  login?: string
  commits: number
  added: number
  deleted: number
  firstSeen: number
  lastSeen: number
}

export interface Dir extends Rect {
  id: number
  path: string
  parent: number
  depth: number
  files: number
  lines: number
}

export interface Owner {
  author: number
  share: number
}

export interface File extends Rect {
  id: number
  path: string
  dir: number
  lang: string
  size: number
  lines: number
  code: number
  comment: number
  blank: number
  complexity: number
  commits: number
  recentCommits: number
  added: number
  deleted: number
  created: number
  lastTouched: number
  bugFixes: number
  hotspot: number
  fire: 0 | 1 | 2 | 3
  owners: Owner[]
  generated?: boolean
  vendored?: boolean
  binary?: boolean
}

export interface Stats {
  files: number
  dirs: number
  lines: number
  code: number
  maxLines: number
  maxCommits: number
  languages: Record<string, number>
  burning: number
  lineMismatches?: number
}

export interface City {
  version: number
  repo: Repo
  authors: Author[]
  dirs: Dir[]
  files: File[]
  stats: Stats
}

export const CITY_VERSION = 1

export function isCity(v: unknown): v is City {
  if (!v || typeof v !== 'object') return false
  const c = v as Partial<City>
  return c.version === CITY_VERSION && Array.isArray(c.files) && Array.isArray(c.dirs) && !!c.repo
}
