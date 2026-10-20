import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { MODES, FIRE, ownerPalette, type ColorMode } from '../city/colors'
import { formatDate, formatNum, githubFileUrl } from '../city/scales'
import type { City } from '../city/types'
import { createShare } from '../city/api'
import { Timeline } from './Timeline'
import { Tour, shouldShowTour } from './Tour'

export function Hud({ city, onOpenFile, onHome }: { city: City; onOpenFile: () => void; onHome: () => void }) {
  const walking = useStore((s) => s.walking)
  const setTourStep = useStore((s) => s.setTourStep)

  // Space toggles playback unless the user is typing or walking.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || (e.target as HTMLElement)?.tagName === 'INPUT') return
      const s = useStore.getState()
      if (s.walking) return
      e.preventDefault()
      s.setPlaying(!s.playing)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // First visit: the guided tour, after the fly-in has settled.
  useEffect(() => {
    if (!shouldShowTour() || new URLSearchParams(location.search).get('tour') === '0') return
    const t = setTimeout(() => setTourStep(0), 1800)
    return () => clearTimeout(t)
  }, [city, setTourStep])

  if (walking) return <WalkHud city={city} />
  return (
    <>
      <TopBar city={city} onOpenFile={onOpenFile} onHome={onHome} />
      <Lens city={city} />
      <Tooltip city={city} />
      <Inspector city={city} />
      <Search city={city} />
      <Timeline city={city} />
      <Tour city={city} />
    </>
  )
}

const ICONS: Record<ColorMode, string> = { churn: '🔁', activity: '⚡', hotspots: '🔥', owners: '👥', language: '🧩', age: '🕰️' }

function TopBar({ city, onOpenFile, onHome }: { city: City; onOpenFile: () => void; onHome: () => void }) {
  const setWalking = useStore((s) => s.setWalking)
  const setTourStep = useStore((s) => s.setTourStep)
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-2 p-3">
      <div className="panel pointer-events-auto flex items-center gap-2 px-3 py-2">
        <button className="text-sm font-semibold tracking-tight hover:opacity-80" onClick={onHome} title="home">
          🏙️ CodeSkyline
        </button>
        <span className="text-muted text-xs">/</span>
        <span className="text-sm font-medium">{city.repo.name}</span>
        {city.repo.url && (
          <a className="text-muted text-xs hover:text-ink" href={city.repo.url} target="_blank" rel="noreferrer" title="open on GitHub">
            ↗
          </a>
        )}
      </div>
      <div className="panel pointer-events-auto hidden items-center gap-3 px-3 py-2 text-xs md:flex">
        <Stat v={formatNum(city.stats.files)} l="files" />
        <Stat v={formatNum(city.stats.lines)} l="lines" />
        <Stat v={formatNum(city.repo.commits)} l="commits" />
        <Stat v={String(city.authors.length)} l="authors" />
        {city.stats.burning > 0 && <Stat v={`🔥 ${city.stats.burning}`} l="hotspots" fire />}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <button onClick={() => setWalking(true)} className="panel pointer-events-auto px-3 py-2 text-xs hover:text-accent" title="first-person walk (WASD, Esc to leave)">
          🚶 Walk
        </button>
        <ShareButton city={city} />
        <button onClick={onOpenFile} className="panel pointer-events-auto px-3 py-2 text-xs text-muted hover:text-ink" title="open a .city.json">
          📂
        </button>
        <button onClick={() => setTourStep(0)} className="panel pointer-events-auto px-3 py-2 text-xs text-muted hover:text-ink" title="replay the tour">
          ?
        </button>
      </div>
    </div>
  )
}

function Stat({ v, l, fire }: { v: string; l: string; fire?: boolean }) {
  return (
    <span className={fire ? 'text-fire' : ''}>
      <span className="font-medium">{v}</span> <span className="text-muted">{l}</span>
    </span>
  )
}

