import { useMemo } from 'react'
import { useStore } from '../store'
import { activeAuthors, simulateDeparture } from '../city/knowledge'
import { formatNum } from '../city/scales'
import type { City } from '../city/types'
import { Glyph } from './glyphs'

type Insight = {
  key: string
  Icon: (p: React.SVGProps<SVGSVGElement>) => React.JSX.Element
  tone?: 'fire' | 'amber'
  title: string
  detail: string
  action: string
  run: () => void
}

/**
 * What the analysis found, as sentences you can click. This is the front
 * door to every feature: each row demonstrates itself.
 */
export function Insights({ city }: { city: City }) {
  const selected = useStore((s) => s.selected)
  const open = useStore((s) => s.insightsOpen)
  const setOpen = useStore((s) => s.setInsightsOpen)
  const insights = useMemo(() => buildInsights(city), [city])

  if (selected != null) return null
  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="glass btn rise pointer-events-auto absolute top-[68px] right-4 h-10 rounded-full pr-4">
        <Glyph.hotspots /> <span className="label">insights</span>
      </button>
    )
  return (
    <div className="glass rise pointer-events-auto absolute top-[68px] right-4 max-h-[calc(100vh-14rem)] w-[21rem] overflow-y-auto" style={{ animationDelay: '0.15s' }}>
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="label">What the history says</span>
        <button className="text-ivory/40 hover:text-ivory transition" onClick={() => setOpen(false)} aria-label="collapse">
          <Glyph.chevron width={12} height={12} />
        </button>
      </div>
      <ul className="px-2 pb-2">
        {insights.map((i) => (
          <li key={i.key}>
            <button onClick={i.run} className="group flex w-full items-start gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors hover:bg-ivory/[0.05]">
              <span className={`mt-0.5 shrink-0 ${i.tone === 'fire' ? 'text-fire' : 'text-amber'}`}>
                <i.Icon />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] leading-5">{i.title}</span>
                <span className="text-ivory/50 block text-[11.5px] leading-4">{i.detail}</span>
                <span className="text-amber/80 group-hover:text-amber mt-1 block font-mono text-[10.5px]">{i.action} →</span>
              </span>
            </button>
          </li>
        ))}
        {insights.length === 0 && <li className="text-ivory/45 px-3 py-3 text-[12px]">Nothing stands out in this repository's history.</li>}
      </ul>
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

function buildInsights(city: City): Insight[] {
  const s = useStore.getState
  const out: Insight[] = []
  const alive = city.files.filter((f) => !f.removed && !f.generated && !f.vendored && !f.binary)

  // 1. Fire.
  const burning = alive.filter((f) => f.fire > 0).sort((a, b) => b.fire - a.fire || b.hotspot - a.hotspot)
  if (burning[0]) {
    const top = burning[0]
    out.push({
      key: 'fire',
      Icon: Glyph.hotspots,
      tone: 'fire',
      title: `${burning.length} building${burning.length === 1 ? ' is' : 's are'} on fire`,
      detail: `${top.path} changes most and is complex: ${formatNum(top.commits)} commits, ${top.bugFixes} bug fixes`,
      action: 'fly to the hottest',
      run: () => {
        s().setMode('hotspots')
        s().select(top.id, true)
      },
    })
  }

  // 2. Coupling.
  const c0 = city.couplings[0]
  if (c0) {
    const a = city.files[c0.a]!
    const b = city.files[c0.b]!
    out.push({
      key: 'coupling',
      Icon: Glyph.churn,
      title: `${shortName(a.path)} and ${shortName(b.path)} always change together`,
      detail: `${c0.support} shared commits, ${Math.round(c0.confidence * 100)}% of the time, with no import between them. ${city.couplings.length} such pairs in total.`,
      action: 'show the bridges',
      run: () => {
        s().setShowCoupling(true)
        s().select(c0.a, true)
      },
    })
  }

  // 3. Knowledge risk: the active person whose departure would hurt most.
  const active = [...activeAuthors(city)].filter((i) => !/\[bot\]|dependabot|renovate/i.test(city.authors[i]!.name))
  let worst: { author: number; lost: number; total: number } | null = null
  for (const a of active.slice(0, 40)) {
    const r = simulateDeparture(city, a)
    if (r.lost.size > 0 && (!worst || r.lost.size > worst.lost)) worst = { author: a, lost: r.lost.size, total: r.total }
  }
  if (worst && worst.total > 0) {
    out.push({
      key: 'departure',
      Icon: Glyph.owners,
      tone: worst.lost / worst.total > 0.2 ? 'fire' : 'amber',
      title: `If ${authorName(city, worst.author)} left, ${worst.lost} file${worst.lost === 1 ? '' : 's'} would have no active owner`,
      detail: `${Math.round((worst.lost / worst.total) * 100)}% of the live codebase. Knowledge decays: owners who have not committed in a year do not count.`,
      action: 'simulate it',
      run: () => {
        s().setMode('owners')
        s().setSimulateAuthor(worst!.author)
      },
    })
  }

  // 4. Bus factor one.
  const bus1 = city.dirs.filter((d) => d.bus === 1 && d.files >= 5 && d.depth > 0).sort((a, b) => b.files - a.files)
  if (bus1[0]) {
    out.push({
      key: 'bus',
      Icon: Glyph.owners,
      title: `${bus1[0].path} is held by one person`,
      detail: `${bus1.length} district${bus1.length === 1 ? '' : 's'} with bus factor 1. Lose that person and most of the district has no active owner.`,
      action: 'color by owner',
      run: () => s().setMode('owners'),
    })
  }

  // 5. Ghost town.
  const ghosts = alive.filter((f) => f.ghost)
  if (ghosts.length >= Math.max(3, alive.length * 0.05)) {
    out.push({
      key: 'ghost',
      Icon: Glyph.age,
      title: `${ghosts.length} files are a ghost town`,
      detail: `${Math.round((ghosts.length / alive.length) * 100)}% of the codebase: nobody who wrote them is still active, and nobody has touched them in a year.`,
      action: 'show them dark',
      run: () => s().setMode('owners'),
    })
  }

  // 6. Story.
  const story = city.timeline.story ?? []
  const big = [...story].sort((a, b) => b.magnitude - a.magnitude)[0]
  if (big) {
    const kf = city.timeline.keyframes[big.k]
    const when = kf ? new Date(kf.time * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short' }) : ''
    out.push({
      key: 'story',
      Icon: Glyph.play,
      title: `${story.length} moments shaped this city`,
      detail: `${when}: ${big.title}. ${big.detail}.`,
      action: 'jump there',
      run: () => {
        s().setPlaying(false)
        s().setT(big.k)
        s().setPinnedEvent(story.indexOf(big))
      },
    })
  }

  // 7. Time travel.
  if (city.timeline.keyframes.length > 10) {
    const years = Math.max(1, Math.round((city.repo.lastCommit - city.repo.firstCommit) / (365 * 86400)))
    out.push({
      key: 'play',
      Icon: Glyph.play,
      title: `Watch ${years} year${years === 1 ? '' : 's'} of commits build it`,
      detail: `${formatNum(city.repo.commits)} commits by ${city.authors.length} people, replayed in about 20 seconds.`,
      action: 'play from the beginning',
      run: () => {
        s().setMode('activity')
        s().setT(0)
        s().setPlaying(true)
      },
    })
  }

  // 8. Diff.
  if (city.diff) {
    out.unshift({
      key: 'diff',
      Icon: Glyph.churn,
      title: `This change touches ${city.diff.files.length} files`,
      detail: `${city.diff.files.filter((d) => d.status === 'added').length} added, ${city.diff.files.filter((d) => d.status === 'deleted').length} deleted. Hotspots among them are the ones to review first.`,
      action: 'show the diff',
      run: () => s().setMode('diff'),
    })
  }
  return out
}
