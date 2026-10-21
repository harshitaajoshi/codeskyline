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

/**
 * The timeline, set along the bottom edge: a hairline scrubber with the
 * story marks, the date large on the left, the commit under it. No box.
 */
export function Timeline({ city }: { city: City }) {
  const t = useStore((s) => s.t)
  const k = useStore((s) => s.k)
  const playing = useStore((s) => s.playing)
  const speed = useStore((s) => s.speed)
  const setT = useStore((s) => s.setT)
  const setPlaying = useStore((s) => s.setPlaying)
  const setSpeed = useStore((s) => s.setSpeed)
  const goLive = useStore((s) => s.goLive)
  const [recording, setRecording] = useState<number | null>(null)
  const kf = city.timeline.keyframes
  const last = Math.max(0, kf.length - 1)
  const live = t >= last
  const cur = kf[k]
  const author = cur ? city.authors[cur.author] : undefined
  const date = useMemo(() => new Date(timeAt(city, t) * 1000), [city, t])
  const years = useMemo(() => yearTicks(city), [city])
  if (kf.length < 2) return null
  const pct = last ? (t / last) * 100 : 100

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
    <div className="rise txt pointer-events-none absolute right-6 bottom-6 left-6" style={{ animationDelay: '0.2s' }}>
      <div className="flex items-end gap-6">
        <button
          onClick={() => setPlaying(!playing)}
          className="ring-btn text-ivory pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          aria-label={playing ? 'pause' : 'play'}
          title="space"
        >
          {playing ? <Glyph.pause width={14} height={14} /> : <Glyph.play width={14} height={14} style={{ marginLeft: 2 }} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-6">
            <div className="min-w-0">
              <span className="font-display text-[30px] leading-none tracking-[-0.01em] tabular-nums">
                {date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
              <span className="text-ivory/45 ml-4 font-mono text-[11px]">
                {cur && (
                  <>
                    <span className="text-ivory/70">{cur.hash.slice(0, 7)}</span> {cur.subject.length > 72 ? cur.subject.slice(0, 72) + '…' : cur.subject}
                    {author && <span className="text-ivory/30"> · {author.login ? `@${author.login}` : author.name}</span>}
                  </>
                )}
              </span>
            </div>
            <div className="pointer-events-auto flex shrink-0 items-center gap-5 font-mono text-[11px] tracking-[0.12em] uppercase">
              <select
                className="text-ivory/60 hover:text-ivory cursor-pointer bg-transparent outline-none"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                title="playback speed"
              >
                {SPEEDS.map((s) => (
                  <option key={s} value={s}>
                    {s === 12 ? '1×' : `${(s / 12).toFixed(s < 12 ? 1 : 0).replace('.0', '')}×`}
                  </option>
                ))}
              </select>
              <button onClick={goLive} className={`lnk ${live ? 'text-amber' : 'text-ivory/60 hover:text-ivory'}`} data-active={live}>
                {live ? 'now' : 'to now'}
              </button>
              <button onClick={() => void exportVideo()} disabled={recording != null} className="lnk text-ivory/60 hover:text-ivory">
                {recording == null ? 'export video' : `${Math.round(recording * 100)}%`}
              </button>
            </div>
          </div>
          <div className="relative mt-3">
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
              className="scrub pointer-events-auto"
              style={{ ['--p' as string]: `${pct}%` }}
              aria-label="timeline"
            />
            <div className="text-ivory/35 pointer-events-none relative h-3 font-mono text-[10px]">
              {years.map((y) => (
                <span key={y.year} className="absolute -translate-x-1/2" style={{ left: `${(y.k / last) * 100}%` }}>
                  {y.year}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
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
    <div className="pointer-events-none absolute inset-x-0 -top-2 h-3">
      {story.map((e, i) => (
        <button
          key={i}
          onClick={() => {
            setPlaying(false)
            setT(e.k)
            setPinned(pinned === i ? null : i)
          }}
          className={`pointer-events-auto absolute top-0 h-[7px] w-[7px] -translate-x-1/2 rotate-45 transition-transform hover:scale-150 ${
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
    <div key={idx} className="rise txt pointer-events-auto absolute bottom-[7.5rem] left-[4.6rem] max-w-[34rem]" style={{ animationDuration: '0.4s' }}>
      <div className="text-ivory/45 font-mono text-[10.5px] tracking-[0.16em] uppercase">
        {when} · {KIND_WORD[e.kind] ?? e.kind}
        {pinned != null && (
          <button onClick={() => setPinned(null)} className="text-ivory/40 hover:text-ivory ml-3 transition" aria-label="close">
            <Glyph.close width={10} height={10} />
          </button>
        )}
      </div>
      <div className="font-display mt-1 text-[22px] leading-tight">{e.title}</div>
      <div className="text-ivory/60 mt-0.5 text-[12.5px]">{e.detail}</div>
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
    if (pos - lastPos < 0.05) return
    out.push({ year: y, k })
    lastPos = pos
  })
  return out
}
