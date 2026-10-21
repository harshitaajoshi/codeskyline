import { useEffect, useRef, useState } from 'react'
import { fetchGallery, requestAnalysis, subscribeJob, type GalleryEntry, type JobState } from '../city/api'
import { SAMPLES, loadSample } from '../city/load'
import { formatNum } from '../city/scales'
import type { City } from '../city/types'
import { Scene } from '../scene/Scene'
import { Wordmark } from './Wordmark'

const STAGE_COPY: Record<string, string> = {
  queued: 'waiting for an analyzer',
  start: 'waking the analyzer',
  clone: 'fetching the repository',
  history: 'reading the commit history',
  files: 'measuring every building',
  metrics: 'finding the fires',
  layout: 'zoning the districts',
  encode: 'packing the city',
  store: 'saving the city',
  retry: 'retrying',
  ready: 'city built',
}

const TRY = [
  { label: 'facebook/react', url: 'https://github.com/facebook/react' },
  { label: 'vuejs/core', url: 'https://github.com/vuejs/core' },
  { label: 'fastify/fastify', url: 'https://github.com/fastify/fastify' },
]

export function Home({ onOpen, onSample }: { onOpen: (owner: string, name: string, sha?: string) => void; onSample: (id: string) => void }) {
  const [repo, setRepo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [job, setJob] = useState<JobState | null>(null)
  const [gallery, setGallery] = useState<GalleryEntry[]>([])
  const [hero, setHero] = useState<City | null>(null)
  const input = useRef<HTMLInputElement>(null)

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
      const [r, sha] = job.key.split('@')
      const [owner, name] = r!.split('/')
      onOpen(owner!, name!, sha)
    }
  }, [job, onOpen])

  const submit = async (target = repo) => {
    const t = target.trim()
    if (!t) return
    setError(null)
    setBusy(true)
    try {
      const r = await requestAnalysis(t.includes('github.com') ? t : `https://github.com/${t}`)
      if (r.status === 'ready') onOpen(r.owner, r.name, r.sha)
      else setJob({ key: r.key, status: r.status, stage: r.stage ?? 'queued', detail: r.detail ?? '', log: r.log ?? [] })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="absolute inset-0 overflow-auto text-ivory">
      {/* The live city, pushed to the right; the left column stays legible. */}
      <div className="pointer-events-none fixed inset-0">
        {hero && <Scene city={hero} hero />}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,7,13,0.92)_0%,rgba(5,7,13,0.72)_38%,rgba(5,7,13,0.15)_70%,rgba(5,7,13,0.35)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-b from-transparent to-bg" />
      </div>

      <div className="relative">
        {/* Nav */}
        <header className="mx-auto flex max-w-6xl items-center justify-between px-6 pt-6 text-[13px]">
          <Wordmark size={22} />
          <nav className="text-ivory/60 flex items-center gap-6 font-mono text-xs tracking-wide">
            <a className="hover:text-ivory uppercase" href="https://github.com/harshitaajoshi/codeskyline/tree/main/action" target="_blank" rel="noreferrer">
              (01) PR action
            </a>
            <a className="hover:text-ivory uppercase" href="https://github.com/harshitaajoshi/codeskyline/blob/main/docs/benchmarks.md" target="_blank" rel="noreferrer">
              (02) Benchmarks
            </a>
            <a className="hover:text-ivory uppercase" href="https://github.com/harshitaajoshi/codeskyline" target="_blank" rel="noreferrer">
              (03) Source ↗
            </a>
          </nav>
        </header>

        {/* Hero */}
        <section className="mx-auto flex min-h-[88vh] max-w-6xl flex-col justify-center px-6">
          <div className="max-w-2xl">
            <div className="rise text-ivory/55 font-mono text-xs tracking-[0.22em] uppercase" style={{ animationDelay: '0.05s' }}>
              (00) A git history, rendered
            </div>
            <h1 className="rise font-display mt-5 text-[clamp(3rem,7.2vw,6.4rem)] leading-[0.95] font-semibold uppercase" style={{ animationDelay: '0.15s' }}>
              Every
              <br />
              repository
              <br />
              <span className="text-ivory/90">is a</span> <span className="font-serif text-amber normal-case italic">city.</span>
            </h1>
            <p className="rise text-ivory/70 mt-7 max-w-md text-lg leading-relaxed" style={{ animationDelay: '0.3s' }}>
              Paste one. Walk its streets, watch fifteen years of commits build it, and find the buildings that are on fire.
            </p>

            {/* Prompt */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void submit()
              }}
              className="rise mt-10 max-w-xl"
              style={{ animationDelay: '0.45s' }}
              onClick={() => input.current?.focus()}
            >
              <div className="hairline flex items-baseline gap-0 border-b pb-3 font-mono text-lg">
                <span className="text-ivory/45 select-none">github.com/</span>
                <input
                  ref={input}
                  value={repo}
                  onChange={(e) => setRepo(e.target.value.replace(/^https?:\/\/(www\.)?github\.com\//, ''))}
                  placeholder="owner/repo"
                  className="text-ivory placeholder:text-ivory/25 caret-amber min-w-0 flex-1 bg-transparent outline-none"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoFocus
                />
                <button type="submit" disabled={busy || !repo.trim()} className="text-ivory/50 hover:text-amber ml-3 text-xs tracking-wide disabled:opacity-40">
                  {busy ? 'starting…' : 'build ↵'}
                </button>
              </div>
              <div className="text-ivory/45 mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs">
                <button type="button" onClick={() => onSample(SAMPLES[0]!.id)} className="hover:text-amber underline-offset-4 hover:underline">
                  explore expressjs/express →
                </button>
                <span className="text-ivory/25">or try</span>
                {TRY.map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => {
                      setRepo(t.label)
                      void submit(t.url)
                    }}
                    className="hover:text-amber"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {error && <div className="text-fire mt-3 max-w-xl font-mono text-xs">{error}</div>}
            </form>

            {job && job.status !== 'ready' && (
              <div className="hairline mt-6 max-w-xl border-l pl-4 font-mono text-xs">
                <div className="flex items-center gap-2">
                  {job.status === 'error' ? <span className="text-fire">✕</span> : <span className="bg-amber caret inline-block h-2 w-2 rounded-full" />}
                  <span className={job.status === 'error' ? 'text-fire' : 'text-ivory'}>{job.status === 'error' ? 'analysis failed' : (STAGE_COPY[job.stage] ?? job.stage)}</span>
                </div>
                <div className="text-ivory/50 mt-1 truncate">{job.error ?? job.detail}</div>
                {job.log.length > 1 && (
                  <ul className="text-ivory/35 mt-2 space-y-0.5">
                    {job.log.slice(-5).map((l, i) => (
                      <li key={i} className="truncate">
                        {l.stage.padEnd(8)} {l.detail}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Legend */}
        <section id="legend" className="mx-auto max-w-6xl scroll-mt-10 px-6 pb-8">
          <div className="hairline flex items-end justify-between border-b pb-3">
            <h2 className="font-display text-[26px] uppercase">How to read a city</h2>
            <span className="text-ivory/45 font-mono text-xs tracking-[0.22em] uppercase">(04) Legend</span>
          </div>
          <ol className="grid gap-x-10 gap-y-10 pt-10 sm:grid-cols-2 lg:grid-cols-4">
            {LEGEND.map((l, i) => (
              <li key={l.title} className="group">
                <div className="text-ivory/45 flex items-center justify-between font-mono text-xs">
                  <span>({String(i + 1).padStart(2, '0')})</span>
                  <l.Glyph />
                </div>
                <div className="font-display mt-4 text-[19px] leading-tight uppercase">{l.title}</div>
                <p className="text-ivory/60 mt-2 text-sm leading-relaxed">{l.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Recently built */}
        {gallery.length > 0 && (
          <section className="mx-auto max-w-6xl px-6 pt-20 pb-8">
            <div className="hairline flex items-end justify-between border-b pb-3">
              <h2 className="font-display text-[26px] uppercase">Recently built</h2>
              <span className="text-ivory/45 font-mono text-xs tracking-[0.22em] uppercase">(05) {gallery.length} cities</span>
            </div>
            <ul className="divide-ivory/10 divide-y">
              {gallery.map((g) => (
                <li key={`${g.owner}/${g.name}`}>
                  <button
                    onClick={() => onOpen(g.owner, g.name, g.sha)}
                    className="group grid w-full grid-cols-[1fr_auto] items-center gap-4 py-4 text-left sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]"
                  >
                    <div className="min-w-0">
                      <div className="group-hover:text-amber truncate font-mono text-sm transition">
                        {g.owner}/<span className="font-medium">{g.name}</span>
                      </div>
                      <div className="text-ivory/45 mt-0.5 font-mono text-xs">
                        {formatNum(g.files)} files · {formatNum(g.commits)} commits · {g.authors} authors
                        {g.burning > 0 && <span className="text-fire"> · {g.burning} on fire</span>}
                      </div>
                    </div>
                    <img src={`/badge/${g.owner}/${g.name}.svg?label=`} alt="" className="hidden h-6 w-full object-contain object-left opacity-80 sm:block" loading="lazy" />
                    <span className="text-ivory/40 group-hover:text-amber font-mono text-xs">open →</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 pt-16 pb-10 font-mono text-xs">
          <span className="text-ivory/40">
            Built from <span className="text-ivory/70">git log</span> alone. No tracker, no uploads of your code.
          </span>
          <span className="text-ivory/40">
            <code>csky analyze ./repo</code> runs it locally · MIT
          </span>
        </footer>
      </div>
    </div>
  )
}

/* Line-drawn glyphs: one stroke weight, no fills, no emoji. */
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.25, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

const LEGEND = [
  {
    title: 'Files are buildings',
    body: 'Height is lines of code. Windows light up where work is happening right now, and go dark where it stopped.',
    Glyph: () => (
      <svg width="40" height="28" viewBox="0 0 40 28" {...stroke}>
        <path d="M3 27V13h8v14M15 27V4h10v23M29 27V9h8v18" />
        <path d="M6 17h2M6 21h2M18 8h4M18 12h4M18 16h4M32 13h2M32 17h2" strokeWidth="1" />
      </svg>
    ),
  },
  {
    title: 'Folders are districts',
    body: 'Streets follow the directory tree, so the layout is the architecture. Nothing is placed arbitrarily.',
    Glyph: () => (
      <svg width="40" height="28" viewBox="0 0 40 28" {...stroke}>
        <rect x="2" y="2" width="36" height="24" rx="1" />
        <path d="M2 14h20M22 2v24M30 2v24M2 8h20M22 20h16" strokeWidth="1" />
      </svg>
    ),
  },
  {
    title: 'Hotspots burn',
    body: 'Files that change often and are complex. Measured on twelve repositories, the top twenty catch 70% of the files that need fixes next year.',
    Glyph: () => (
      <svg width="40" height="28" viewBox="0 0 40 28" {...stroke}>
        <path d="M14 27V12h12v15" />
        <path d="M20 11c-4-3-3-7 0-10 1 3 4 3 4 6s-1 4-4 4Z" />
        <path d="M20 11c-1.5-1-1.5-3 0-4 .5 1.5 1.5 1.5 1.5 2.5" strokeWidth="1" />
      </svg>
    ),
  },
  {
    title: 'Time travels',
    body: 'Scrub the timeline and the city rebuilds itself commit by commit, on the GPU, so it stays smooth at fifty thousand buildings.',
    Glyph: () => (
      <svg width="40" height="28" viewBox="0 0 40 28" {...stroke}>
        <path d="M2 22h36" />
        <path d="M6 22V16M14 22V10M22 22V6M30 22V12M36 22V3" strokeWidth="1" />
        <circle cx="22" cy="22" r="2" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
]
