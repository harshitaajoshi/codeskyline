import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from './store'
import { loadFile, loadSample } from './city/load'
import { etaText, fetchCity, fetchRepo, requestAnalysis, subscribeJob, type JobState } from './city/api'
import { rememberCity } from './city/cities'
import { cityPath, repoFromPath } from './city/route'
import { Wordmark } from './ui/Wordmark'
import { Scene } from './scene/Scene'
import { Hud } from './ui/Hud'
import { Home } from './ui/Home'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { isThemeId } from './scene/themes'

type Route = { kind: 'home' } | { kind: 'sample'; id: string } | { kind: 'repo'; owner: string; name: string; sha?: string }

function parseRoute(): Route {
  const params = new URLSearchParams(location.search)
  const repo = repoFromPath(location.pathname)
  if (repo) {
    // An old /r/ link, a .git or a deep GitHub path: show the plain address.
    if (location.pathname !== repo.path) history.replaceState(null, '', repo.path + location.search)
    return { kind: 'repo', owner: repo.owner, name: repo.name, sha: params.get('sha') ?? undefined }
  }
  const sample = params.get('sample')
  if (sample) return { kind: 'sample', id: sample }
  return { kind: 'home' }
}

export function App() {
  const city = useStore((s) => s.city)
  const status = useStore((s) => s.status)
  const error = useStore((s) => s.error)
  const setCity = useStore((s) => s.setCity)
  const setLoading = useStore((s) => s.setLoading)
  const setError = useStore((s) => s.setError)
  const [route, setRoute] = useState<Route>(parseRoute)
  const [dragging, setDragging] = useState(false)
  /** When a repository route has no city yet: what we know about the repository. */
  const [pending, setPending] = useState<{ owner: string; name: string; job: JobState | null; sizeKB?: number; exists: boolean } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onPop = () => setRoute(parseRoute())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = useCallback((path: string) => {
    history.pushState(null, '', path)
    setRoute(parseRoute())
  }, [])

  useEffect(() => {
    if (route.kind === 'home') return
    const params = new URLSearchParams(location.search)
    setLoading()
    setPending(null)
    const load = route.kind === 'sample' ? loadSample(route.id) : fetchCity(route.owner, route.name, route.sha)
    load.then(
      (c) => {
        setCity(c)
        if (route.kind === 'repo') rememberCity(route.owner, route.name, c.repo.head)
        applyUrlState(params, c.timeline.keyframes.length)
      },
      async (e) => {
        const msg = String(e instanceof Error ? e.message : e)
        if (route.kind !== 'repo' || msg !== 'not analyzed yet') return setError(msg)
        // No city for this repository yet. Follow the build under way, or
        // start one: arriving at the address is the request.
        try {
          const r = await fetchRepo(route.owner, route.name)
          if (r?.job) {
            setPending({ owner: route.owner, name: route.name, job: r.job, exists: true })
            return setError('building')
          }
          const a = await requestAnalysis(`https://github.com/${route.owner}/${route.name}`)
          // GitHub answers with the repository's current name (facebook/react
          // is react/react now): the city lives there, so show that address.
          if (a.owner !== route.owner || a.name !== route.name) history.replaceState(null, '', cityPath(a.owner, a.name) + location.search)
          if (a.status === 'ready') return setRoute(parseRoute())
          setPending({ owner: route.owner, name: route.name, job: { key: a.key, status: a.status, stage: a.stage ?? 'queued', detail: a.detail ?? '', log: a.log ?? [] }, sizeKB: a.sizeKB, exists: true })
          setError('building')
        } catch (err) {
          const m = String(err instanceof Error ? err.message : err)
          setPending({ owner: route.owner, name: route.name, job: null, exists: !/not found/i.test(m) })
          setError(/not found/i.test(m) ? 'no such repository' : m)
        }
      },
    )
  }, [route, setCity, setLoading, setError])

  // A build under way for this route: follow it and open the city when it lands.
  useEffect(() => {
    const job = pending?.job
    if (!job || job.status === 'ready' || job.status === 'error') return
    return subscribeJob(job.key, (s) => setPending((p) => (p ? { ...p, job: s } : p)))
  }, [pending?.job?.key, pending?.job?.status]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const job = pending?.job
    if (job?.status === 'ready') setRoute(parseRoute())
    if (job?.status === 'error') setError(job.error ?? 'analysis failed')
  }, [pending?.job?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  const build = useCallback(async () => {
    if (!pending) return
    try {
      const r = await requestAnalysis(`https://github.com/${pending.owner}/${pending.name}`)
      if (r.status === 'ready') return setRoute(parseRoute())
      setPending({ ...pending, job: { key: r.key, status: r.status, stage: r.stage ?? 'queued', detail: r.detail ?? '', log: r.log ?? [] }, sizeKB: r.sizeKB })
      setError('building')
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    }
  }, [pending])

  const openFiles = useCallback(
    async (files: FileList | null) => {
      const f = files?.[0]
      if (!f) return
      setLoading()
      try {
        setCity(await loadFile(f))
        history.replaceState(null, '', '/?local=1')
        setRoute({ kind: 'sample', id: '' })
      } catch (e) {
        setError(String(e instanceof Error ? e.message : e))
      }
    },
    [setCity, setLoading, setError],
  )

  const onOpen = useCallback((owner: string, name: string, sha?: string) => navigate(`${cityPath(owner, name)}${sha ? `?sha=${sha}` : ''}`), [navigate])
  // The landing page parks its hero city in the store too, so a route needs
  // its own load to have finished before the interactive scene mounts.
  const showCity = route.kind !== 'home' && city && status === 'ready'

  return (
    <div
      className="relative h-full w-full"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        void openFiles(e.dataTransfer.files)
      }}
    >
      {showCity && (
        <ErrorBoundary onReset={() => navigate('/')}>
          <Scene city={city} />
          <Hud city={city} onOpenFile={() => fileInput.current?.click()} onHome={() => navigate('/')} onOpen={onOpen} />
        </ErrorBoundary>
      )}
      {route.kind === 'home' && <Home onOpen={onOpen} onSample={(id) => navigate(`/?sample=${id}`)} />}
      <input ref={fileInput} type="file" accept=".json" className="hidden" onChange={(e) => void openFiles(e.target.files)} />

      {route.kind !== 'home' && status === 'loading' && <Center>Loading the city</Center>}
      {route.kind !== 'home' && status === 'error' && (
        <Problem error={error ?? ''} pending={pending} onHome={() => navigate('/')} onBuild={() => void build()} />
      )}
      <SmallScreen />
      {dragging && (
        <div className="border-accent/60 pointer-events-none absolute inset-4 flex items-center justify-center rounded-2xl border-2 border-dashed bg-black/40 text-lg">
          Drop a .city.json to render it
        </div>
      )}
    </div>
  )
}

