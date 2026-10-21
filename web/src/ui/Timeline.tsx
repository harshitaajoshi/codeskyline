import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { timeAt } from '../city/timeline'
import type { City } from '../city/types'
import { Glyph } from './glyphs'

const SPEEDS = [4, 12, 30, 60]

/**
 * Records the WebGL canvas while the timeline plays from the beginning,
 * entirely in the browser, and downloads a .webm. The HUD is DOM, not
 * canvas, so the video is just the city.
 */
export async function recordTimelapse(city: City, onProgress: (p: number) => void): Promise<void> {
  const canvas = document.querySelector('canvas')
  if (!canvas || typeof MediaRecorder === 'undefined') throw new Error('recording is not supported in this browser')
  const stream = canvas.captureStream(60)
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported(m))
  if (!mime) throw new Error('no supported video codec')
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 })
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)
  const done = new Promise<void>((resolve) => (rec.onstop = () => resolve()))
  const s = useStore.getState()
  const last = Math.max(1, city.timeline.keyframes.length - 1)
  s.setT(0)
  rec.start(250)
  s.setPlaying(true)
  await new Promise<void>((resolve) => {
    const unsub = useStore.subscribe((st) => {
      onProgress(st.t / last)
      if (!st.playing || st.t >= last) {
        unsub()
        resolve()
      }
    })
  })
  await new Promise((r) => setTimeout(r, 1200))
  rec.stop()
  await done
  const blob = new Blob(chunks, { type: mime })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${city.repo.name.replace('/', '__')}-timelapse.${mime.includes('mp4') ? 'mp4' : 'webm'}`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
}

/** Play button, date, and the scrubber with story marks: the left part of the dock. */
export function Scrub({ city }: { city: City }) {
  const t = useStore((s) => s.t)
  const playing = useStore((s) => s.playing)
  const setT = useStore((s) => s.setT)
  const setPlaying = useStore((s) => s.setPlaying)
  const kf = city.timeline.keyframes
  const last = Math.max(0, kf.length - 1)
  const date = useMemo(() => new Date(timeAt(city, t) * 1000), [city, t])
  const years = useMemo(() => yearTicks(city), [city])
  if (kf.length < 2) return null
  const pct = last ? (t / last) * 100 : 100
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => setPlaying(!playing)}
        className="bg-amber text-bg flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform duration-200 hover:scale-105 active:scale-95"
        aria-label={playing ? 'pause' : 'play'}
        title="space"
      >
        {playing ? <Glyph.pause width={14} height={14} /> : <Glyph.play width={14} height={14} style={{ marginLeft: 1 }} />}
      </button>
      <span className="w-[7.2rem] shrink-0 text-[12.5px] font-medium tabular-nums">
        {date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
      </span>
      <div className="relative w-56">
        <StoryMarkers city={city} last={last} />
        <input
          type="range"
          min={0}
          max={last}
          step={0.01}
          value={t}
          onChange={(e) => {
            setPlaying(false)
            setT(Number(e.target.value))
          }}
          className="scrub"
          style={{ ['--p' as string]: `${pct}%` }}
          aria-label="timeline"
        />
        <div className="text-ivory/35 pointer-events-none absolute inset-x-0 -bottom-1.5 h-3 font-mono text-[9.5px]">
          {years.map((y) => (
            <span key={y.year} className="absolute -translate-x-1/2" style={{ left: `${(y.k / last) * 100}%` }}>
              {y.year}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Speed, go-to-now and export: lives in the "more" popover. */
export function PlaybackExtras({ city }: { city: City }) {
  const t = useStore((s) => s.t)
  const speed = useStore((s) => s.speed)
  const setSpeed = useStore((s) => s.setSpeed)
  const goLive = useStore((s) => s.goLive)
  const [recording, setRecording] = useState<number | null>(null)
  const last = Math.max(0, city.timeline.keyframes.length - 1)
  const live = t >= last
  const exportVideo = async () => {
    if (recording != null) return
    setRecording(0)
    try {
      await recordTimelapse(city, setRecording)
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setRecording(null)
    }
  }
  return (
    <div className="text-ivory/70 flex items-center justify-between gap-3 font-mono text-[11.5px]">
      <label className="flex items-center gap-1.5">
        speed
        <select className="text-ivory bg-transparent outline-none" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s === 12 ? '1×' : `${(s / 12).toFixed(s < 12 ? 1 : 0).replace('.0', '')}×`}
            </option>
          ))}
        </select>
      </label>
      <button onClick={goLive} className={`btn h-7 rounded-full px-2.5 ${live ? 'text-amber' : ''}`}>
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${live ? 'bg-amber' : 'bg-ivory/40'}`} /> {live ? 'now' : 'to now'}
      </button>
      <button onClick={() => void exportVideo()} disabled={recording != null} className="btn h-7 rounded-full px-2.5">
        <Glyph.record className={recording != null ? 'text-fire' : ''} width={13} height={13} /> {recording == null ? 'export video' : `${Math.round(recording * 100)}%`}
      </button>
    </div>
  )
}