/** Left panel: pick how the city is colored, with the legend for the active lens. */
function Lens({ city }: { city: City }) {
  const mode = useStore((s) => s.mode)
  const setMode = useStore((s) => s.setMode)
  const open = useStore((s) => s.lensOpen)
  const setOpen = useStore((s) => s.setLensOpen)
  const heightScale = useStore((s) => s.heightScale)
  const setHeightScale = useStore((s) => s.setHeightScale)
  const hideGenerated = useStore((s) => s.hideGenerated)
  const toggleGenerated = useStore((s) => s.toggleGenerated)

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="panel pointer-events-auto absolute top-16 left-3 px-3 py-2 text-xs text-muted hover:text-ink">
        {ICONS[mode]} Lens ▸
      </button>
    )
  return (
    <div className="panel pointer-events-auto absolute top-16 left-3 w-64 overflow-hidden text-xs">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-muted font-medium tracking-wide uppercase">Lens</span>
        <button className="text-muted hover:text-ink" onClick={() => setOpen(false)} aria-label="collapse">
          ◂
        </button>
      </div>
      <ul>
        {MODES.map((m) => (
          <li key={m.id}>
            <button
              onClick={() => setMode(m.id)}
              className={`flex w-full items-start gap-2 px-3 py-2 text-left transition ${mode === m.id ? 'bg-accent/15' : 'hover:bg-white/5'}`}
            >
              <span className="text-base leading-5">{ICONS[m.id]}</span>
              <span className="min-w-0">
                <span className={`block font-medium ${mode === m.id ? 'text-accent' : ''}`}>{m.label}</span>
                <span className="text-muted block">{m.hint}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="border-line border-t px-3 py-2">
        <Legend city={city} mode={mode} />
      </div>
      <div className="border-line text-muted flex items-center justify-between border-t px-3 py-2">
        <label className="flex items-center gap-1">
          height
          <select className="bg-transparent text-ink outline-none" value={heightScale} onChange={(e) => setHeightScale(e.target.value as never)}>
            <option value="sqrt">√ lines</option>
            <option value="log">log lines</option>
            <option value="linear">lines</option>
          </select>
        </label>
        <label className="flex items-center gap-1" title="lockfiles, vendored and generated code">
          <input type="checkbox" checked={hideGenerated} onChange={toggleGenerated} /> hide generated
        </label>
      </div>
    </div>
  )
}

function Legend({ city, mode }: { city: City; mode: ColorMode }) {
  const top = useMemo(() => [...city.authors].map((a, i) => ({ ...a, i })).sort((a, b) => b.commits - a.commits).slice(0, 8), [city])
  const langs = useMemo(() => Object.entries(city.stats.languages).sort((a, b) => b[1] - a[1]).slice(0, 8), [city])
  switch (mode) {
    case 'churn':
      return <Bar from="few commits" to="many" css="linear-gradient(90deg,#2f4a7a,#2d8fa8,#8fd36b,#f5d442,#f28b2b,#e8382b)" />
    case 'activity':
      return <Bar from="quiet" to="being worked on" css="linear-gradient(90deg,#1f2a44,#2b4c7e,#3f8fd2,#8fe3ff,#ffffff)" />
    case 'age':
      return <Bar from="new" to="old" css="linear-gradient(90deg,#f8f1a6,#8ad5c9,#4a7aa8,#2b3659)" />
    case 'hotspots':
      return (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {['calm', 'smoke', 'flames', 'inferno'].map((l, i) => (
            <span key={l} className="flex items-center gap-1">
              <i className="inline-block h-3 w-3 rounded-sm" style={{ background: rgb(FIRE[i]!) }} /> {l}
            </span>
          ))}
        </div>
      )
    case 'language':
      return (
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          {langs.map(([l, n]) => (
            <span key={l} className="text-muted truncate">
              {l} <span className="opacity-60">{formatNum(n)}</span>
            </span>
          ))}
        </div>
      )
    case 'owners':
      return (
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          {top.map((a) => (
            <span key={a.i} className="flex items-center gap-1 truncate">
              <i className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: ownerCss(a.i, city) }} />
              <span className="truncate">{a.login ? `@${a.login}` : a.name}</span>
            </span>
          ))}
          <span className="flex items-center gap-1 truncate">
            <i className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: '#1c1f2b', border: '1px solid #3a4256' }} />
            <span className="text-muted truncate">👻 ghost town</span>
          </span>
        </div>
      )
  }
}

