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
  error?: string
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
  if (!res.ok) throw new Error(body.error ?? `request failed (${res.status})`)
  return body
}

export async function requestAnalysis(url: string): Promise<AnalyzeResponse> {
  const res = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
  return json<AnalyzeResponse>(res)
}

export async function fetchCity(owner: string, name: string, sha?: string): Promise<City> {
  const res = await fetch(sha ? `/api/city/${owner}/${name}/${sha}` : `/api/city/${owner}/${name}`)
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
