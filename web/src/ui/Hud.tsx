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
import { Wordmark } from './Wordmark'

/**
 * Four regions on a strict grid: a top line, the Lens column on the left,
 * Findings (or the inspector) on the right, the timeline along the bottom.
 * No cards: hairline rules, index numbers, a serif for what matters.
 */
export function Hud({ city, onOpenFile, onHome }: { city: City; onOpenFile: () => void; onHome: () => void }) {
  const walking = useStore((s) => s.walking)
  const filming = useStore((s) => s.filming)
  const setTourStep = useStore((s) => s.setTourStep)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && useStore.getState().filming) {
        useStore.getState().setFilming(false)
        return
      }

      if (e.code !== 'Space' || (e.target as HTMLElement)?.tagName === 'INPUT') return
      const s = useStore.getState()
      if (s.walking) return
      e.preventDefault()
      s.setPlaying(!s.playing)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!shouldShowTour() || new URLSearchParams(location.search).get('tour') === '0') return
    const t = setTimeout(() => setTourStep(0), 1800)
    return () => clearTimeout(t)
  }, [city, setTourStep])

  if (walking) return <WalkHud city={city} />
  if (filming) return <FilmHud city={city} />
  return (
    <div className="text-ivory">
      <div className="scrim-top pointer-events-none absolute inset-x-0 top-0 h-32" />
      <TopLine city={city} onOpenFile={onOpenFile} onHome={onHome} />
      <Lens city={city} />
      <Insights city={city} />
      <Tooltip city={city} />
      <SelectedTag city={city} />
      <Inspector city={city} />
      <Search city={city} />
      <Timeline city={city} />
      <Tour city={city} />
    </div>
  )
}

/** The top line: wordmark, repo, the numbers in a serif, actions as words. */
function TopLine({ city, onOpenFile, onHome }: { city: City; onOpenFile: () => void; onHome: () => void }) {
  const setWalking = useStore((s) => s.setWalking)
  const setTourStep = useStore((s) => s.setTourStep)
  const setFilming = useStore((s) => s.setFilming)
  const requestSnapshot = useStore((s) => s.requestSnapshot)
  const [owner, ...rest] = city.repo.name.split('/')
  return (
    <div className="rise txt pointer-events-none absolute inset-x-6 top-5">
      <div className="flex items-center justify-between">
        <div className="pointer-events-auto">
          <Wordmark size={21} onClick={onHome} />
        </div>
        <div className="pointer-events-auto flex items-center gap-7 font-mono text-[10.5px] tracking-[0.18em] uppercase">
        <button className="lnk text-ivory/60 hover:text-ivory" onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}>
          find
        </button>
        <button className="lnk text-ivory/60 hover:text-ivory" onClick={() => setWalking(true)}>
          walk
        </button>
        <ShareLink city={city} />
        <button className="lnk text-ivory/60 hover:text-ivory" onClick={requestSnapshot} title="save a 2x picture of the city">
          postcard
        </button>
        <button className="lnk text-ivory/60 hover:text-ivory" onClick={() => setFilming(true)} title="a forty second flythrough; esc stops it">
          film
        </button>
        <button className="lnk text-ivory/60 hover:text-ivory" onClick={onOpenFile}>
          open
        </button>
        <button className="lnk text-ivory/60 hover:text-ivory" onClick={() => setTourStep(0)}>
          tour
        </button>
        </div>
      </div>
      <div className="mt-5 flex items-end gap-10">
        <div className="pointer-events-auto font-mono text-[12px]">
          <span className="text-ivory/45">{owner}/</span>
          {rest.join('/') || city.repo.name}
          {city.repo.url && (
            <a className="text-ivory/40 hover:text-ivory ml-1.5 inline-block align-middle transition" href={city.repo.url} target="_blank" rel="noreferrer" title="open on GitHub">
              <Glyph.external width={11} height={11} />
            </a>
          )}
        </div>
        <dl className="hidden items-end gap-9 md:flex">
          <Num v={compact(city.stats.files)} l="files" />
          <Num v={compact(city.stats.lines)} l="lines" />
          <Num v={compact(city.repo.commits)} l="commits" />
          <Num v={String(city.authors.length)} l="authors" />
          {city.stats.burning > 0 && <Num v={String(city.stats.burning)} l="on fire" fire />}
        </dl>
      </div>
    </div>
  )
}

