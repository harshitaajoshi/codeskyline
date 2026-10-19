import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { MODES, FIRE } from '../city/colors'
import { formatDate, formatNum, githubFileUrl } from '../city/scales'
import type { City } from '../city/types'
import { SAMPLES, loadSample } from '../city/load'

export function Hud({ city, onOpenFile }: { city: City; onOpenFile: () => void }) {
  return (
    <>
      <TopBar city={city} onOpenFile={onOpenFile} />
      <Legend city={city} />
      <Inspector city={city} />
      <Search city={city} />
    </>
  )
}

function TopBar({ city, onOpenFile }: { city: City; onOpenFile: () => void }) {
  const mode = useStore((s) => s.mode)
  const setMode = useStore((s) => s.setMode)
  const heightScale = useStore((s) => s.heightScale)
  const setHeightScale = useStore((s) => s.setHeightScale)
  const hideGenerated = useStore((s) => s.hideGenerated)
  const toggleGenerated = useStore((s) => s.toggleGenerated)
  const setCity = useStore((s) => s.setCity)
  const setLoading = useStore((s) => s.setLoading)
  const setError = useStore((s) => s.setError)

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start gap-3 p-3">
      <div className="panel pointer-events-auto flex items-center gap-3 px-3 py-2">
        <span className="text-sm font-semibold tracking-tight">🏙️ CodeSkyline</span>
        <span className="text-muted text-xs">/</span>
        <select
          className="bg-transparent text-sm outline-none"
          value={city.repo.name}
          onChange={async (e) => {
            const id = e.target.value
            if (id === '__open') return onOpenFile()
            setLoading()
            try {
              setCity(await loadSample(id))
            } catch (err) {
              setError(String(err))
            }
          }}
        >
          {SAMPLES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
          {!SAMPLES.some((s) => s.id === city.repo.name) && <option value={city.repo.name}>{city.repo.name}</option>}
          <option value="__open">Open a .city.json…</option>
        </select>
      </div>

      <div className="panel pointer-events-auto flex items-center gap-1 p-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            title={m.hint}
            onClick={() => setMode(m.id)}
            className={`rounded-lg px-3 py-1.5 text-sm transition ${mode === m.id ? 'bg-accent/20 text-accent' : 'text-muted hover:text-ink'}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="panel pointer-events-auto flex items-center gap-3 px-3 py-2 text-xs">
        <label className="text-muted flex items-center gap-1">
          height
          <select className="bg-transparent text-ink outline-none" value={heightScale} onChange={(e) => setHeightScale(e.target.value as never)}>
            <option value="sqrt">√ lines</option>
            <option value="log">log lines</option>
            <option value="linear">lines</option>
          </select>
        </label>
        <label className="text-muted flex items-center gap-1">
          <input type="checkbox" checked={hideGenerated} onChange={toggleGenerated} /> hide generated
        </label>
      </div>

      <div className="panel pointer-events-auto ml-auto px-3 py-2 text-xs">
        <div className="font-medium">{city.repo.name}</div>
        <div className="text-muted">
          {formatNum(city.stats.files)} files · {formatNum(city.stats.lines)} lines · {formatNum(city.repo.commits)} commits · {city.authors.length} authors
          {city.stats.burning > 0 && <span className="text-fire"> · 🔥 {city.stats.burning}</span>}
        </div>
      </div>
    </div>
  )
}

function Legend({ city }: { city: City }) {
  const mode = useStore((s) => s.mode)
  const top = useMemo(() => [...city.authors].map((a, i) => ({ ...a, i })).sort((a, b) => b.commits - a.commits).slice(0, 8), [city])
  const langs = useMemo(() => Object.entries(city.stats.languages).sort((a, b) => b[1] - a[1]).slice(0, 8), [city])
  return (
    <div className="panel pointer-events-auto absolute bottom-3 left-3 max-w-xs px-3 py-2 text-xs">
      {mode === 'churn' && <Bar label="commits" from="few" to="many" css="linear-gradient(90deg,#2f4a7a,#2d8fa8,#8fd36b,#f5d442,#f28b2b,#e8382b)" />}
      {mode === 'age' && <Bar label="created" from="new" to="old" css="linear-gradient(90deg,#f8f1a6,#8ad5c9,#4a7aa8,#2b3659)" />}
      {mode === 'hotspots' && (
        <div className="flex items-center gap-3">
          {['calm', 'smoke', 'flames', 'inferno'].map((l, i) => (
            <span key={l} className="flex items-center gap-1">
              <i className="inline-block h-3 w-3 rounded-sm" style={{ background: rgb(FIRE[i]!) }} /> {l}
            </span>
          ))}
        </div>
      )}
      {mode === 'language' && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          {langs.map(([l, n]) => (
            <span key={l} className="text-muted truncate">
              {l} <span className="opacity-60">{formatNum(n)}</span>
            </span>
          ))}
        </div>
      )}
      {mode === 'owners' && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          {top.map((a) => (
            <span key={a.i} className="flex items-center gap-1 truncate">
              <i className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: ownerCss(a.i, city) }} />
              <span className="truncate">{a.login ? `@${a.login}` : a.name}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function Bar({ label, from, to, css }: { label: string; from: string; to: string; css: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted">{label}</span>
      <span className="text-muted">{from}</span>
      <i className="inline-block h-2 w-28 rounded" style={{ background: css }} />
      <span className="text-muted">{to}</span>
    </div>
  )
}

function Inspector({ city }: { city: City }) {
  const selected = useStore((s) => s.selected)
  const hovered = useStore((s) => s.hovered)
  const select = useStore((s) => s.select)
  const id = selected ?? hovered
  if (id == null) return null
  const f = city.files[id]
  if (!f) return null
  const url = githubFileUrl(city, f)
  return (
    <div className="panel pointer-events-auto absolute right-3 bottom-3 w-80 p-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-[13px] break-all">{f.path}</div>
          <div className="text-muted">{f.lang}{f.generated ? ' · generated' : ''}{f.vendored ? ' · vendored' : ''}</div>
        </div>
        {selected != null && (
          <button className="text-muted hover:text-ink" onClick={() => select(null)} aria-label="close">✕</button>
        )}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Stat label="lines" value={formatNum(f.lines)} />
        <Stat label="commits" value={formatNum(f.commits)} />
        <Stat label="complexity" value={formatNum(f.complexity)} />
        <Stat label="bug fixes" value={formatNum(f.bugFixes)} />
        <Stat label="created" value={formatDate(f.created)} />
        <Stat label="last touch" value={formatDate(f.lastTouched)} />
      </div>
      {f.fire > 0 && (
        <div className="text-fire mt-2">🔥 {['', 'Smoking', 'On fire', 'Inferno'][f.fire]} — hotspot score {f.hotspot.toFixed(2)}</div>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
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
      if (f.path.toLowerCase().includes(s)) {
        out.push({ id: f.id, path: f.path })
        if (out.length >= 12) break
      }
    }
    return out
  }, [q, city])

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="panel pointer-events-auto absolute top-1/2 left-3 -translate-y-1/2 px-3 py-2 text-xs text-muted hover:text-ink"
      >
        search files <kbd>⌘K</kbd>
      </button>
    )
  return (
    <div className="pointer-events-auto absolute inset-x-0 top-24 mx-auto w-[32rem] max-w-[90vw]">
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

import { ownerPalette } from '../city/colors'
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