/** ?t=0..1 (fraction of history), ?mode=churn|activity|hotspots|owners|language|age, ?play=1, ?f=<file id> */
function applyUrlState(params: URLSearchParams, keyframes: number) {
  const s = useStore.getState()
  const t = params.get('t')
  if (t != null && !Number.isNaN(Number(t))) s.setT(Math.min(1, Math.max(0, Number(t))) * Math.max(0, keyframes - 1))
  const mode = params.get('mode')
  if (mode && ['churn', 'activity', 'hotspots', 'owners', 'language', 'age', 'diff'].includes(mode)) s.setMode(mode as never)
  const f = params.get('f')
  if (f != null && !Number.isNaN(Number(f))) s.select(Number(f), true)
  const sim = params.get('sim')
  if (sim != null && !Number.isNaN(Number(sim))) s.setSimulateAuthor(Number(sim))
  if (params.get('play') === '1') s.setPlaying(true)
  if (params.get('day') === '1') s.setDay(true)
  const theme = params.get('theme')
  if (isThemeId(theme)) s.setTheme(theme)
}

const PROBLEMS: Record<string, { title: string; body: string }> = {
  'not built': { title: 'Not built yet', body: 'There is no city for this repository. Build one from its history; it takes about a minute.' },
  'no such repository': { title: 'No such repository', body: 'GitHub has no public repository at that address. Private repositories cannot be analyzed.' },
  building: { title: 'Building the city', body: 'The analyzer is reading the history. This page opens the city when it lands.' },
}