function Num({ v, l, fire }: { v: string; l: string; fire?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <dd className={`font-display text-[20px] leading-none tabular-nums ${fire ? 'text-fire' : ''}`}>{v}</dd>
      <dt className="idx">{l}</dt>
    </div>
  )
}

/** Left region: the lenses as an indexed list, settings beneath. */
function Lens({ city }: { city: City }) {
  const mode = useStore((s) => s.mode)
  const setMode = useStore((s) => s.setMode)
  const heightScale = useStore((s) => s.heightScale)
  const setHeightScale = useStore((s) => s.setHeightScale)
  const hideGenerated = useStore((s) => s.hideGenerated)
  const rain = useStore((s) => s.rain)
  const setRain = useStore((s) => s.setRain)
  const toggleGenerated = useStore((s) => s.toggleGenerated)
  const showCoupling = useStore((s) => s.showCoupling)
  const setShowCoupling = useStore((s) => s.setShowCoupling)
  const modes = MODES.filter((m) => m.id !== 'diff' || city.diff)
  return (
    <section className="region rise pointer-events-auto absolute top-[6.75rem] left-6 max-h-[calc(100vh-18.5rem)] w-[15.5rem] overflow-y-auto px-5 pt-3 pb-4 [scrollbar-width:none]" style={{ animationDelay: '0.1s' }}>
      <div className="label">Lens</div>
      <ol className="mt-2">
        {modes.map((m, n) => {
          const G = MODE_GLYPH[m.id]
          const active = mode === m.id
          return (
            <li key={m.id}>
              <button onClick={() => setMode(m.id)} className="group flex w-full items-center gap-3 py-[7px] text-left">
                <span className="idx w-7">({String(n + 1).padStart(2, '0')})</span>
                <span className={`transition-colors ${active ? 'text-amber' : 'text-ivory/40 group-hover:text-ivory/70'}`}>
                  <G width={14} height={14} />
                </span>
                <span className={`text-[13px] transition-colors ${active ? 'text-ivory' : 'text-ivory/65 group-hover:text-ivory'}`}>{m.label}</span>
                <span className={`bg-amber ml-auto h-px transition-all duration-300 ${active ? 'w-4' : 'w-0'}`} />
              </button>
            </li>
          )
        })}
      </ol>
      <p className="text-ivory/45 mt-1 text-[11.5px] leading-snug">{modes.find((m) => m.id === mode)?.hint}</p>
      <div className="rule mt-4 pt-3">
        <Legend city={city} mode={mode} />
      </div>
      <div className="rule text-ivory/50 mt-4 space-y-2 pt-3 font-mono text-[10.5px] tracking-[0.06em]">
        <label className="flex items-center justify-between">
          height
          <select className="text-ivory/85 cursor-pointer bg-transparent outline-none" value={heightScale} onChange={(e) => setHeightScale(e.target.value as never)}>
            <option value="sqrt">√ lines</option>
            <option value="log">log lines</option>
            <option value="linear">lines</option>
          </select>
        </label>
        <label className="flex cursor-pointer items-center justify-between" title="lockfiles, vendored and generated code">
          hide generated
          <input type="checkbox" className="accent-amber" checked={hideGenerated} onChange={toggleGenerated} />
        </label>
        {city.couplings.length > 0 && (
          <label className="flex cursor-pointer items-center justify-between" title="hover or select a building to see files that change with it">
            bridges on hover
            <input type="checkbox" className="accent-amber" checked={showCoupling} onChange={(e) => setShowCoupling(e.target.checked)} />
          </label>
        )}
        <label className="flex cursor-pointer items-center justify-between" title="weather">
          rain
          <input type="checkbox" className="accent-amber" checked={rain} onChange={(e) => setRain(e.target.checked)} />
        </label>
      </div>
    </section>
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
        <div className="text-ivory/60 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10.5px]">
          {['calm', 'smoke', 'flames', 'inferno'].map((l, i) => (
            <span key={l} className="flex items-center gap-1.5">
              <i className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: rgb(FIRE[i]!) }} /> {l}
            </span>
          ))}
        </div>
      )
    case 'language':
      return (
        <div className="text-ivory/60 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10.5px]">
          {langs.map(([l, n]) => (
            <span key={l} className="truncate">
              {l} <span className="text-ivory/30">{compact(n)}</span>
            </span>
          ))}
        </div>
      )
    case 'diff':
      return (
        <div className="text-ivory/60 font-mono text-[10.5px]">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span className="flex items-center gap-1.5">
              <i className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: '#5fd38d' }} /> added
            </span>
            <span className="flex items-center gap-1.5">
              <i className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: '#b89a5e' }} /> modified
            </span>
            <span className="flex items-center gap-1.5">
              <i className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: '#ff5c5c' }} /> deleted
            </span>
          </div>
          {city.diff && (
            <div className="text-ivory/35 mt-1.5">
              {city.diff.files.length} files · {city.diff.base.slice(0, 7)} → {city.diff.head.slice(0, 7)}
            </div>
          )}
        </div>
      )
    case 'owners':
      return <OwnersLegend city={city} top={top} />
  }
}

