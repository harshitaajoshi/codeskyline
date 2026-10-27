import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { timeAt } from '../city/timeline'
import type { City } from '../city/types'
import { Glyph } from './glyphs'
import { startRecording } from '../scene/recorder'
import { fileStem, saveBlob } from '../scene/credit'

const SPEEDS = [4, 12, 30, 60]

/**
 * Replays the whole history from the beginning while recording it, then
 * saves an MP4 with the credit along the bottom (scene/recorder.ts). The HUD
 * is DOM, not canvas, so the video is just the city.
 */
async function recordTimelapse(city: City, onProgress: (p: number) => void): Promise<void> {
  const s = useStore.getState()
  const last = Math.max(1, city.timeline.keyframes.length - 1)
  s.setPlaying(false)
  s.setT(0)
  const rec = await startRecording(city)
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
  // Hold on the finished city for a beat.
  await new Promise((r) => setTimeout(r, 1500))
  const blob = await rec.stop()
  const name = `${fileStem(city)}-timelapse.${rec.ext}`
  saveBlob(blob, name)
  useStore.getState().setSaved({ url: URL.createObjectURL(blob), name, kind: 'video' })
}

/**
 * The timeline region along the bottom. Three rows with air between them:
 * the date and the commit it is on, the controls; then the track with the
 * story marks above it and the years beneath.
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
      <section className="region-up pointer-events-auto w-[58rem] max-w-full px-8 pt-5 pb-6">
        <div className="flex items-center gap-6">
          <button
            onClick={() => setPlaying(!playing)}
            className="text-ivory hover:border-amber hover:text-amber flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-ivory/30 transition-colors active:scale-95"
            aria-label={playing ? 'pause' : 'play'}
            title="space"
          >
            {playing ? <Glyph.pause width={13} height={13} /> : <Glyph.play width={13} height={13} style={{ marginLeft: 2 }} />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[26px] leading-none tabular-nums">
              {date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
            <div className="text-ivory/45 mt-2 truncate font-mono text-[11px]">
              {cur && (
                <>
                  <span className="text-ivory/70">{cur.hash.slice(0, 7)}</span>
                  <span className="mx-2 text-ivory/25">·</span>
                  {cur.subject}
                  {author && (
                    <>
                      <span className="mx-2 text-ivory/25">·</span>
                      <span className="text-ivory/35">{author.login ? `@${author.login}` : author.name}</span>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-7 self-start pt-1 font-mono text-[10.5px] tracking-[0.18em] uppercase">
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
            <button onClick={() => void exportVideo()} disabled={recording != null} className={`lnk ${recording == null ? 'text-ivory/55 hover:text-ivory' : 'text-amber'}`} title="record the whole history as an MP4">
              {recording == null ? 'export' : `recording ${Math.round(recording * 100)}%`}
            </button>
          </div>
        </div>

        <div className="relative mt-7 pl-[4.25rem]">
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
          <div className="idx relative mt-1 h-3">
            {years.map((y) => (
              <span key={y.year} className="absolute -translate-x-1/2" style={{ left: `${(y.k / last) * 100}%` }}>
                {y.year}
              </span>
            ))}
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
    <div className="pointer-events-none absolute top-0 right-0 left-[4.25rem] h-0">
      {story.map((e, i) => (
        <button
          key={i}
          onClick={() => {
            setPlaying(false)
            setT(e.k)
            setPinned(pinned === i ? null : i)
          }}
          className={`pointer-events-auto absolute -top-[13px] h-[6px] w-[6px] -translate-x-1/2 rotate-45 transition-transform hover:scale-150 ${
            e.kind === 'demolition' ? 'bg-fire/80' : e.kind === 'person' ? 'bg-ivory/55' : 'bg-amber/85'
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
    <div key={idx} className="rise txt pointer-events-auto mb-5 flex w-[58rem] max-w-full items-start gap-3 px-8" style={{ animationDuration: '0.4s' }}>
      <span className={`mt-2 inline-block h-[6px] w-[6px] shrink-0 rotate-45 ${e.kind === 'demolition' ? 'bg-fire/80' : e.kind === 'person' ? 'bg-ivory/55' : 'bg-amber/85'}`} />
      <div className="min-w-0">
        <div className="label">
          {when} · {KIND_WORD[e.kind] ?? e.kind}
        </div>
        <div className="font-display mt-1 text-[18px] leading-tight">{e.title}</div>
        <div className="text-ivory/60 mt-0.5 text-[12px]">{e.detail}</div>
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
