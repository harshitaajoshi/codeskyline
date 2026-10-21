import { useMemo } from 'react'
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
 * What the analysis found, as an indexed list. Each entry demonstrates
 * itself; this is the front door to every feature.
 */
export function Insights({ city }: { city: City }) {
  const selected = useStore((s) => s.selected)
  const open = useStore((s) => s.insightsOpen)
  const setOpen = useStore((s) => s.setInsightsOpen)
  const insights = useMemo(() => buildInsights(city), [city])

  if (selected != null) return null
  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="rise txt lnk text-ivory/55 hover:text-ivory pointer-events-auto absolute top-[4.5rem] right-6 font-mono text-[10.5px] tracking-[0.16em] uppercase">
        {insights.length} findings
      </button>
    )
  return (
    <section className="region rise pointer-events-auto absolute top-[4.25rem] right-6 max-h-[calc(100vh-13rem)] w-[21rem] overflow-y-auto px-5 pt-3 pb-4 [scrollbar-width:none]" style={{ animationDelay: '0.2s' }}>
      <header className="flex items-center justify-between">
        <span className="label">Findings</span>
        <button className="text-ivory/35 hover:text-ivory transition" onClick={() => setOpen(false)} aria-label="collapse">
          <Glyph.close width={11} height={11} />
        </button>
      </header>
      <ol className="mt-2">
        {insights.map((i, n) => (
          <li key={i.key} className="rule">
            <button onClick={i.run} className="group flex w-full items-start gap-4 py-3.5 text-left">
              <span className="idx mt-[5px] w-7 shrink-0">({String(n + 1).padStart(2, '0')})</span>
              <span className="min-w-0 flex-1">
                <span className={`font-display block text-[15px] leading-[1.25] font-bold ${i.tone === 'fire' ? 'text-fire' : 'text-ivory'}`}>{i.title}</span>
                <span className="text-ivory/50 mt-1 line-clamp-2 text-[11.5px] leading-[1.45]">{i.detail}</span>
                <span className="text-amber/80 group-hover:text-amber mt-1.5 inline-block font-mono text-[10.5px] tracking-[0.14em] uppercase transition">
                  {i.action} <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
                </span>
              </span>
            </button>
          </li>
        ))}
        {insights.length === 0 && <li className="text-ivory/45 py-3 text-[12px]">Nothing stands out in this repository's history.</li>}
      </ol>
    </section>
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
      title: `${burning.length} building${burning.length === 1 ? ' is' : 's are'} on fire`,
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
      title: `Change ${shortName(a.path)}, and ${shortName(b.path)} usually changes too`,
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
      title: `If ${authorName(city, worst.author)} left, ${worst.lost} file${worst.lost === 1 ? '' : 's'} would have no active owner`,
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
      title: `${bus1[0].path} is held by one person`,
      detail: `${bus1.length} district${bus1.length === 1 ? '' : 's'} with bus factor 1. Lose that person and most of it has no active owner.`,
      action: 'Color by owner',
      run: () => s().setMode('owners'),
    })
  }

  const ghosts = alive.filter((f) => f.ghost)
  if (ghosts.length >= Math.max(3, alive.length * 0.05)) {
    out.push({
      key: 'ghost',
      title: `${ghosts.length} files are a ghost town`,
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
      title: `${story.length} moments shaped this city`,
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
      title: `Watch ${years} year${years === 1 ? '' : 's'} of commits build it`,
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
      title: `This change touches ${city.diff.files.length} files`,
      detail: `${city.diff.files.filter((d) => d.status === 'added').length} added, ${city.diff.files.filter((d) => d.status === 'deleted').length} deleted. Hotspots among them are the ones to review first.`,
      action: 'Show the diff',
      run: () => s().setMode('diff'),
    })
  }
  return out
}