function Bar({ from, to, css }: { from: string; to: string; css: string }) {
  return (
    <div className="text-ivory/50 flex items-center gap-2 font-mono text-[10.5px]">
      <span>{from}</span>
      <i className="inline-block h-px flex-1" style={{ background: css }} />
      <span>{to}</span>
    </div>
  )
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
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {top.map((a) => (
          <button
            key={a.i}
            onClick={() => setSim(sim === a.i ? null : a.i)}
            className={`flex items-center gap-1.5 truncate text-left transition ${sim === a.i ? 'text-ivory' : 'text-ivory/60 hover:text-ivory'}`}
            title="simulate this person leaving"
          >
            <i className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: ownerCss(a.i, city) }} />
            <span className="truncate">{a.login ? `@${a.login}` : a.name}</span>
          </button>
        ))}
        <span className="text-ivory/40 flex items-center gap-1.5 truncate">
          <i className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: '#2b3040' }} />
          ghost town
        </span>
      </div>
      {impact ? (
        <div className="rule mt-3 pt-3">
          <div className="label">if {name(impact.author)} left</div>
          <div className="mt-1.5 text-[13px]">
            <span className="font-display text-fire text-[22px] leading-none">{impact.lost.size}</span>
            <span className="text-ivory/60"> of {impact.total} files ({impact.total ? Math.round((impact.lost.size / impact.total) * 100) : 0}%) would have no active owner</span>
          </div>
          {impact.districts.length > 0 && (
            <ul className="text-ivory/55 mt-2 space-y-0.5 font-mono text-[10.5px]">
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
          <button onClick={() => setSim(null)} className="lnk text-ivory/45 hover:text-ivory mt-2 font-mono text-[10.5px] tracking-[0.14em] uppercase">
            clear
          </button>
        </div>
      ) : (
        <div className="text-ivory/35 mt-2 font-mono text-[10.5px]">click a person to simulate them leaving</div>
      )}
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
    <div className="txt pointer-events-none absolute z-10" style={{ left: pointer.x + 18, top: pointer.y + 14, maxWidth: '20rem' }}>
      <div className="font-mono text-[12.5px]">{name}</div>
      {dir && <div className="text-ivory/45 truncate font-mono text-[10.5px]">{dir}/</div>}
      <div className="text-ivory/60 mt-0.5 font-mono text-[10.5px]">
        {f.removed ? 'demolished' : `${formatNum(f.lines)} lines`} · {formatNum(f.commits)} commits
        {f.fire > 0 && <span className="text-fire"> · {['', 'smoke', 'flames', 'inferno'][f.fire]}</span>}
      </div>
    </div>
  )
}

