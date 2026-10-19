import { useMemo } from 'react'
import { useStore } from '../store'
import { timeAt } from '../city/timeline'
import type { City } from '../city/types'

const SPEEDS = [4, 12, 30, 60]

export function Timeline({ city }: { city: City }) {
  const t = useStore((s) => s.t)
  const k = useStore((s) => s.k)
  const playing = useStore((s) => s.playing)
  const speed = useStore((s) => s.speed)
  const setT = useStore((s) => s.setT)
  const setPlaying = useStore((s) => s.setPlaying)
  const setSpeed = useStore((s) => s.setSpeed)
  const goLive = useStore((s) => s.goLive)

  const kf = city.timeline.keyframes
  const last = Math.max(0, kf.length - 1)
  const live = t >= last
  const cur = kf[k]
  const date = useMemo(() => new Date(timeAt(city, t) * 1000), [city, t])
  const years = useMemo(() => yearTicks(city), [city])
  if (kf.length < 2) return null

  const author = cur ? city.authors[cur.author] : undefined
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
      <div className="panel pointer-events-auto w-[46rem] max-w-full px-4 py-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setPlaying(!playing)}
            className="bg-accent/20 text-accent hover:bg-accent/30 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm"
            aria-label={playing ? 'pause' : 'play'}
            title="space"
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium whitespace-nowrap tabular-nums">
                {date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
              </span>
              <span className="text-muted truncate">
                {cur && (
                  <>
                    <span className="font-mono">{cur.hash.slice(0, 7)}</span> {cur.subject}
                    {author && <span className="opacity-70"> — {author.login ? `@${author.login}` : author.name}</span>}
                  </>
                )}
              </span>
            </div>
            <div className="relative mt-1">
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
                className="accent-accent w-full"
                aria-label="timeline"
              />
              <div className="text-muted pointer-events-none relative h-3 text-[10px]">
                {years.map((y) => (
                  <span key={y.year} className="absolute -translate-x-1/2" style={{ left: `${(y.k / last) * 100}%` }}>
                    {y.year}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <select
            className="bg-transparent text-xs text-muted outline-none"
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
          <button
            onClick={goLive}
            className={`shrink-0 rounded-md px-2 py-1 text-xs ${live ? 'text-fire' : 'text-muted hover:text-ink'}`}
            title="jump to HEAD"
          >
            ● {live ? 'now' : 'go to now'}
          </button>
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