function Bar({ from, to, css }: { from: string; to: string; css: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted">{from}</span>
      <i className="inline-block h-2 flex-1 rounded" style={{ background: css }} />
      <span className="text-muted">{to}</span>
    </div>
  )
}

/** Follows the cursor over a building. */
function Tooltip({ city }: { city: City }) {
  const hovered = useStore((s) => s.hovered)
  const selected = useStore((s) => s.selected)
  const pointer = useStore((s) => s.pointer)
  if (hovered == null || hovered === selected) return null
  const f = city.files[hovered]
  if (!f) return null
  const name = f.path.slice(f.path.lastIndexOf('/') + 1)
  const dir = f.path.slice(0, f.path.lastIndexOf('/'))
  return (
    <div
      className="panel pointer-events-none absolute z-10 px-3 py-2 text-xs"
      style={{ left: pointer.x + 14, top: pointer.y + 14, maxWidth: '20rem' }}
    >
      <div className="font-mono text-[13px]">{name}</div>
      {dir && <div className="text-muted truncate font-mono text-[11px]">{dir}/</div>}
      <div className="text-muted mt-1">
        {f.removed ? 'demolished' : `${formatNum(f.lines)} lines`} · {formatNum(f.commits)} commits
        {f.fire > 0 && <span className="text-fire"> · 🔥 {['', 'smoke', 'flames', 'inferno'][f.fire]}</span>}
      </div>
      <div className="text-muted mt-0.5 opacity-70">click to inspect</div>
    </div>
  )
}

/** Copies a link that reproduces the current view; a short link when the API is around. */
function ShareButton({ city }: { city: City }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const share = async () => {
    const s = useStore.getState()
    const last = Math.max(1, city.timeline.keyframes.length - 1)
    const q = new URLSearchParams(location.search)
    q.set('mode', s.mode)
    if (s.t < last - 1e-6) q.set('t', (s.t / last).toFixed(3))
    else q.delete('t')
    if (s.selected != null) q.set('f', String(s.selected))
    else q.delete('f')
    q.delete('play')
    const target = `${location.pathname}?${q.toString()}`
    let url = `${location.origin}${target}`
    if (location.pathname.startsWith('/r/')) {
      try {
        url = await createShare(target)
      } catch {
        /* no API: fall back to the long URL */
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      history.replaceState(null, '', target)
      setState('copied')
    } catch {
      setState('failed')
    }
    setTimeout(() => setState('idle'), 1800)
  }
  return (
    <button onClick={() => void share()} className="panel pointer-events-auto px-3 py-2 text-xs text-muted hover:text-ink" title="copy a link to this view">
      {state === 'copied' ? '✓ link copied' : state === 'failed' ? 'copy failed' : '🔗 Share'}
    </button>
  )
}

function Inspector({ city }: { city: City }) {
  const selected = useStore((s) => s.selected)
  const select = useStore((s) => s.select)
  if (selected == null) return null
  const f = city.files[selected]
  if (!f) return null
  const url = githubFileUrl(city, f)
  const d = city.dirs[f.dir]
  return (
    <div className="panel pointer-events-auto absolute top-16 right-3 w-80 p-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-[13px] break-all">{f.path}</div>
          <div className="text-muted">
            {f.removed ? `demolished · peaked at ${formatNum(f.maxLines)} lines` : f.lang}
            {f.generated ? ' · generated' : ''}
            {f.vendored ? ' · vendored' : ''}
          </div>
        </div>
        <button className="text-muted hover:text-ink" onClick={() => select(null)} aria-label="close">
          ✕
        </button>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Cell label="lines" value={formatNum(f.lines)} />
        <Cell label="commits" value={formatNum(f.commits)} />
        <Cell label="complexity" value={formatNum(f.complexity)} />
        <Cell label="bug fixes" value={formatNum(f.bugFixes)} />
        <Cell label="created" value={formatDate(f.created)} />
        <Cell label="last touch" value={formatDate(f.lastTouched)} />
      </div>
      {f.fire > 0 && (
        <div className="text-fire mt-2">
          🔥 {['', 'Smoking', 'On fire', 'Inferno'][f.fire]} — changes often and is complex (hotspot score {f.hotspot.toFixed(2)})
        </div>
      )}
      {f.ghost && <div className="text-muted mt-2">👻 Ghost town — none of its owners has committed in over a year</div>}
      {d && d.files >= 3 && (
        <div className={`mt-2 ${d.bus <= 1 ? 'text-fire' : 'text-muted'}`}>
          🚌 <span className="font-mono">{d.path || '(root)'}</span> bus factor {d.bus}
          {d.bus === 1 && ' — one person holds this district'}
          {d.bus === 0 && ' — most of this district already has no active owner'}
        </div>
      )}
      {f.owners.length > 0 && (
        <div className="mt-2">
          <div className="text-muted mb-1">owners</div>
          {f.owners.map((o) => {
            const a = city.authors[o.author]
            if (!a) return null
            return (
              <div key={o.author} className="flex items-center gap-2">
                <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: ownerCss(o.author, city) }} />
                <span className="truncate">{a.login ? `@${a.login}` : a.name}</span>
                <span className="text-muted ml-auto">{Math.round(o.share * 100)}%</span>
              </div>
            )
          })}
        </div>
      )}
      {url && (
        <a className="text-accent mt-2 inline-block hover:underline" href={url} target="_blank" rel="noreferrer">
          open on GitHub ↗
        </a>
      )}
    </div>
  )
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  )
}

