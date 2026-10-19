import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from './store'
import { SAMPLES, loadFile, loadSample } from './city/load'
import { Scene } from './scene/Scene'
import { Hud } from './ui/Hud'

export function App() {
  const city = useStore((s) => s.city)
  const status = useStore((s) => s.status)
  const error = useStore((s) => s.error)
  const setCity = useStore((s) => s.setCity)
  const setLoading = useStore((s) => s.setLoading)
  const setError = useStore((s) => s.setError)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const id = params.get('sample') ?? SAMPLES[0]!.id
    setLoading()
    loadSample(id).then((c) => {
      setCity(c)
      applyUrlState(params, c.timeline.keyframes.length)
    }, (e) => setError(String(e)))
  }, [setCity, setLoading, setError])

  const openFiles = useCallback(
    async (files: FileList | null) => {
      const f = files?.[0]
      if (!f) return
      setLoading()
      try {
        setCity(await loadFile(f))
      } catch (e) {
        setError(String(e))
      }
    },
    [setCity, setLoading, setError],
  )

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
      {city && <Scene city={city} />}
      {city && <Hud city={city} onOpenFile={() => fileInput.current?.click()} />}
      <input ref={fileInput} type="file" accept=".json" className="hidden" onChange={(e) => void openFiles(e.target.files)} />

      {status === 'loading' && !city && <Center>Building the city…</Center>}
      {status === 'error' && <Center>⚠️ {error}</Center>}
      {dragging && (
        <div className="border-accent/60 pointer-events-none absolute inset-4 flex items-center justify-center rounded-2xl border-2 border-dashed bg-black/40 text-lg">
          Drop a .city.json to render it
        </div>
      )}
    </div>
  )
}

/** ?t=0..1 (fraction of history), ?mode=churn|activity|hotspots|owners|language|age, ?play=1 */
function applyUrlState(params: URLSearchParams, keyframes: number) {
  const s = useStore.getState()
  const t = params.get('t')
  if (t != null && !Number.isNaN(Number(t))) s.setT(Math.min(1, Math.max(0, Number(t))) * Math.max(0, keyframes - 1))
  const mode = params.get('mode')
  if (mode && ['churn', 'activity', 'hotspots', 'owners', 'language', 'age'].includes(mode)) s.setMode(mode as never)
  if (params.get('play') === '1') s.setPlaying(true)
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">{children}</div>
}
