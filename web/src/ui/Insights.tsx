import { useEffect, useMemo } from 'react'
import { useStore } from '../store'
import { activeAuthors, simulateDeparture } from '../city/knowledge'
import { formatNum } from '../city/scales'
import type { City } from '../city/types'
import { Glyph } from './glyphs'

export type Insight = {
  key: string
  tone?: 'fire' | 'amber'
  title: string
  detail: string
  action: string
  run: () => void
}

/**
 * One finding at a time, set as a statement at the top of the screen with
 * the thing that proves it one click away. No box: type on the city.
 */
export function InsightStrip({ city }: { city: City }) {
  const selected = useStore((s) => s.selected)
  const open = useStore((s) => s.insightsOpen)
  const setOpen = useStore((s) => s.setInsightsOpen)
  const index = useStore((s) => s.insightIndex)
  const setIndex = useStore((s) => s.setInsightIndex)
  const insights = useMemo(() => buildInsights(city), [city])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || insights.length === 0) return
      if (e.key === 'ArrowRight') setIndex((index + 1) % insights.length)
      if (e.key === 'ArrowLeft') setIndex((index - 1 + insights.length) % insights.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, insights.length, setIndex])

  if (selected != null || insights.length === 0) return null
  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="txt lnk text-ivory/60 hover:text-ivory pointer-events-auto absolute top-6 left-1/2 -translate-x-1/2 font-mono text-[11px] tracking-[0.16em] uppercase">
        {insights.length} findings
      </button>
    )
  const i = insights[Math.min(index, insights.length - 1)]!
  return (
    <div className="pointer-events-none absolute top-6 left-1/2 w-[46rem] max-w-[calc(100vw-22rem)] -translate-x-1/2 text-center">
      <div key={i.key} className="rise txt" style={{ animationDuration: '0.5s' }}>
        <div className="text-ivory/45 font-mono text-[10.5px] tracking-[0.18em] uppercase">
          finding {String(index + 1).padStart(2, '0')} / {String(insights.length).padStart(2, '0')}
        </div>
        <h2 className="font-display mt-2 text-[27px] leading-[1.15] tracking-[-0.005em] text-balance">{i.title}</h2>
        <p className="text-ivory/60 mx-auto mt-2 max-w-xl text-[12.5px] leading-relaxed text-balance">{i.detail}</p>
        <div className="pointer-events-auto mt-3 flex items-center justify-center gap-6 font-mono text-[11.5px]">
          <button className="text-ivory/50 hover:text-ivory transition" onClick={() => setIndex((index - 1 + insights.length) % insights.length)} aria-label="previous">
            ←
          </button>
          <button onClick={i.run} className={`lnk ${i.tone === 'fire' ? 'text-fire' : 'text-amber'} tracking-[0.12em] uppercase`}>
            {i.action}
          </button>
          <button className="text-ivory/50 hover:text-ivory transition" onClick={() => setIndex((index + 1) % insights.length)} aria-label="next">
            →
          </button>
          <button className="text-ivory/35 hover:text-ivory ml-2 transition" onClick={() => setOpen(false)} aria-label="hide">
            <Glyph.close width={11} height={11} />
          </button>
        </div>
      </div>
    </div>
  )
}

function shortName(path: string) {
  return path.slice(path.lastIndexOf('/') + 1)
}

function authorName(city: City, i: number) {
  const a = city.authors[i]
  return a ? (a.login ? `@${a.login}` : a.name) : 'someone'
}

