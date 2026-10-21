import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { MODES, FIRE, ownerPalette, type ColorMode } from '../city/colors'
import { formatISO, formatNum, githubFileUrl } from '../city/scales'
import type { City } from '../city/types'
import { createShare } from '../city/api'
import { Timeline } from './Timeline'
import { Tour, shouldShowTour } from './Tour'
import { Glyph, MODE_GLYPH } from './glyphs'
import { simulateDeparture } from '../city/knowledge'
import { partnersOf } from '../scene/Coupling'
import { Insights } from './Insights'

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
    <div className="text-ivory">
      <TopBar city={city} onOpenFile={onOpenFile} onHome={onHome} />
      <Lens city={city} />
      <Tooltip city={city} />
      <SelectedTag city={city} />
      <Insights city={city} />
      <Inspector city={city} />
      <Search city={city} />
      <Timeline city={city} />
      <Tour city={city} />
    </div>
  )
}

function TopBar({ city, onOpenFile, onHome }: { city: City; onOpenFile: () => void; onHome: () => void }) {
  const setWalking = useStore((s) => s.setWalking)
  const setTourStep = useStore((s) => s.setTourStep)
  return (
    <div className="rise pointer-events-none absolute inset-x-0 top-0 flex items-center gap-3 p-4">
      <div className="glass glass-pill pointer-events-auto flex h-10 items-center pr-4 pl-4">
        <button className="text-[15px] leading-none font-semibold tracking-[-0.03em] hover:opacity-80" onClick={onHome} title="home">
          Code<span className="text-amber">Skyline</span>
        </button>
        <span className="hairline mx-3 h-4 border-l" />
        <span className="font-mono text-[12.5px]">
          <span className="text-ivory/50">{city.repo.name.split('/')[0]}/</span>
          {city.repo.name.split('/').slice(1).join('/') || city.repo.name}
        </span>
        {city.repo.url && (
          <a className="text-ivory/40 hover:text-ivory ml-2 transition" href={city.repo.url} target="_blank" rel="noreferrer" title="open on GitHub">
            <Glyph.external width={12} height={12} />
          </a>
        )}
      </div>

      <div className="text-ivory/55 pointer-events-auto hidden items-center gap-4 font-mono text-[11.5px] md:flex">
        <Stat v={formatNum(city.stats.files)} l="files" />
        <Stat v={formatNum(city.stats.lines)} l="lines" />
        <Stat v={formatNum(city.repo.commits)} l="commits" />
        <Stat v={String(city.authors.length)} l="authors" />
        {city.stats.burning > 0 && (
          <span className="text-fire/90 flex items-center gap-1">
            <Glyph.hotspots width={12} height={12} /> {city.stats.burning} on fire
          </span>
        )}
      </div>

      <div className="glass glass-pill pointer-events-auto ml-auto flex h-10 items-center p-1">
        <button className="btn rounded-full" onClick={() => setWalking(true)} title="first-person walk · WASD, Esc to leave">
          <Glyph.walk /> Walk
        </button>
        <span className="hairline h-4 border-l" />
        <ShareButton city={city} />
        <span className="hairline h-4 border-l" />
        <button className="btn rounded-full" onClick={onOpenFile} title="open a .city.json">
          <Glyph.open />
        </button>
        <button className="btn rounded-full" onClick={() => setTourStep(0)} title="replay the tour">
          <Glyph.help />
        </button>
      </div>
    </div>
  )
}

