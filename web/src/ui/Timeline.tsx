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
    <div className="rise pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4" style={{ animationDelay: '0.2s' }}>
      <div className="glass pointer-events-auto w-[48rem] max-w-full px-4 pt-3 pb-2.5">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setPlaying(!playing)}
            className="bg-amber text-bg flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform duration-200 hover:scale-105 active:scale-95"
            aria-label={playing ? 'pause' : 'play'}
            title="space"
          >
            {playing ? <Glyph.pause /> : <Glyph.play style={{ marginLeft: 1 }} />}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[14px] leading-none font-medium tracking-[-0.01em] whitespace-nowrap tabular-nums">
                {date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
              <span className="text-ivory/50 truncate font-mono text-[11px]">
                {cur && (
                  <>
                    <span className="text-ivory/70">{cur.hash.slice(0, 7)}</span> {cur.subject}
                    {author && <span className="text-ivory/35"> · {author.login ? `@${author.login}` : author.name}</span>}
                  </>
                )}
              </span>
            </div>
            <div className="relative mt-1.5">
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
              <div className="text-ivory/35 pointer-events-none relative h-3 font-mono text-[10px]">
                {years.map((y) => (
                  <span key={y.year} className="absolute -translate-x-1/2" style={{ left: `${(y.k / last) * 100}%` }}>
                    {y.year}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1 self-start pt-0.5">
            <select
              className="text-ivory/60 hover:text-ivory h-8 cursor-pointer bg-transparent px-1 font-mono text-[11.5px] outline-none"
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
            <button onClick={goLive} className={`btn h-8 rounded-full px-3 font-mono text-[11.5px] ${live ? 'text-amber' : ''}`} title="jump to HEAD">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${live ? 'bg-amber' : 'bg-ivory/40'}`} />
              {live ? 'now' : 'to now'}
            </button>
            <button
              onClick={() => void exportVideo()}
              disabled={recording != null}
              className="btn h-8 rounded-full px-3 font-mono text-[11.5px] disabled:opacity-80"
              title="play from the start and download a video of it"
            >
              <Glyph.record className={recording != null ? 'text-fire' : ''} />
              {recording == null ? 'export' : `${Math.round(recording * 100)}%`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * The first keyframe of each year, for tick labels under the slider.
 * Keyframes are spaced by commit, not time, so quiet years bunch up; labels
 * closer than 7% of the track to the previous one are dropped.
 */
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
