import { useEffect, useState } from 'react'
import { fetchGallery, requestAnalysis, subscribeJob, type GalleryEntry, type JobState } from '../city/api'
import { SAMPLES } from '../city/load'
import { formatNum } from '../city/scales'

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

export function Home({ onOpen }: { onOpen: (owner: string, name: string, sha?: string) => void }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [job, setJob] = useState<JobState | null>(null)
  const [gallery, setGallery] = useState<GalleryEntry[]>([])

  useEffect(() => {
    void fetchGallery().then(setGallery)
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

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const r = await requestAnalysis(url)
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
      <div className="mx-auto flex max-w-3xl flex-col items-center px-4 pt-24 pb-16 text-center">
        <div className="text-5xl">🏙️</div>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">CodeSkyline</h1>
        <p className="text-muted mt-3 max-w-xl text-balance">
          Turn any GitHub repo into a 3D city. Folders are districts, files are buildings, height is lines of code — and the
          bug-prone hotspots are on fire. Then scrub through years of history and watch it grow.
        </p>

        <form onSubmit={submit} className="panel mt-8 flex w-full max-w-xl items-center gap-2 p-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
            spellCheck={false}
            autoFocus
          />
          <button
            type="submit"
            disabled={busy || !url.trim()}
            className="bg-accent/20 text-accent hover:bg-accent/30 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {busy ? 'Starting…' : 'Build the city'}
          </button>
        </form>
        {error && <div className="text-fire mt-3 text-sm">{error}</div>}

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

        <div className="mt-12 w-full text-left">
          <h2 className="text-muted mb-3 text-xs font-medium tracking-wide uppercase">Explore a city</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {gallery.map((g) => (
              <button
                key={`${g.owner}/${g.name}`}
                onClick={() => onOpen(g.owner, g.name, g.sha)}
                className="panel hover:border-accent/50 flex items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {g.owner}/{g.name}
                  </div>
                  <div className="text-muted text-xs">
                    {formatNum(g.files)} files · {formatNum(g.commits)} commits
                    {g.burning > 0 && <span className="text-fire"> · 🔥 {g.burning}</span>}
                  </div>
                </div>
                <img src={`/badge/${g.owner}/${g.name}.svg`} alt="" className="h-6 shrink-0 opacity-90" loading="lazy" />
              </button>
            ))}
            {gallery.length === 0 &&
              SAMPLES.map((s) => (
                <a key={s.id} href={`/?sample=${s.id}`} className="panel hover:border-accent/50 block px-4 py-3">
                  <div className="font-medium">{s.label}</div>
                  <div className="text-muted text-xs">bundled sample</div>
                </a>
              ))}
          </div>
        </div>

        <p className="text-muted mt-12 text-xs">
          Or run it locally: <code className="font-mono">csky analyze ./my-repo</code> and drop the result here ·{' '}
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