/** Name above the selected building, with a leader line. */
function SelectedTag({ city }: { city: City }) {
  const selected = useStore((s) => s.selected)
  const m = useStore((s) => s.markerScreen)
  if (selected == null || !m.visible) return null
  const f = city.files[selected]
  if (!f) return null
  const name = f.path.slice(f.path.lastIndexOf('/') + 1)
  return (
    <div className="txt pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-full flex-col items-center" style={{ left: m.x, top: m.y }}>
      <div className="font-mono text-[12.5px] whitespace-nowrap">{name}</div>
      <span className="bg-amber mt-1.5 h-5 w-px" />
    </div>
  )
}

function ShareLink({ city }: { city: City }) {
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
    <button onClick={() => void share()} className={`lnk ${state === 'copied' ? 'text-amber' : 'text-ivory/60 hover:text-ivory'}`} title="copy a link to this view">
      {state === 'copied' ? 'copied' : state === 'failed' ? 'failed' : 'share'}
    </button>
  )
}

/** Right region when a building is selected: the inspector, same grammar as Findings. */
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
    <section key={selected} className="region rise pointer-events-auto absolute top-[6.75rem] right-6 max-h-[calc(100vh-18.5rem)] w-[21rem] overflow-y-auto px-5 pt-3 pb-4 text-[12.5px] [scrollbar-width:none]" style={{ animationDuration: '0.35s' }}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="label truncate">{dir ? `${dir}/` : 'root'}</div>
          <div className="font-display mt-1 text-[22px] leading-tight break-all">{name}</div>
          <div className="text-ivory/45 mt-1 font-mono text-[10.5px]">
            {f.removed ? `demolished · peaked at ${formatNum(f.maxLines)} lines` : f.lang}
            {f.generated ? ' · generated' : ''}
            {f.vendored ? ' · vendored' : ''}
          </div>
        </div>
        <button className="text-ivory/35 hover:text-ivory mt-0.5 transition" onClick={() => select(null)} aria-label="close">
          <Glyph.close width={11} height={11} />
        </button>
      </header>
      <dl className="rule mt-4 grid grid-cols-3 gap-y-3 pt-3">
        <Row k="lines" v={formatNum(f.lines)} />
        <Row k="commits" v={formatNum(f.commits)} />
        <Row k="complexity" v={formatNum(f.complexity)} />
        <Row k="fixes" v={formatNum(f.bugFixes)} />
        <Row k="created" v={formatISO(f.created)} />
        <Row k="touched" v={formatISO(f.lastTouched)} />
      </dl>
      {(f.fire > 0 || f.ghost || (d && d.files >= 3)) && (
        <div className="rule mt-3 space-y-1.5 pt-3 text-[12px]">
          {f.fire > 0 && (
            <div className="text-fire">
              {['', 'Smoking', 'On fire', 'Inferno']![f.fire]}: changes often and is complex <span className="text-fire/60 font-mono text-[11px]">({f.hotspot.toFixed(2)})</span>
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
        <div className="rule mt-3 pt-3">
          <div className="label mb-2">owners</div>
          {f.owners.map((o) => {
            const a = city.authors[o.author]
            if (!a) return null
            return (
              <div key={o.author} className="flex items-center gap-2 py-0.5">
                <i className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: ownerCss(o.author, city) }} />
                <span className="truncate">{a.login ? `@${a.login}` : a.name}</span>
                <span className="text-ivory/45 ml-auto font-mono text-[11px]">{Math.round(o.share * 100)}%</span>
              </div>
            )
          })}
        </div>
      )}
      <CoupledWith city={city} id={selected} />
      {url && (
        <a className="lnk text-ivory/60 hover:text-amber mt-4 inline-block font-mono text-[10.5px] tracking-[0.14em] uppercase" href={url} target="_blank" rel="noreferrer">
          open on GitHub ↗
        </a>
      )}
    </section>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="label">{k}</dt>
      <dd className="mt-0.5 font-mono text-[12.5px] whitespace-nowrap">{v}</dd>
    </div>
  )
}

