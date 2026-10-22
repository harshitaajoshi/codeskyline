import { useEffect } from 'react'
import { useStore } from '../store'
import type { City } from '../city/types'

const KEY = 'csky.tour.v1'

interface Step {
  title: string
  body: string
  place: string // tailwind positioning classes
  mode?: 'churn' | 'hotspots' | 'owners'
  play?: boolean
}

const STEPS: Step[] = [
  {
    title: 'This repository is a city',
    body: 'Every file is a building; taller means more lines of code. Folders are the districts, and the streets between them follow the directory tree.',
    place: 'left-1/2 top-36 -translate-x-1/2',
  },
  {
    title: 'The buildings on fire are hotspots',
    body: 'They change often and are complex, which is where bugs tend to be fixed. Click any building to see who owns it and how it has changed.',
    place: 'left-1/2 top-36 -translate-x-1/2',
    mode: 'hotspots',
  },
  {
    title: 'The amber bridges are hidden dependencies',
    body: 'Two buildings are bridged when they keep changing in the same commits, even if nothing imports one from the other. Click a building to see everything it drags along.',
    place: 'left-1/2 top-36 -translate-x-1/2',
    mode: 'churn',
  },
  {
    title: 'Change the lens',
    body: 'Recolor the whole city by churn, by who maintains each file, by language, or by age. In Owners, click a person to simulate them leaving and watch what goes dark.',
    place: 'left-[18rem] top-[7rem]',
    mode: 'owners',
  },
  {
    title: 'Travel through time',
    body: 'Press space, or drag the slider, to watch the city grow commit by commit. The diamonds on the track are the moments that shaped it: rewrites, demolitions, people arriving and leaving.',
    place: 'left-1/2 bottom-56 -translate-x-1/2',
    mode: 'churn',
    play: true,
  },
  {
    title: 'Start from the insights',
    body: 'The panel on the right says what the history found, in plain sentences. Each one is a button that shows it. Drag to orbit, scroll to zoom, ⌘K to find a file, Walk to stroll the streets. Press ? for all the keys.',
    place: 'right-[23rem] top-[7rem]',
  },
]

/** The tour opens the first time this browser sees a city; `?tour=0` suppresses it, "tour" replays it. */
export function shouldShowTour(): boolean {
  try {
    return localStorage.getItem(KEY) !== '1'
  } catch {
    return true
  }
}

export function Tour({ city: _city }: { city: City }) {
  const step = useStore((s) => s.tourStep)
  const setStep = useStore((s) => s.setTourStep)
  const setMode = useStore((s) => s.setMode)
  const setPlaying = useStore((s) => s.setPlaying)
  const goLive = useStore((s) => s.goLive)

  useEffect(() => {
    if (step == null) return
    const s = STEPS[step]
    if (!s) return
    if (s.mode) setMode(s.mode)
    if (s.play) setPlaying(true)
    return () => {
      if (s.play) {
        setPlaying(false)
        goLive()
      }
    }
  }, [step, setMode, setPlaying, goLive])

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