function WalkHud({ city }: { city: City }) {
  const setWalking = useStore((s) => s.setWalking)
  return (
    <>
      <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2">
        <div className="panel px-4 py-2 text-xs">
          🚶 Walking <span className="font-medium">{city.repo.name}</span> · <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> move · <kbd>Shift</kbd> run · <kbd>Esc</kbd> leave
        </div>
      </div>
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/70" />
      <button onClick={() => setWalking(false)} className="panel pointer-events-auto absolute right-3 bottom-3 px-3 py-2 text-xs">
        Leave walk mode
      </button>
    </>
  )
}

function Search({ city }: { city: City }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const select = useStore((s) => s.select)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    if (open) {
      setQ('')
      setTimeout(() => input.current?.focus(), 0)
    }
  }, [open])

  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return []
    const out: { id: number; path: string }[] = []
    for (const f of city.files) {
      if (!f.removed && f.path.toLowerCase().includes(s)) {
        out.push({ id: f.id, path: f.path })
        if (out.length >= 12) break
      }
    }
    return out
  }, [q, city])

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="panel pointer-events-auto absolute bottom-28 left-3 px-3 py-2 text-xs text-muted hover:text-ink">
        🔍 find a file <kbd>⌘K</kbd>
      </button>
    )
  return (
    <div className="pointer-events-auto absolute inset-x-0 top-24 z-20 mx-auto w-[32rem] max-w-[90vw]">
      <div className="panel overflow-hidden">
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) {
              select(results[0].id, true)
              setOpen(false)
            }
          }}
          placeholder="Jump to a file…"
          className="w-full bg-transparent px-4 py-3 text-sm outline-none"
        />
        {results.length > 0 && (
          <ul className="border-line max-h-72 overflow-auto border-t">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  className="hover:bg-accent/10 w-full px-4 py-2 text-left font-mono text-xs"
                  onClick={() => {
                    select(r.id, true)
                    setOpen(false)
                  }}
                >
                  {r.path}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function rgb(c: [number, number, number]) {
  return `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`
}

const paletteCache = new WeakMap<City, Map<number, [number, number, number]>>()
function ownerCss(author: number, city: City) {
  let p = paletteCache.get(city)
  if (!p) {
    p = ownerPalette(city)
    paletteCache.set(city, p)
  }
  const c = p.get(author)
  return c ? rgb(c) : '#3a4256'
}
