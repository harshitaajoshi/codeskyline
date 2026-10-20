import { useEffect, useState } from 'react'
import { fetchGallery, requestAnalysis, subscribeJob, type GalleryEntry, type JobState } from '../city/api'
import { SAMPLES, loadSample } from '../city/load'
import { formatNum } from '../city/scales'
import type { City } from '../city/types'
import { Scene } from '../scene/Scene'

const STAGE_COPY: Record<string, string> = {
  queued: 'Waiting for an analyzer…',
  start: 'Waking the construction crew 🏗️',
  clone: 'Fetching the repository',
  history: 'Reading the commit history',
  files: 'Measuring every building',
  metrics: 'Finding the fires 🔥',
  layout: 'Zoning the districts',
  encode: 'Packing the city',
  store: 'Saving the city',
  retry: 'Retrying',
  ready: 'City built',
}

const TRY = [
  { label: 'express', url: 'https://github.com/expressjs/express' },
  { label: 'react', url: 'https://github.com/facebook/react' },
  { label: 'vue', url: 'https://github.com/vuejs/core' },
  { label: 'fastify', url: 'https://github.com/fastify/fastify' },
]

const HOW = [
  { icon: '🏢', title: 'Files are buildings', body: 'Height is lines of code. Windows light up where work is happening.' },
  { icon: '🏘️', title: 'Folders are districts', body: 'Streets follow the directory tree, so the layout is the architecture.' },
  { icon: '🔥', title: 'Hotspots burn', body: 'Files that change often and are complex — where bugs get fixed.' },
  { icon: '⏳', title: 'Time travels', body: 'Scrub the timeline and watch the city rise, commit by commit.' },
]

export function Home({ onOpen, onSample }: { onOpen: (owner: string, name: string, sha?: string) => void; onSample: (id: string) => void }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [job, setJob] = useState<JobState | null>(null)
  const [gallery, setGallery] = useState<GalleryEntry[]>([])
  const [hero, setHero] = useState<City | null>(null)

  useEffect(() => {
    void fetchGallery().then(setGallery)
    loadSample(SAMPLES[0]!.id).then(setHero, () => {})
  }, [])

  useEffect(() => {
    if (!job || job.status === 'ready' || job.status === 'error') return
    return subscribeJob(job.key, setJob)
  }, [job?.key, job?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (job?.status === 'ready') {
      const [repo, sha] = job.key.split('@')
      const [owner, name] = repo!.split('/')
      onOpen(owner!, name!, sha)
    }
  }, [job, onOpen])

  const submit = async (target = url) => {
    setError(null)
    setBusy(true)
    try {
      const r = await requestAnalysis(target)
      if (r.status === 'ready') onOpen(r.owner, r.name, r.sha)
      else setJob({ key: r.key, status: r.status, stage: r.stage ?? 'queued', detail: r.detail ?? '', log: r.log ?? [] })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="absolute inset-0 overflow-auto">
      {/* Live city behind the hero. */}
      <div className="pointer-events-none fixed inset-0 -z-0">
        {hero && <Scene city={hero} hero />}
        <div className="absolute inset-0 bg-gradient-to-b from-bg/60 via-bg/10 to-bg" />
      </div>

      <div className="relative mx-auto flex max-w-4xl flex-col items-center px-4 pt-28 pb-20 text-center">
        <h1 className="text-5xl font-bold tracking-tight drop-shadow-lg md:text-6xl">
          Your codebase, <span className="text-accent">as a city.</span>
        </h1>
        <p className="text-ink/80 mt-4 max-w-xl text-lg text-balance drop-shadow">
          Paste a GitHub repo. Walk its streets, watch it grow through years of commits, and see which buildings are on fire.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
          className="panel mt-8 flex w-full max-w-xl items-center gap-2 p-2 shadow-2xl"
        >
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm outline-none"
            spellCheck={false}
            autoFocus
          />
          <button
            type="submit"
            disabled={busy || !url.trim()}
            className="bg-accent text-bg hover:bg-accent/90 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {busy ? 'Starting…' : 'Build the city'}
          </button>
        </form>
        <div className="text-muted mt-3 flex flex-wrap items-center justify-center gap-2 text-xs">
          <span>Try:</span>
          <button onClick={() => onSample(SAMPLES[0]!.id)} className="panel hover:text-ink px-2.5 py-1">
            express <span className="opacity-60">· instant</span>
          </button>
          {TRY.slice(1).map((t) => (
            <button
              key={t.label}
              onClick={() => {
                setUrl(t.url)
                void submit(t.url)
              }}
              className="panel hover:text-ink px-2.5 py-1"
            >
              {t.label}
            </button>
          ))}
        </div>
        {error && <div className="text-fire mt-3 max-w-xl text-sm">{error}</div>}

        {job && job.status !== 'ready' && (
          <div className="panel mt-4 w-full max-w-xl p-4 text-left text-sm">
            <div className="flex items-center gap-3">
              {job.status === 'error' ? <span>⚠️</span> : <Spinner />}
              <div className="min-w-0 flex-1">
                <div className="font-medium">{job.status === 'error' ? 'Analysis failed' : (STAGE_COPY[job.stage] ?? job.stage)}</div>
                <div className="text-muted truncate text-xs">{job.error ?? job.detail}</div>
              </div>
            </div>
            {job.log.length > 1 && (
              <ul className="text-muted mt-3 space-y-0.5 font-mono text-[11px]">
                {job.log.slice(-6).map((l, i) => (
                  <li key={i} className="truncate">
                    {l.stage.padEnd(8)} {l.detail}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-24 grid w-full gap-3 text-left sm:grid-cols-2 lg:grid-cols-4">
          {HOW.map((h) => (
            <div key={h.title} className="panel p-4">
              <div className="text-2xl">{h.icon}</div>
              <div className="mt-2 font-semibold">{h.title}</div>
              <div className="text-muted mt-1 text-sm">{h.body}</div>
            </div>
          ))}
        </div>

        {gallery.length > 0 && (
          <div className="mt-16 w-full text-left">
            <h2 className="text-muted mb-3 text-xs font-medium tracking-wide uppercase">Cities people built</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {gallery.map((g) => (
                <button
                  key={`${g.owner}/${g.name}`}
                  onClick={() => onOpen(g.owner, g.name, g.sha)}
                  className="panel hover:border-accent/50 flex items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {g.owner}/{g.name}
                    </div>
                    <div className="text-muted truncate text-xs">
                      {formatNum(g.files)} files · {formatNum(g.commits)} commits
                      {g.burning > 0 && <span className="text-fire"> · 🔥 {g.burning}</span>}
                    </div>
                  </div>
                  <img src={`/badge/${g.owner}/${g.name}.svg?label=`} alt="" className="h-5 w-auto max-w-[45%] shrink-0 object-contain opacity-90" loading="lazy" />
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="text-muted mt-16 text-xs">
          Runs locally too: <code className="font-mono">csky analyze ./my-repo</code>, then drop the result here ·{' '}
          <a className="text-accent hover:underline" href="https://github.com/harshitaajoshi/codeskyline" target="_blank" rel="noreferrer">
            source
          </a>
        </p>
      </div>
    </div>
  )
}

function Spinner() {
  return <span className="border-accent inline-block h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" />
}
