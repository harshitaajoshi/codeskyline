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
    const id = new URLSearchParams(location.search).get('sample') ?? SAMPLES[0]!.id
    setLoading()
    loadSample(id).then(setCity, (e) => setError(String(e)))
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

function Center({ children }: { children: React.ReactNode }) {
  return <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">{children}</div>
}