export function buildInsights(city: City): Insight[] {
  const s = useStore.getState
  const out: Insight[] = []
  const alive = city.files.filter((f) => !f.removed && !f.generated && !f.vendored && !f.binary)

  const burning = alive.filter((f) => f.fire > 0).sort((a, b) => b.fire - a.fire || b.hotspot - a.hotspot)
  if (burning[0]) {
    const top = burning[0]
    out.push({
      key: 'fire',
      tone: 'fire',
      title: `${burning.length} building${burning.length === 1 ? ' is' : 's are'} on fire.`,
      detail: `${top.path} changes the most and is complex: ${formatNum(top.commits)} commits, ${top.bugFixes} bug fixes.`,
      action: 'Fly there',
      run: () => {
        s().setMode('hotspots')
        s().select(top.id, true)
      },
    })
  }

  const c0 = city.couplings[0]
  if (c0) {
    const a = city.files[c0.a]!
    const b = city.files[c0.b]!
    out.push({
      key: 'coupling',
      title: `Change ${shortName(a.path)} and you will probably change ${shortName(b.path)}.`,
      detail: `Edited in the same commit ${c0.support} times, ${Math.round(c0.confidence * 100)}% of the time, with no import between them. ${city.couplings.length} hidden dependencies like this.`,
      action: 'Show what it drags along',
      run: () => {
        s().setShowCoupling(true)
        s().select(c0.a, true)
      },
    })
  }

  const active = [...activeAuthors(city)].filter((i) => !/\[bot\]|dependabot|renovate/i.test(city.authors[i]!.name))
  let worst: { author: number; lost: number; total: number } | null = null
  for (const a of active.slice(0, 40)) {
    const r = simulateDeparture(city, a)
    if (r.lost.size > 0 && (!worst || r.lost.size > worst.lost)) worst = { author: a, lost: r.lost.size, total: r.total }
  }
  if (worst && worst.total > 0) {
    out.push({
      key: 'departure',
      tone: worst.lost / worst.total > 0.2 ? 'fire' : 'amber',
      title: `If ${authorName(city, worst.author)} left, ${worst.lost} file${worst.lost === 1 ? '' : 's'} would have no one who knows ${worst.lost === 1 ? 'it' : 'them'}.`,
      detail: `${Math.round((worst.lost / worst.total) * 100)}% of the live codebase. Owners who have not committed in a year do not count.`,
      action: 'Simulate it',
      run: () => {
        s().setMode('owners')
        s().setSimulateAuthor(worst!.author)
      },
    })
  }

  const bus1 = city.dirs.filter((d) => d.bus === 1 && d.files >= 5 && d.depth > 0).sort((a, b) => b.files - a.files)
  if (bus1[0]) {
    out.push({
      key: 'bus',
      title: `${bus1[0].path} is held by one person.`,
      detail: `${bus1.length} district${bus1.length === 1 ? '' : 's'} with bus factor 1. Lose that person and most of it has no active owner.`,
      action: 'Color by owner',
      run: () => s().setMode('owners'),
    })
  }

  const ghosts = alive.filter((f) => f.ghost)
  if (ghosts.length >= Math.max(3, alive.length * 0.05)) {
    out.push({
      key: 'ghost',
      title: `${ghosts.length} files are a ghost town.`,
      detail: `${Math.round((ghosts.length / alive.length) * 100)}% of the codebase: nobody who wrote them is still active, and nobody has touched them in a year.`,
      action: 'Show them dark',
      run: () => s().setMode('owners'),
    })
  }

  const story = city.timeline.story ?? []
  const big = [...story].sort((a, b) => b.magnitude - a.magnitude)[0]
  if (big) {
    const kf = city.timeline.keyframes[big.k]
    const when = kf ? new Date(kf.time * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short' }) : ''
    out.push({
      key: 'story',
      title: `${story.length} moments shaped this city.`,
      detail: `${when}: ${big.title}. ${big.detail}.`,
      action: 'Jump there',
      run: () => {
        s().setPlaying(false)
        s().setT(big.k)
        s().setPinnedEvent(story.indexOf(big))
      },
    })
  }

  if (city.timeline.keyframes.length > 10) {
    const years = Math.max(1, Math.round((city.repo.lastCommit - city.repo.firstCommit) / (365 * 86400)))
    out.push({
      key: 'play',
      title: `Watch ${years} year${years === 1 ? '' : 's'} of commits build it.`,
      detail: `${formatNum(city.repo.commits)} commits by ${city.authors.length} people, replayed in about twenty seconds.`,
      action: 'Play from the beginning',
      run: () => {
        s().setMode('activity')
        s().setT(0)
        s().setPlaying(true)
      },
    })
  }

  if (city.diff) {
    out.unshift({
      key: 'diff',
      title: `This change touches ${city.diff.files.length} files.`,
      detail: `${city.diff.files.filter((d) => d.status === 'added').length} added, ${city.diff.files.filter((d) => d.status === 'deleted').length} deleted. Hotspots among them are the ones to review first.`,
      action: 'Show the diff',
      run: () => s().setMode('diff'),
    })
  }
  return out
}