/** Files that keep changing in the same commits as this one. */
function CoupledWith({ city, id }: { city: City; id: number }) {
  const select = useStore((s) => s.select)
  const partners = useMemo(() => partnersOf(city, id).slice(0, 6), [city, id])
  if (partners.length === 0) return null
  const top = partners[0]!
  const topName = city.files[top.id]!.path.slice(city.files[top.id]!.path.lastIndexOf('/') + 1)
  return (
    <div className="rule mt-3 pt-3">
      <div className="label mb-1">changes together with</div>
      <p className="text-ivory/50 mb-2 text-[11.5px] leading-snug">
        Edit this file and {Math.round(top.confidence * 100)}% of the time {topName} changes in the same commit. Nothing imports it; the history is the only thing
        that knows.
      </p>
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

/** While filming: just the name of the city and how to stop. */
function FilmHud({ city }: { city: City }) {
  const setFilming = useStore((s) => s.setFilming)
  return (
    <div className="text-ivory pointer-events-none absolute inset-0">
      <div className="rise absolute bottom-8 left-8 font-mono text-[11px] tracking-[0.18em] uppercase">
        <span className="text-ivory/85">{city.repo.name}</span>
        <span className="text-ivory/35 ml-4">filming</span>
        <button className="lnk text-ivory/45 hover:text-ivory pointer-events-auto ml-4" onClick={() => setFilming(false)}>
          esc to stop
        </button>
      </div>
    </div>
  )
}

function WalkHud({ city }: { city: City }) {
  const setWalking = useStore((s) => s.setWalking)
  return (
    <div className="text-ivory txt">
      <div className="scrim-top pointer-events-none absolute inset-x-0 top-0 h-24" />
      <div className="pointer-events-none absolute top-6 left-1/2 -translate-x-1/2 text-center font-mono text-[10.5px] tracking-[0.14em] uppercase">
        <div className="text-amber">walking {city.repo.name}</div>
        <div className="text-ivory/50 mt-1">
          <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> move · <kbd>⇧</kbd> run · <kbd>esc</kbd> leave
        </div>
      </div>
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80" />
      <div className="text-ivory/40 pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 font-mono text-[10.5px]">if the mouse is not captured, click the city</div>
      <button onClick={() => setWalking(false)} className="lnk text-ivory/70 hover:text-ivory pointer-events-auto absolute right-6 bottom-6 font-mono text-[10.5px] tracking-[0.14em] uppercase">
        leave walk
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
        if (out.length >= 10) break
      }
    }
    return out
  }, [q, city])

  if (!open) return null
  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-start justify-center bg-[rgb(5_7_13/0.7)] pt-[18vh]" onClick={() => setOpen(false)}>
      <div className="rise w-[36rem] max-w-[90vw]" style={{ animationDuration: '0.3s' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-baseline gap-3 border-b border-ivory/20 pb-3 font-mono text-[18px]">
          <span className="text-ivory/40 select-none">/</span>
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
            placeholder="find a file"
            className="placeholder:text-ivory/25 caret-amber w-full bg-transparent outline-none"
          />
          <kbd>esc</kbd>
        </div>
        {results.length > 0 && (
          <ol className="mt-3">
            {results.map((r, i) => (
              <li key={r.id}>
                <button
                  className={`flex w-full items-center gap-4 py-1.5 text-left font-mono text-[13px] ${i === 0 ? 'text-ivory' : 'text-ivory/60 hover:text-ivory'}`}
                  onClick={() => {
                    select(r.id, true)
                    setOpen(false)
                  }}
                >
                  <span className="idx w-7">({String(i + 1).padStart(2, '0')})</span>
                  <span className="truncate">{r.path}</span>
                  {i === 0 && <kbd className="ml-auto">↵</kbd>}
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

function compact(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}k`
  return String(n)
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
