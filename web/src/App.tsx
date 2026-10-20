import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from './store'
import { loadFile, loadSample } from './city/load'
import { fetchCity } from './city/api'
import { Scene } from './scene/Scene'
import { Hud } from './ui/Hud'
import { Home } from './ui/Home'

type Route = { kind: 'home' } | { kind: 'sample'; id: string } | { kind: 'repo'; owner: string; name: string; sha?: string }

function parseRoute(): Route {
  const params = new URLSearchParams(location.search)
  const m = /^\/r\/([\w.-]+)\/([\w.-]+)\/?$/.exec(location.pathname)
  if (m) return { kind: 'repo', owner: m[1]!, name: m[2]!, sha: params.get('sha') ?? undefined }
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
    const load = route.kind === 'sample' ? loadSample(route.id) : fetchCity(route.owner, route.name, route.sha)
    load.then(
      (c) => {
        setCity(c)
        applyUrlState(params, c.timeline.keyframes.length)
      },
      (e) => setError(String(e instanceof Error ? e.message : e)),
    )
  }, [route, setCity, setLoading, setError])

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

  const onOpen = useCallback((owner: string, name: string, sha?: string) => navigate(`/r/${owner}/${name}${sha ? `?sha=${sha}` : ''}`), [navigate])
  const showCity = route.kind !== 'home' && city

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
      {showCity && <Scene city={city} />}
      {showCity && <Hud city={city} onOpenFile={() => fileInput.current?.click()} onHome={() => navigate('/')} />}
      {route.kind === 'home' && <Home onOpen={onOpen} onSample={(id) => navigate(`/?sample=${id}`)} />}
      <input ref={fileInput} type="file" accept=".json" className="hidden" onChange={(e) => void openFiles(e.target.files)} />

      {route.kind !== 'home' && status === 'loading' && !city && <Center>Building the city…</Center>}
      {route.kind !== 'home' && status === 'error' && (
        <Center>
          <div className="text-center">
            <div>⚠️ {error}</div>
            <button className="text-accent mt-3 text-sm hover:underline" onClick={() => navigate('/')}>
              ← back home
            </button>
          </div>
        </Center>
      )}
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
  if (mode && ['churn', 'activity', 'hotspots', 'owners', 'language', 'age'].includes(mode)) s.setMode(mode as never)
  const f = params.get('f')
  if (f != null && !Number.isNaN(Number(f))) s.select(Number(f), true)
  if (params.get('play') === '1') s.setPlaying(true)
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">{children}</div>
}
