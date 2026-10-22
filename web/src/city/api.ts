import type { City } from './types'
import { parseCity } from './load'

export interface JobState {
  key: string
  status: 'queued' | 'running' | 'ready' | 'error'
  stage: string
  detail: string
  error?: string
  log: { stage: string; detail: string; t: number }[]
}

export interface AnalyzeResponse extends Partial<JobState> {
  status: JobState['status']
  key: string
  owner: string
  name: string
  sha: string
  /** GitHub's size of the repository, for the time estimate. */
  sizeKB?: number
  error?: string
}

/** Where a repository stands: the city we have, the commit GitHub is on, a build under way. */
export interface RepoStatus {
  built: { key: string; sha: string; analyzed_at: number; files: number; lines: number; commits: number; authors: number; burning: number } | null
  latest: { sha: string; behind: number | null } | null
  job: JobState | null
}

/**
 * A rough build time from the repository's size on GitHub: the clone
 * dominates, at roughly a megabyte a second on the hosted analyzer, plus a
 * fixed cost to wake the container and read the history.
 */
export function etaSeconds(sizeKB: number | undefined): number {
  if (!sizeKB) return 60
  return Math.round(20 + sizeKB / 1200)
}

export function etaText(sizeKB: number | undefined): string {
  const s = etaSeconds(sizeKB)
  if (s < 50) return 'under a minute'
  if (s < 100) return 'about a minute'
  return `about ${Math.round(s / 60)} minutes`
}

/** null when the repository exists but has no city; throws when there is no such repository. */
export async function fetchRepo(owner: string, name: string, fresh = true): Promise<RepoStatus | null> {
  const res = await fetch(`/api/repo/${owner}/${name}${fresh ? '' : '?fresh=0'}`)
  if (res.status === 404) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    if (body.error === 'not analyzed yet') return null
    throw new Error(body.error ?? 'repository not found')
  }
  return json<RepoStatus>(res)
}

export interface GalleryEntry {
  owner: string
  name: string
  sha: string
  analyzed_at: number
  files: number
  lines: number
  commits: number
  authors: number
  burning: number
  stars: number
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) {
    if (res.status === 502 || res.status === 503) {
      throw new Error(body.error ?? 'The analysis API is not running. Locally: `pnpm dev:edge` (needs Docker). You can still drop a .city.json here.')
    }
    throw new Error(body.error ?? `request failed (${res.status})`)
  }
  return body
}

export async function requestAnalysis(url: string): Promise<AnalyzeResponse> {
  const res = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
  return json<AnalyzeResponse>(res)
}

/**
 * Cities are served immutable per commit, so the browser caches them for a
 * year. The format tag in the query keeps a city built by an older analyzer
 * from being served for a newer viewer.
 */
export const CITY_FORMAT = 'v3'

export async function fetchCity(owner: string, name: string, sha?: string): Promise<City> {
  const res = await fetch(sha ? `/api/city/${owner}/${name}/${sha}?fmt=${CITY_FORMAT}` : `/api/city/${owner}/${name}?fmt=${CITY_FORMAT}`)
  if (!res.ok) throw new Error(res.status === 404 ? 'not analyzed yet' : `could not load city (${res.status})`)
  return parseCity(await res.text())
}

export async function fetchGallery(): Promise<GalleryEntry[]> {
  const res = await fetch('/api/gallery')
  if (!res.ok) return []
  return (await res.json()) as GalleryEntry[]
}

export async function createShare(target: string): Promise<string> {
  const res = await fetch('/api/share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target }) })
  return (await json<{ url: string }>(res)).url
}

/** Live job updates over WebSocket, with polling as the fallback. */
export function subscribeJob(key: string, onState: (s: JobState) => void): () => void {
  let closed = false
  let ws: WebSocket | null = null
  let timer: ReturnType<typeof setInterval> | null = null

  const poll = async () => {
    try {
      const res = await fetch(`/api/jobs/${key}`)
      if (res.ok) onState((await res.json()) as JobState)
    } catch {
      /* transient */
    }
  }
  try {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    ws = new WebSocket(`${proto}://${location.host}/api/jobs/${key}`)
    ws.onmessage = (ev) => onState(JSON.parse(ev.data as string) as JobState)
    ws.onerror = () => {
      if (!timer && !closed) timer = setInterval(poll, 2000)
    }
    ws.onclose = () => {
      if (!timer && !closed) timer = setInterval(poll, 2000)
    }
  } catch {
    timer = setInterval(poll, 2000)
  }
  return () => {
    closed = true
    ws?.close()
    if (timer) clearInterval(timer)
  }
}
