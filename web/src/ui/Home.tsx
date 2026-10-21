import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchGallery, requestAnalysis, subscribeJob, type GalleryEntry, type JobState } from '../city/api'
import { SAMPLES, loadSample } from '../city/load'
import { formatNum } from '../city/scales'
import { timeAt } from '../city/timeline'
import type { City } from '../city/types'
import { Scene } from '../scene/Scene'
import { useStore } from '../store'
import { BEATS, storyTargets, useStory, type Beat, type StoryTargets } from '../story'
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
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void fetchGallery().then(setGallery)
    loadSample(SAMPLES[0]!.id).then(setHero, () => {})
  }, [])

  // The hero city lives in the store so the scene follows the story below.
  useEffect(() => {
    if (!hero) return
    useStore.getState().setCity(hero)
    return () => {
      const s = useStore.getState()
      s.select(null)
      s.setMode('churn')
      s.setShowCoupling(true)
      s.setSimulateAuthor(null)
      useStory.getState().set(0, 0)
    }
  }, [hero])

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

  const toTop = () => {
    scroller.current?.scrollTo({ top: 0, behavior: 'smooth' })
    setTimeout(() => input.current?.focus(), 500)
  }

  return (
    <div ref={scroller} className="absolute inset-0 overflow-auto text-ivory">
      {/* The live city, pushed to the right; the left column stays legible. */}
      <div className="pointer-events-none fixed inset-0">
        {hero && <Scene city={hero} hero />}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,7,13,0.92)_0%,rgba(5,7,13,0.72)_38%,rgba(5,7,13,0.15)_70%,rgba(5,7,13,0.35)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-b from-transparent to-bg" />
        {hero && <HeroTag city={hero} />}
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
                    {lastPerStage(job.log).slice(-5).map((l, i) => (
                      <li key={i} className="truncate">
                        {l.stage.padEnd(8)} {l.detail}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="rise text-ivory/35 mt-16 font-mono text-[10.5px] tracking-[0.22em] uppercase" style={{ animationDelay: '0.7s' }}>
              Scroll to read the city
            </div>
          </div>
        </section>

        {/* The story: the city behind demonstrates one thing per beat. */}
        <Story city={hero} scroller={scroller} onDone={toTop} />

        {/* Recently built */}
        {gallery.length > 0 && (
          <section className="mx-auto max-w-6xl px-6 pt-20 pb-8">
            <div className="hairline flex items-end justify-between border-b pb-3">
              <h2 className="font-display text-[26px] uppercase">Recently built</h2>
              <span className="text-ivory/45 font-mono text-xs tracking-[0.22em] uppercase">(07) {gallery.length} cities</span>
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
                    <img src={`/badge/${g.owner}/${g.name}.svg?bare=1`} alt="" className="hidden h-6 w-full object-contain object-left opacity-70 transition group-hover:opacity-100 sm:block" loading="lazy" />
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

/** One line per stage, the most recent, so a long clone does not scroll the log with percentages. */
function lastPerStage<T extends { stage: string }>(log: T[]): T[] {
  const out: T[] = []
  for (const l of log) {
    const prev = out[out.length - 1]
    if (prev && prev.stage === l.stage) out[out.length - 1] = l
    else out.push(l)
  }
  return out
}

/* ---------------------------------------------------------------------- */

interface Block {
  kind: Exclude<Beat, 'hero'>
  index: string
  label: string
  title: React.ReactNode
  body: React.ReactNode
  stat?: React.ReactNode
}

function shortName(path: string) {
  return path.slice(path.lastIndexOf('/') + 1)
}

function authorName(city: City, i: number) {
  const a = city.authors[i]
  return a ? (a.login ? `@${a.login}` : a.name) : 'someone'
}

/** Copy for each beat, written from the hero city's own numbers. */
function blocksFor(city: City | null): Block[] {
  const t = city ? storyTargets(city) : null
  const tall = t?.tallest != null ? city!.files[t.tallest] : undefined
  const fire = t?.fire != null ? city!.files[t.fire] : undefined
  const a = t?.pair ? city!.files[t.pair.a] : undefined
  const b = t?.pair ? city!.files[t.pair.b] : undefined
  const years = city ? Math.max(1, Math.round((city.repo.lastCommit - city.repo.firstCommit) / (365 * 86400))) : 0
  return [
    {
      kind: 'buildings',
      index: '01',
      label: 'Files are buildings',
      title: (
        <>
          Height is <em className="font-serif text-amber normal-case italic">lines.</em>
        </>
      ),
      body: 'Every file is a building and every folder a district, laid out along the directory tree. Windows light up where work is happening right now and go dark where it stopped.',
      stat: tall ? `${tall.path} is the tallest, at ${formatNum(tall.lines)} lines` : undefined,
    },
    {
      kind: 'hotspots',
      index: '02',
      label: 'Hotspots burn',
      title: (
        <>
          Some buildings are <em className="font-serif text-amber normal-case italic">on fire.</em>
        </>
      ),
      body: 'They change constantly and they are complex: the two things that predict where bugs get fixed next. Measured on twelve repositories, the top twenty catch 70% of next year’s fixes.',
      stat: fire && t ? `${t.burning} burning · ${fire.path}: ${formatNum(fire.commits)} commits, ${fire.bugFixes} bug fixes` : undefined,
    },
    {
      kind: 'bridges',
      index: '03',
      label: 'Hidden dependencies',
      title: (
        <>
          Change one, and the other <em className="font-serif text-amber normal-case italic">follows.</em>
        </>
      ),
      body: 'Two buildings are bridged when they keep changing in the same commits, even though nothing imports one from the other. The bridges come from the log alone; no parser could find them.',
      stat: a && b && t?.pair ? `${shortName(a.path)} and ${shortName(b.path)}: together in ${t.pair.support} commits, ${Math.round(t.pair.confidence * 100)}% of the time` : undefined,
    },
    {
      kind: 'time',
      index: '04',
      label: 'Time travels',
      title: city ? <LiveDate city={city} /> : 'Keep scrolling.',
      body: `Keep scrolling and the city rebuilds itself commit by commit. ${years ? `${years} years and ${formatNum(city!.repo.commits)} commits` : 'The whole history'}, replayed on the GPU, so it stays smooth at fifty thousand buildings.`,
    },
    departureBlock(city, t),
  ]
}

/**
 * The last beat is whichever is more striking for this city: one person's
 * departure, or how much of it is already a ghost town.
 */
function departureBlock(city: City | null, t: StoryTargets | null): Block {
  const dep = t?.departure ?? null
  if (city && dep && dep.lost.size / dep.total >= 0.05) {
    return {
      kind: 'departure',
      index: '05',
      label: 'If someone left',
      title: (
        <>
          If {authorName(city, dep.author)} <em className="font-serif text-amber normal-case italic">left.</em>
        </>
      ),
      body: 'Every building goes dark whose only remaining active owner is that person. Owners who have not committed in a year do not count. This is the bus factor you can see.',
      stat: `${dep.lost.size} files would have no active owner, ${Math.round((dep.lost.size / dep.total) * 100)}% of the live codebase`,
    }
  }
  const pct = t && t.alive ? Math.round((t.ghosts / t.alive) * 100) : 0
  return {
    kind: 'departure',
    index: '05',
    label: 'Who still knows this',
    title: (
      <>
        Most of it is a <em className="font-serif text-amber normal-case italic">ghost town.</em>
      </>
    ),
    body: 'Colored by owner, a building goes dark when nobody who wrote it is still active and nobody has touched it in a year. Click a person in the Owners lens to simulate them leaving.',
    stat: t ? `${t.ghosts} files, ${pct}% of the live codebase, have no active owner left` : undefined,
  }
}

function Story({ city, scroller, onDone }: { city: City | null; scroller: React.RefObject<HTMLDivElement | null>; onDone: () => void }) {
  const beat = useStory((s) => s.beat)
  const refs = useRef<(HTMLElement | null)[]>([])
  const blocks = useMemo(() => blocksFor(city), [city])

  // Which block spans the middle of the viewport, and how far through it.
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    let raf = 0
    const update = () => {
      raf = 0
      const mid = el.clientHeight * 0.5
      let b = 0
      let p = 0
      refs.current.forEach((node, i) => {
        if (!node) return
        const r = node.getBoundingClientRect()
        if (r.top <= mid) {
          b = i + 1
          p = Math.min(1, Math.max(0, (mid - r.top) / r.height))
        }
      })
      useStory.getState().set(b, p)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [scroller, city])

  // The city reacts: lens, selection, bridges, time and the departure sim.
  useEffect(() => {
    if (!city) return
    const t = storyTargets(city)
    const last = Math.max(0, city.timeline.keyframes.length - 1)
    const apply = (b: number, p: number) => {
      const s = useStore.getState()
      if (s.city !== city) return
      const kind = BEATS[b] ?? 'hero'
      if (kind === 'time') s.setT(p * last)
      else if (s.t !== last) s.goLive()
      const sim = kind === 'departure' && t.departure && t.departure.lost.size / t.departure.total >= 0.05 ? t.departure.author : null
      if (s.simulateAuthor !== sim) s.setSimulateAuthor(sim)
      if (s.showCoupling !== (kind === 'bridges')) s.setShowCoupling(kind === 'bridges')
      const mode = kind === 'hotspots' ? 'hotspots' : kind === 'time' ? 'activity' : kind === 'departure' ? 'owners' : 'churn'
      if (s.mode !== mode) s.setMode(mode)
      const sel = kind === 'buildings' ? t.tallest : kind === 'hotspots' ? t.fire : kind === 'bridges' ? (t.pair?.a ?? null) : null
      if (s.selected !== sel) s.select(sel)
    }
    const st = useStory.getState()
    apply(st.beat, st.progress)
    return useStory.subscribe((n) => apply(n.beat, n.progress))
  }, [city])

  return (
    <section className="mx-auto max-w-6xl px-6">
      {blocks.map((blk, i) => {
        const active = beat === i + 1
        return (
          <article
            key={blk.kind}
            ref={(n) => {
              refs.current[i] = n
            }}
            className={`flex min-h-[90vh] items-center transition-opacity duration-500 ${active ? 'opacity-100' : 'opacity-25'}`}
          >
            <div className="max-w-lg">
              <div className="text-ivory/55 font-mono text-xs tracking-[0.22em] uppercase">
                ({blk.index}) {blk.label}
              </div>
              <h2 className="font-display mt-5 text-[clamp(2.2rem,4.4vw,3.6rem)] leading-[1] font-semibold uppercase">{blk.title}</h2>
              <p className="text-ivory/65 mt-6 max-w-md text-[15.5px] leading-relaxed">{blk.body}</p>
              {blk.stat && <div className="text-amber mt-5 font-mono text-[12px] leading-relaxed">{blk.stat}</div>}
            </div>
          </article>
        )
      })}

      {/* Past the last beat the city returns to now, as the reader first saw it. */}
      <article
        ref={(n) => {
          refs.current[blocks.length] = n
        }}
        className="flex min-h-[60vh] items-center"
      >
        <div className="max-w-lg">
          <div className="text-ivory/55 font-mono text-xs tracking-[0.22em] uppercase">(06) Your turn</div>
          <h2 className="font-display mt-5 text-[clamp(2.2rem,4.4vw,3.6rem)] leading-[1] font-semibold uppercase">
            Now read <em className="font-serif text-amber normal-case italic">yours.</em>
          </h2>
          <p className="text-ivory/65 mt-6 max-w-md text-[15.5px] leading-relaxed">
            Any public GitHub repository, built in about a minute from its commit history. Nothing is uploaded; the analyzer only reads the log.
          </p>
          <button onClick={onDone} className="lnk text-amber mt-6 font-mono text-[11px] tracking-[0.16em] uppercase">
            Paste a repository ↑
          </button>
        </div>
      </article>
    </section>
  )
}

/** The timeline date, live while the time beat scrubs. */
function LiveDate({ city }: { city: City }) {
  const t = useStore((s) => s.t)
  const date = new Date(timeAt(city, t) * 1000)
  return (
    <span className="tabular-nums">
      {date.toLocaleDateString(undefined, { month: 'long' })} <em className="font-serif text-amber normal-case italic">{date.getFullYear()}.</em>
    </span>
  )
}

/** Name tag over the building the story points at. */
function HeroTag({ city }: { city: City }) {
  const selected = useStore((s) => s.selected)
  const m = useStore((s) => s.markerScreen)
  if (selected == null || !m.visible) return null
  const f = city.files[selected]
  if (!f) return null
  return (
    <div className="txt absolute z-10 flex -translate-x-1/2 -translate-y-full flex-col items-center" style={{ left: m.x, top: m.y }}>
      <div className="font-mono text-[12.5px] whitespace-nowrap">{shortName(f.path)}</div>
      <span className="bg-amber mt-1.5 h-5 w-px" />
    </div>
  )
}