function Stat({ v, l }: { v: string; l: string }) {
  return (
    <span>
      <span className="text-ivory/85">{v}</span> {l}
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
  const showCoupling = useStore((s) => s.showCoupling)
  const setShowCoupling = useStore((s) => s.setShowCoupling)

  if (!open) {
    const G = MODE_GLYPH[mode]
    return (
      <button onClick={() => setOpen(true)} className="glass btn rise pointer-events-auto absolute top-[68px] left-4 h-10 rounded-full pr-4">
        <G /> <span className="label">lens</span>
      </button>
    )
  }
  return (
    <div className="glass rise pointer-events-auto absolute top-[68px] left-4 max-h-[calc(100vh-14rem)] w-[17rem] overflow-x-hidden overflow-y-auto" style={{ animationDelay: '0.1s' }}>
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="label">Lens</span>
        <button className="text-ivory/40 hover:text-ivory transition" onClick={() => setOpen(false)} aria-label="collapse">
          <Glyph.chevron width={12} height={12} style={{ transform: 'rotate(180deg)' }} />
        </button>
      </div>
      <ul className="px-2 pb-2">
        {MODES.filter((m) => m.id !== 'diff' || city.diff).map((m) => {
          const G = MODE_GLYPH[m.id]
          const active = mode === m.id
          return (
            <li key={m.id}>
              <button
                onClick={() => setMode(m.id)}
                className={`relative flex w-full items-start gap-3 rounded-[10px] px-3 py-2 text-left transition-colors duration-200 ${active ? 'bg-ivory/[0.07]' : 'hover:bg-ivory/[0.04]'}`}
              >
                <span className={`mt-0.5 transition-colors ${active ? 'text-amber' : 'text-ivory/50'}`}>
                  <G />
                </span>
                <span className="min-w-0">
                  <span className={`block text-[13px] leading-5 ${active ? 'text-ivory' : 'text-ivory/85'}`}>{m.label}</span>
                  <span className="text-ivory/45 block text-[11.5px] leading-4">{m.hint}</span>
                </span>
                {active && <span className="bg-amber absolute top-2.5 bottom-2.5 left-0 w-[2px] rounded-full" />}
              </button>
            </li>
          )
        })}
      </ul>
      <div className="hairline border-t px-4 py-3">
        <Legend city={city} mode={mode} />
      </div>
      <div className="hairline text-ivory/50 flex items-center justify-between border-t px-4 py-2.5 font-mono text-[11px]">
        <label className="flex items-center gap-1.5">
          height
          <select className="text-ivory/85 bg-transparent outline-none" value={heightScale} onChange={(e) => setHeightScale(e.target.value as never)}>
            <option value="sqrt">√ lines</option>
            <option value="log">log lines</option>
            <option value="linear">lines</option>
          </select>
        </label>
        <label className="flex cursor-pointer items-center gap-1.5" title="lockfiles, vendored and generated code">
          <input type="checkbox" className="accent-amber" checked={hideGenerated} onChange={toggleGenerated} /> hide generated
        </label>
      </div>
      {city.couplings.length > 0 && (
        <label className="hairline text-ivory/50 flex cursor-pointer items-center justify-between border-t px-4 py-2.5 font-mono text-[11px]" title="hover or select a building to see the files that change with it">
          <span>
            bridges on hover <span className="text-ivory/30">· {city.couplings.length} pairs</span>
          </span>
          <input type="checkbox" className="accent-amber" checked={showCoupling} onChange={(e) => setShowCoupling(e.target.checked)} />
        </label>
      )}
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
        <div className="text-ivory/60 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px]">
          {['calm', 'smoke', 'flames', 'inferno'].map((l, i) => (
            <span key={l} className="flex items-center gap-1.5">
              <i className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: rgb(FIRE[i]!) }} /> {l}
            </span>
          ))}
        </div>
      )
    case 'language':
      return (
        <div className="text-ivory/60 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px]">
          {langs.map(([l, n]) => (
            <span key={l} className="truncate">
              {l} <span className="text-ivory/35">{formatNum(n)}</span>
            </span>
          ))}
        </div>
      )
    case 'owners':
      return <OwnersLegend city={city} top={top} />
    case 'diff':
      return (
        <div className="text-ivory/60 font-mono text-[11px]">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <span className="flex items-center gap-1.5">
              <i className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: '#5fd38d' }} /> added
            </span>
            <span className="flex items-center gap-1.5">
              <i className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: '#b89a5e' }} /> modified
            </span>
            <span className="flex items-center gap-1.5">
              <i className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: '#ff5c5c' }} /> deleted
            </span>
          </div>
          {city.diff && (
            <div className="text-ivory/40 mt-1.5">
              {city.diff.files.length} files · {city.diff.base.slice(0, 7)} → {city.diff.head.slice(0, 7)}
            </div>
          )}
        </div>
      )
  }
}