/** What stands between the visitor and a city, in the site's voice, with the way forward. */
function Problem({ error, pending, onHome, onBuild }: { error: string; pending: { owner: string; name: string; job: JobState | null; sizeKB?: number } | null; onHome: () => void; onBuild: () => void }) {
  const known = PROBLEMS[error]
  const title = known?.title ?? (/budget/i.test(error) ? 'Out of budget this month' : /slow down|rate/i.test(error) ? 'Too many requests' : /caps at|too big|GB/i.test(error) ? 'Too big for the hosted analyzer' : 'Could not open this city')
  const body = known?.body ?? error
  const job = pending?.job
  return (
    <div className="text-ivory absolute inset-0 flex items-center justify-center px-6">
      <div className="region w-[26rem] max-w-full px-6 pt-4 pb-5">
        <div className="pointer-events-auto mb-5">
          <Wordmark size={17} onClick={onHome} />
        </div>
        <div className="label">{pending ? `${pending.owner}/${pending.name}` : 'city'}</div>
        <div className="font-display mt-2 text-[22px] leading-tight">{title}</div>
        <p className="text-ivory/65 mt-2 text-[13px] leading-relaxed">{body}</p>
        {job && job.status !== 'error' && (
          <div className="mt-4 font-mono text-[11px]">
            <div className="flex items-center gap-2">
              <span className="bg-amber caret inline-block h-2 w-2 rounded-full" />
              <span>{job.detail || job.stage}</span>
            </div>
            <div className="text-ivory/40 mt-1">usually {etaText(pending?.sizeKB)} for a repository this size</div>
          </div>
        )}
        <div className="mt-5 flex items-center gap-6 font-mono text-[10.5px] tracking-[0.14em] uppercase">
          {error === 'not built' && (
            <button className="lnk text-amber" onClick={onBuild}>
              build it
            </button>
          )}
          <button className="lnk text-ivory/55 hover:text-ivory" onClick={onHome}>
            home
          </button>
        </div>
      </div>
    </div>
  )
}

/** Phones get a card, not a broken canvas: the city wants a desktop and a GPU. */
function SmallScreen() {
  const [small, setSmall] = useState(() => typeof window !== 'undefined' && (window.innerWidth < 720 || !hasWebGL2()))
  useEffect(() => {
    const onResize = () => setSmall(window.innerWidth < 720 || !hasWebGL2())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  if (!small) return null
  return (
    <div className="bg-bg text-ivory absolute inset-0 z-50 flex items-center justify-center px-6">
      <div className="max-w-sm">
        <Wordmark size={22} />
        <div className="font-display mt-6 text-[28px] leading-tight">Best on a desktop</div>
        <p className="text-ivory/65 mt-3 text-[14px] leading-relaxed">
          A city is fifty thousand buildings on a GPU with a keyboard to fly around it. Open this link on a computer, or read the repository's skyline below.
        </p>
        <img src={`/og${repoFromPath(location.pathname)?.path ?? '/_'}.png`} alt="" className="mt-6 w-full" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
      </div>
    </div>
  )
}

function hasWebGL2(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!c.getContext('webgl2')
  } catch {
    return false
  }
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="text-muted absolute inset-0 flex items-center justify-center font-mono text-xs tracking-[0.2em] uppercase">{children}</div>
}
