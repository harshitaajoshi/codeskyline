import type { JobDO } from './job'
import type { AnalyzerContainer } from './container'

export interface Env {
  ASSETS: Fetcher
  DB: D1Database
  CITIES: R2Bucket
  QUEUE: Queue<JobMessage>
  JOB: DurableObjectNamespace<JobDO>
  ANALYZER: DurableObjectNamespace<AnalyzerContainer>
  ANALYZE_RL?: RateLimit
  GITHUB_TOKEN?: string
  CSKY_SECRET?: string
  MAX_REPO_KB: string
  MAX_COMMITS: string
  MAX_JOBS_PER_MONTH: string
  PUBLIC_ORIGIN: string
}

/** What the queue carries from the API to the analysis consumer. */
export interface JobMessage {
  key: string // owner/name@sha
  owner: string
  name: string
  sha: string
  url: string
  stars: number
  defaultBranch: string
}

export type JobStatus = 'queued' | 'running' | 'ready' | 'error'

export interface JobState {
  key: string
  status: JobStatus
  stage: string
  detail: string
  createdAt: number
  updatedAt: number
  position?: number
  error?: string
  log: { stage: string; detail: string; t: number }[]
}

/** Mirrors analyzer/internal/skyline.Summary. */
export interface Summary {
  name: string
  head: string
  files: number
  lines: number
  commits: number
  authors: number
  burning: number
  removed: number
  firstCommit: number
  lastCommit: number
  languages: Record<string, number>
  skyline: { h: number; fire: number }[]
}

export interface RateLimit {
  limit(opts: { key: string }): Promise<{ success: boolean }>
}
