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
  bus: number // truck factor of the district
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
  removed?: boolean // exists only in history; keeps its lot
  maxLines: number
  ghost?: boolean // no active owner left
}

export interface Keyframe {
  index: number
  time: number
  hash: string
  subject: string
  author: number
}

/** A detected moment in the repository's history, captioned on the scrubber. */
export interface StoryEvent {
  k: number
  kind: 'rewrite' | 'demolition' | 'burst' | 'district' | 'person'
  title: string
  detail: string
  magnitude: number
  author?: number
}

/** Events: flat [file, k, lines, activity, owner, fire] tuples sorted by (file, k). */
export interface Timeline {
  keyframes: Keyframe[]
  events: number[]
  story: StoryEvent[]
}

/** Two files that change in the same commits. */
export interface Coupling {
  a: number
  b: number
  support: number
  confidence: number
}

export interface DiffFile {
  id: number
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied'
  added: number
  deleted: number
}

export interface Diff {
  base: string
  head: string
  files: DiffFile[]
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
  removed: number
  lineMismatches?: number
}

export interface City {
  version: number
  repo: Repo
  authors: Author[]
  dirs: Dir[]
  files: File[]
  stats: Stats
  timeline: Timeline
  couplings: Coupling[]
  diff?: Diff
}

export const CITY_VERSION = 1

export function isCity(v: unknown): v is City {
  if (!v || typeof v !== 'object') return false
  const c = v as Partial<City>
  return c.version === CITY_VERSION && Array.isArray(c.files) && Array.isArray(c.dirs) && !!c.repo
}
