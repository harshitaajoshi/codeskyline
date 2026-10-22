import { useEffect } from 'react'
import { useStore } from '../store'
import { storyTargets, type StoryTargets } from '../story'
import type { City } from '../city/types'

const KEY = 'csky.tour.v1'

interface Step {
  title: string
  body: string
  place: string // tailwind positioning classes
  /** Which side panels stay visible; the rest step aside so the city is the show. */
  show?: ('lens' | 'insights' | 'inspector')[]
  /** Drives the city: lens, selection, camera, playback. */
  act: (city: City, t: StoryTargets) => void
}

const STEPS: Step[] = [
  {
    title: 'This repository is a city',
    body: 'Every file is a building; taller means more lines of code. Folders are the districts, and the streets between them follow the directory tree.',
    place: 'left-6 top-[7rem]',
    act: () => {
      const s = useStore.getState()
      s.setMode('churn')
      s.select(null)
      s.flyWide()
    },
  },
  {
    title: 'The buildings on fire are hotspots',
    body: 'They change often and are complex, which is where bugs tend to be fixed. Click any building to see who owns it and how it has changed.',
    place: 'left-6 top-[7rem]',
    act: (_, t) => {
      const s = useStore.getState()
      s.setMode('hotspots')
      s.setShowCoupling(false)
      if (t.fire != null) s.select(t.fire, true)
      else s.flyWide()
    },
  },
  {
    title: 'The bridges are hidden dependencies',
    body: 'Two buildings are bridged when they keep changing in the same commits, even if nothing imports one from the other. Click a building to see everything it drags along.',
    place: 'left-6 top-[7rem]',
    act: (_, t) => {
      const s = useStore.getState()
      s.setMode('churn')
      s.setShowCoupling(true)
      if (t.pair) s.select(t.pair.a, true)
      else s.flyWide()
    },
  },
  {
    title: 'Change the lens',
    body: 'Recolor the whole city by churn, by who maintains each file, by language, or by age. In Owners, click a person to simulate them leaving and watch what goes dark.',
    place: 'left-[18rem] top-[7rem]',
    show: ['lens'],
    act: () => {
      const s = useStore.getState()
      s.setMode('owners')
      s.select(null)
      s.flyWide()
    },
  },
  {
    title: 'Travel through time',
    body: 'Press space, or drag the slider, to watch the city grow commit by commit. The diamonds on the track are the moments that shaped it: rewrites, demolitions, people arriving and leaving.',
    place: 'left-6 top-[7rem]',
    act: (city) => {
      const s = useStore.getState()
      s.setMode('activity')
      s.select(null)
      s.flyWide()
      s.setT(0)
      s.setSpeed(Math.max(4, (city.timeline.keyframes.length - 1) / 16))
      s.setPlaying(true)
    },
  },
  {
    title: 'Start from the findings',
    body: 'The panel on the right says what the history found, in plain sentences. Each one is a button that shows it. Drag to orbit, scroll to zoom, ⌘K to find a file, Walk to stroll the streets.',
    place: 'right-[23rem] top-[7rem]',
    show: ['insights', 'lens'],
    act: () => {
      const s = useStore.getState()
      s.setPlaying(false)
      s.goLive()
      s.setSpeed(12)
      s.setMode('churn')
      s.setInsightsOpen(true)
      s.flyWide()
    },
  },
]

/** Which panels the current tour step leaves on screen (all of them when there is no tour). */
export function tourShows(step: number | null, panel: 'lens' | 'insights' | 'inspector'): boolean {
  if (step == null) return true
  return STEPS[step]?.show?.includes(panel) ?? false
}

/** The tour opens with every city; `?tour=0` suppresses it, and skipping is one click. */
export function shouldShowTour(): boolean {
  void KEY
  return true
}

export function Tour({ city }: { city: City }) {
  const step = useStore((s) => s.tourStep)
  const setStep = useStore((s) => s.setTourStep)

  // Each step drives the city; leaving the tour puts it back the way it opened.
  useEffect(() => {
    if (step == null) return
    const s = STEPS[step]
    if (!s) return
    s.act(city, storyTargets(city))
  }, [step, city])
  useEffect(() => {
    if (step != null) return
    const s = useStore.getState()
    if (s.playing) s.setPlaying(false)
    s.setSpeed(12)
    s.setShowCoupling(true)
  }, [step])

  if (step == null) return null
  const s = STEPS[step]
  if (!s) return null
  const finish = () => {
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      /* private mode */
    }
    setStep(null)
  }
  return (
    <div key={step} className={`region rise text-ivory pointer-events-auto absolute z-20 w-[24rem] max-w-[90vw] px-5 pt-3 pb-4 ${s.place}`} style={{ animationDuration: '0.5s' }}>
      <div className="label">
        {String(step + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')}
      </div>
      <div className="font-display mt-2 text-[20px] leading-tight">{s.title}</div>
      <p className="text-ivory/65 mt-2 text-[13px] leading-relaxed">{s.body}</p>
      <div className="mt-4 flex items-center gap-6 font-mono text-[10.5px] tracking-[0.14em] uppercase">
        <button className="lnk text-amber" onClick={() => (step + 1 < STEPS.length ? setStep(step + 1) : finish())}>
          {step + 1 < STEPS.length ? 'next' : 'explore'}
        </button>
        {step > 0 && (
          <button className="lnk text-ivory/55 hover:text-ivory" onClick={() => setStep(step - 1)}>
            back
          </button>
        )}
        <button className="lnk text-ivory/40 hover:text-ivory" onClick={finish}>
          skip
        </button>
      </div>
    </div>
  )
}