const KIND_WORD: Record<string, string> = { rewrite: 'rewrite', demolition: 'demolition', burst: 'burst', district: 'new district', person: 'people' }

function StoryMarkers({ city, last }: { city: City; last: number }) {
  const setT = useStore((s) => s.setT)
  const setPlaying = useStore((s) => s.setPlaying)
  const setPinned = useStore((s) => s.setPinnedEvent)
  const pinned = useStore((s) => s.pinnedEvent)
  const story = city.timeline.story ?? []
  if (story.length === 0) return null
  return (
    <div className="pointer-events-none absolute inset-x-0 -top-1.5 h-3">
      {story.map((e, i) => (
        <button
          key={i}
          onClick={() => {
            setPlaying(false)
            setT(e.k)
            setPinned(pinned === i ? null : i)
          }}
          className={`pointer-events-auto absolute top-0 h-1.5 w-1.5 -translate-x-1/2 rotate-45 rounded-[1px] transition-transform hover:scale-150 ${
            e.kind === 'demolition' ? 'bg-fire/80' : e.kind === 'person' ? 'bg-ivory/60' : 'bg-amber/90'
          } ${pinned === i ? 'scale-150' : ''}`}
          style={{ left: `${(e.k / Math.max(1, last)) * 100}%` }}
          title={`${e.title}: ${e.detail}`}
          aria-label={e.title}
        />
      ))}
    </div>
  )
}

/** A caption for the moment the scrubber is on (or the one pinned by a click). */
export function StoryCaption({ city }: { city: City }) {
  const t = useStore((s) => s.t)
  const pinned = useStore((s) => s.pinnedEvent)
  const setPinned = useStore((s) => s.setPinnedEvent)
  const story = city.timeline.story ?? []
  let idx = pinned
  if (idx == null) {
    let best = -1
    let bestD = 0.75
    story.forEach((e, i) => {
      const d = Math.abs(e.k - t)
      if (d < bestD) {
        best = i
        bestD = d
      }
    })
    idx = best >= 0 ? best : null
  }
  if (idx == null) return null
  const e = story[idx]!
  const kf = city.timeline.keyframes[e.k]
  const when = kf ? new Date(kf.time * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'long' }) : ''
  return (
    <div key={idx} className="glass rise pointer-events-auto absolute bottom-20 left-1/2 flex max-w-[36rem] -translate-x-1/2 items-start gap-3 px-4 py-2.5" style={{ animationDuration: '0.4s' }}>
      <span className={`mt-1.5 inline-block h-2 w-2 shrink-0 rotate-45 rounded-[1px] ${e.kind === 'demolition' ? 'bg-fire/80' : e.kind === 'person' ? 'bg-ivory/60' : 'bg-amber/90'}`} />
      <div className="min-w-0">
        <div className="text-ivory/45 font-mono text-[10.5px] tracking-wide uppercase">
          {when} · {KIND_WORD[e.kind] ?? e.kind}
        </div>
        <div className="text-[13.5px] font-medium">{e.title}</div>
        <div className="text-ivory/60 text-[12px]">{e.detail}</div>
      </div>
      {pinned != null && (
        <button onClick={() => setPinned(null)} className="text-ivory/40 hover:text-ivory ml-2 transition" aria-label="close">
          <Glyph.close />
        </button>
      )}
    </div>
  )
}

function yearTicks(city: City) {
  const kf = city.timeline.keyframes
  const last = Math.max(1, kf.length - 1)
  const out: { year: number; k: number }[] = []
  let lastYear = -1
  let lastPos = -1
  kf.forEach((f, k) => {
    const y = new Date(f.time * 1000).getUTCFullYear()
    if (y === lastYear) return
    lastYear = y
    const pos = k / last
    if (pos - lastPos < 0.14) return
    out.push({ year: y, k })
    lastPos = pos
  })
  return out
}
