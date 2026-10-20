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
    body: 'Every file is a building — taller means more lines of code. Folders are the districts, and the streets between them follow the directory tree.',
    place: 'left-1/2 top-24 -translate-x-1/2',
  },
  {
    title: 'The buildings on fire are hotspots',
    body: 'They change often and are complex, which is where bugs tend to be fixed. Click any building to see who owns it and how it has changed.',
    place: 'left-1/2 top-24 -translate-x-1/2',
    mode: 'hotspots',
  },
  {
    title: 'Change the lens',
    body: 'Recolor the whole city by churn, by who maintains each file, by language, or by age. Each lens explains itself.',
    place: 'left-72 top-28',
    mode: 'owners',
  },
  {
    title: 'Travel through time',
    body: 'Press space, or drag the slider, to watch the city grow commit by commit — buildings rise, get demolished, and catch fire.',
    place: 'left-1/2 bottom-28 -translate-x-1/2',
    mode: 'churn',
    play: true,
  },
  {
    title: 'Get around',
    body: 'Drag to orbit, scroll to zoom. ⌘K jumps to a file. Try 🚶 Walk to stroll the streets in first person (WASD, Esc to leave).',
    place: 'left-1/2 top-24 -translate-x-1/2',
  },
]

export function shouldShowTour(): boolean {
  try {
    return !localStorage.getItem(KEY)
  } catch {
    return true
  }
}

export function Tour({ city }: { city: City }) {
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
    <div className={`panel pointer-events-auto absolute z-20 w-[22rem] max-w-[90vw] p-4 shadow-2xl ${s.place}`}>
      <div className="text-muted mb-1 text-[11px] font-medium tracking-wide uppercase">
        {step + 1} / {STEPS.length} · {city.repo.name}
      </div>
      <div className="text-base font-semibold">{s.title}</div>
      <p className="text-muted mt-1.5 text-sm leading-relaxed">{s.body}</p>
      <div className="mt-3 flex items-center justify-between">
        <button className="text-muted text-xs hover:text-ink" onClick={finish}>
          Skip tour
        </button>
        <div className="flex gap-2">
          {step > 0 && (
            <button className="text-muted rounded-md px-3 py-1.5 text-sm hover:text-ink" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          <button
            className="bg-accent/20 text-accent hover:bg-accent/30 rounded-md px-3 py-1.5 text-sm font-medium"
            onClick={() => (step + 1 < STEPS.length ? setStep(step + 1) : finish())}
          >
            {step + 1 < STEPS.length ? 'Next' : 'Explore'}
          </button>
        </div>
      </div>
    </div>
  )
}
