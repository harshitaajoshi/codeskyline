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
async function recordTimelapse(city: City, onProgress: (p: number) => void): Promise<void> {
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

/** The timeline region along the bottom: date large, commit quiet, a hairline scrubber. */
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
  const date = useMemo(() => new Date(timeAt(city, t) * 1000), [city, t])
  const years = useMemo(() => yearTicks(city), [city])
  if (kf.length < 2) return null

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

  const author = cur ? city.authors[cur.author] : undefined
  const pct = last ? (t / last) * 100 : 100

  return (
    <div className="rise pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center" style={{ animationDelay: '0.25s' }}>
      <StoryCaption city={city} />
      <section className="region-up pointer-events-auto w-[52rem] max-w-full px-6 pt-4 pb-4">
        <div className="flex items-center gap-5">
          <button
            onClick={() => setPlaying(!playing)}
            className="text-ivory hover:border-amber hover:text-amber flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-ivory/30 transition-colors active:scale-95"
            aria-label={playing ? 'pause' : 'play'}
            title="space"
          >
            {playing ? <Glyph.pause width={13} height={13} /> : <Glyph.play width={13} height={13} style={{ marginLeft: 2 }} />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-4">
              <div className="flex min-w-0 items-baseline gap-4">
                <span className="font-display shrink-0 text-[22px] leading-none tabular-nums">
                  {date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                </span>
                <span className="text-ivory/45 min-w-0 truncate font-mono text-[11px]">
                  {cur && (
                    <>
                      <span className="text-ivory/70">{cur.hash.slice(0, 7)}</span> {cur.subject}
                      {author && <span className="text-ivory/30"> · {author.login ? `@${author.login}` : author.name}</span>}
                    </>
                  )}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-5 font-mono text-[10.5px] tracking-[0.14em] uppercase">
                <select
                  className="text-ivory/55 hover:text-ivory cursor-pointer bg-transparent outline-none"
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
                <button onClick={goLive} className={`lnk ${live ? 'text-amber' : 'text-ivory/55 hover:text-ivory'}`} data-active={live}>
                  {live ? 'now' : 'to now'}
                </button>
                <button onClick={() => void exportVideo()} disabled={recording != null} className="lnk text-ivory/55 hover:text-ivory">
                  {recording == null ? 'export' : `${Math.round(recording * 100)}%`}
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
                className="scrub"
                style={{ ['--p' as string]: `${pct}%` }}
                aria-label="timeline"
              />
              <div className="idx pointer-events-none relative h-3">
                {years.map((y) => (
                  <span key={y.year} className="absolute -translate-x-1/2" style={{ left: `${(y.k / last) * 100}%` }}>
                    {y.year}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
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
function StoryCaption({ city }: { city: City }) {
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
    <div key={idx} className="rise txt pointer-events-auto mb-4 flex w-[52rem] max-w-full items-start gap-3 px-6" style={{ animationDuration: '0.4s' }}>
      <span className={`mt-2 inline-block h-[7px] w-[7px] shrink-0 rotate-45 ${e.kind === 'demolition' ? 'bg-fire/80' : e.kind === 'person' ? 'bg-ivory/60' : 'bg-amber/90'}`} />
      <div className="min-w-0">
        <div className="label">
          {when} · {KIND_WORD[e.kind] ?? e.kind}
        </div>
        <div className="font-display mt-0.5 text-[18px] leading-tight">{e.title}</div>
        <div className="text-ivory/60 text-[12px]">{e.detail}</div>
      </div>
      {pinned != null && (
        <button onClick={() => setPinned(null)} className="text-ivory/40 hover:text-ivory ml-auto transition" aria-label="close">
          <Glyph.close width={11} height={11} />
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
    if (pos - lastPos < 0.07) return
    out.push({ year: y, k })
    lastPos = pos
  })
  return out
}