/** Owners legend with the departure simulation: click a person, see what goes dark. */
function OwnersLegend({ city, top }: { city: City; top: { i: number; name: string; login?: string }[] }) {
  const sim = useStore((s) => s.simulateAuthor)
  const setSim = useStore((s) => s.setSimulateAuthor)
  const impact = useMemo(() => (sim == null ? null : simulateDeparture(city, sim)), [city, sim])
  const name = (i: number) => {
    const a = city.authors[i]
    return a ? (a.login ? `@${a.login}` : a.name) : ''
  }
  return (
    <div className="text-[11.5px]">
      <div className="text-ivory/70 grid grid-cols-2 gap-x-3 gap-y-1">
        {top.map((a) => (
          <button
            key={a.i}
            onClick={() => setSim(sim === a.i ? null : a.i)}
            className={`flex items-center gap-1.5 truncate rounded px-1 -mx-1 text-left transition ${sim === a.i ? 'bg-ivory/[0.08] text-ivory' : 'hover:bg-ivory/[0.05]'}`}
            title="simulate this person leaving"
          >
            <i className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: ownerCss(a.i, city) }} />
            <span className="truncate">{a.login ? `@${a.login}` : a.name}</span>
          </button>
        ))}
        <span className="flex items-center gap-1.5 truncate px-1 -mx-1">
          <i className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: '#1c1f2b', border: '1px solid #3a4256' }} />
          <span className="text-ivory/45 truncate">ghost town</span>
        </span>
      </div>
      {impact ? (
        <div className="hairline mt-3 border-t pt-3">
          <div className="label mb-1.5">if {name(impact.author)} left</div>
          <div className="text-[13px]">
            <span className="text-fire font-medium">{impact.lost.size}</span>{' '}
            <span className="text-ivory/60">
              of {impact.total} files ({impact.total ? Math.round((impact.lost.size / impact.total) * 100) : 0}%) would have no active owner
            </span>
          </div>
          {impact.districts.length > 0 && (
            <ul className="text-ivory/60 mt-2 space-y-0.5 font-mono text-[11px]">
              {impact.districts.map((d) => (
                <li key={d.path} className="flex justify-between gap-2">
                  <span className="truncate">{d.path}</span>
                  <span className="text-fire/80 shrink-0">
                    {d.lost}/{d.files}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button onClick={() => setSim(null)} className="text-ivory/45 hover:text-ivory mt-2 font-mono text-[11px] transition">
            clear simulation
          </button>
        </div>
      ) : (
        <div className="text-ivory/35 mt-2 font-mono text-[10.5px]">click a person to simulate them leaving</div>
      )}
    </div>
  )
}

function Bar({ from, to, css }: { from: string; to: string; css: string }) {
  return (
    <div className="text-ivory/50 flex items-center gap-2 font-mono text-[11px]">
      <span>{from}</span>
      <i className="inline-block h-1.5 flex-1 rounded-full" style={{ background: css }} />
      <span>{to}</span>
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
    <div className="glass pointer-events-none absolute z-10 px-3 py-2" style={{ left: pointer.x + 16, top: pointer.y + 16, maxWidth: '20rem' }}>
      <div className="font-mono text-[12.5px]">{name}</div>
      {dir && <div className="text-ivory/45 truncate font-mono text-[10.5px]">{dir}/</div>}
      <div className="text-ivory/60 mt-1.5 font-mono text-[11px]">
        {f.removed ? 'demolished' : `${formatNum(f.lines)} lines`} · {formatNum(f.commits)} commits
        {f.fire > 0 && <span className="text-fire"> · {['', 'smoke', 'flames', 'inferno'][f.fire]}</span>}
      </div>
    </div>
  )
}

/** Name tag pinned above the selected building (position comes from the scene each frame). */
function SelectedTag({ city }: { city: City }) {
  const selected = useStore((s) => s.selected)
  const m = useStore((s) => s.markerScreen)
  if (selected == null || !m.visible) return null
  const f = city.files[selected]
  if (!f) return null
  const name = f.path.slice(f.path.lastIndexOf('/') + 1)
  const dir = f.path.slice(0, f.path.lastIndexOf('/'))
  return (
    <div className="pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-full flex-col items-center" style={{ left: m.x, top: m.y }}>
      <div className="glass border-amber/60 px-3 py-1.5 text-center whitespace-nowrap">
        <div className="font-mono text-[12.5px]">{name}</div>
        {dir && <div className="text-ivory/45 font-mono text-[10px]">{dir}/</div>}
      </div>
      <span className="bg-amber mt-1 h-3 w-[1.5px]" />
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
    <button onClick={() => void share()} className="btn rounded-full" title="copy a link to this view">
      <Glyph.share /> {state === 'copied' ? <span className="text-amber">copied</span> : state === 'failed' ? 'copy failed' : 'Share'}
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
  const name = f.path.slice(f.path.lastIndexOf('/') + 1)
  const dir = f.path.slice(0, f.path.lastIndexOf('/'))
  return (
    <div key={selected} className="glass rise pointer-events-auto absolute top-[68px] right-4 w-[20rem] overflow-hidden text-[12.5px]">
      <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-3">
        <div className="min-w-0">
          {dir && <div className="text-ivory/45 truncate font-mono text-[11px]">{dir}/</div>}
          <div className="font-mono text-[15px] leading-tight break-all">{name}</div>
          <div className="text-ivory/50 mt-1 font-mono text-[11px]">
            {f.removed ? `demolished · peaked at ${formatNum(f.maxLines)} lines` : f.lang}
            {f.generated ? ' · generated' : ''}
            {f.vendored ? ' · vendored' : ''}
          </div>
        </div>
        <button className="text-ivory/40 hover:text-ivory mt-0.5 transition" onClick={() => select(null)} aria-label="close">
          <Glyph.close />
        </button>
      </div>
      <div className="hairline grid grid-cols-3 border-t">
        <Cell label="lines" value={formatNum(f.lines)} />
        <Cell label="commits" value={formatNum(f.commits)} />
        <Cell label="complexity" value={formatNum(f.complexity)} />
        <Cell label="bug fixes" value={formatNum(f.bugFixes)} top />
        <Cell label="created" value={formatISO(f.created)} top />
        <Cell label="touched" value={formatISO(f.lastTouched)} top />
      </div>
      {(f.fire > 0 || f.ghost || (d && d.files >= 3)) && (
        <div className="hairline space-y-1.5 border-t px-4 py-3 text-[12px]">
          {f.fire > 0 && (
            <div className="text-fire flex items-start gap-2">
              <Glyph.hotspots className="mt-0.5 shrink-0" />
              <span>
                {['', 'Smoking', 'On fire', 'Inferno']![f.fire]}: changes often and is complex <span className="text-fire/60 font-mono">({f.hotspot.toFixed(2)})</span>
              </span>
            </div>
          )}
          {f.ghost && <div className="text-ivory/55">Ghost town: none of its owners has committed in over a year.</div>}
          {d && d.files >= 3 && (
            <div className={d.bus <= 1 ? 'text-fire/90' : 'text-ivory/55'}>
              <span className="font-mono">{d.path || '(root)'}</span> · bus factor {d.bus}
              {d.bus === 1 && ': one person holds this district'}
              {d.bus === 0 && ': most of this district has no active owner'}
            </div>
          )}
        </div>
      )}
      {f.owners.length > 0 && (
        <div className="hairline border-t px-4 py-3">
          <div className="label mb-2">owners</div>
          {f.owners.map((o) => {
            const a = city.authors[o.author]
            if (!a) return null
            return (
              <div key={o.author} className="flex items-center gap-2 py-0.5">
                <i className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: ownerCss(o.author, city) }} />
                <span className="truncate">{a.login ? `@${a.login}` : a.name}</span>
                <span className="text-ivory/45 ml-auto font-mono text-[11px]">{Math.round(o.share * 100)}%</span>
              </div>
            )
          })}
        </div>
      )}
      <CoupledWith city={city} id={selected} />
      {url && (
        <a className="hairline text-ivory/70 hover:text-amber flex items-center justify-between border-t px-4 py-2.5 font-mono text-[11.5px] transition" href={url} target="_blank" rel="noreferrer">
          open on GitHub <Glyph.external width={12} height={12} />
        </a>
      )}
    </div>
  )
}

/** Files that keep changing in the same commits as this one. */
function CoupledWith({ city, id }: { city: City; id: number }) {
  const select = useStore((s) => s.select)
  const partners = useMemo(() => partnersOf(city, id).slice(0, 6), [city, id])
  if (partners.length === 0) return null
  return (
    <div className="hairline border-t px-4 py-3">
      <div className="label mb-2">changes together with</div>
      <ul className="space-y-1">
        {partners.map((p) => {
          const f = city.files[p.id]!
          return (
            <li key={p.id}>
              <button onClick={() => select(p.id, true)} className="group flex w-full items-center gap-2 text-left" title={f.path}>
                <span className="group-hover:text-amber truncate font-mono text-[11.5px] transition">{f.path}</span>
                <span className="text-ivory/40 ml-auto shrink-0 font-mono text-[10.5px]">
                  {p.support}× · {Math.round(p.confidence * 100)}%
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Cell({ label, value, top }: { label: string; value: string; top?: boolean }) {
  return (
    <div className={`hairline px-4 py-2.5 ${top ? 'border-t' : ''} [&:not(:nth-child(3n+1))]:border-l`}>
      <div className="label">{label}</div>
      <div className="mt-0.5 font-mono text-[12.5px] whitespace-nowrap">{value}</div>
    </div>
  )
}

function WalkHud({ city }: { city: City }) {
  const setWalking = useStore((s) => s.setWalking)
  return (
    <div className="text-ivory">
      <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2">
        <div className="glass glass-pill flex h-10 items-center gap-3 px-5 font-mono text-[11.5px]">
          <Glyph.walk className="text-amber" />
          <span>{city.repo.name}</span>
          <span className="hairline h-4 border-l" />
          <span className="text-ivory/60">
            <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> move · <kbd>⇧</kbd> run · <kbd>esc</kbd> leave
          </span>
        </div>
      </div>
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80" />
      <div className="text-ivory/45 pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 font-mono text-[11px]">if the mouse is not captured, click the city</div>
      <button onClick={() => setWalking(false)} className="glass btn pointer-events-auto absolute right-4 bottom-4 h-10 rounded-full px-4">
        Leave walk
      </button>
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
      if (!f.removed && f.path.toLowerCase().includes(s)) {
        out.push({ id: f.id, path: f.path })
        if (out.length >= 12) break
      }
    }
    return out
  }, [q, city])

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="glass btn rise pointer-events-auto absolute bottom-[7.5rem] left-4 h-10 rounded-full pr-3">
        <Glyph.search /> find a file <kbd>⌘K</kbd>
      </button>
    )
  return (
    <div className="pointer-events-auto absolute inset-x-0 top-24 z-20 mx-auto w-[34rem] max-w-[90vw]">
      <div className="glass rise overflow-hidden" style={{ animationDuration: '0.35s' }}>
        <div className="flex items-center gap-3 px-4">
          <Glyph.search className="text-ivory/50" />
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
            className="placeholder:text-ivory/30 caret-amber w-full bg-transparent py-3.5 font-mono text-[13.5px] outline-none"
          />
          <kbd>esc</kbd>
        </div>
        {results.length > 0 && (
          <ul className="hairline max-h-80 overflow-auto border-t py-1">
            {results.map((r, i) => (
              <li key={r.id}>
                <button
                  className={`hover:bg-ivory/[0.05] flex w-full items-center justify-between px-4 py-2 text-left font-mono text-[12.5px] ${i === 0 ? 'text-ivory' : 'text-ivory/75'}`}
                  onClick={() => {
                    select(r.id, true)
                    setOpen(false)
                  }}
                >
                  <span className="truncate">{r.path}</span>
                  {i === 0 && <kbd>↵</kbd>}
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
