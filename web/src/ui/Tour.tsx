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
    place: 'left-1/2 top-24 -translate-x-1/2',
  },
  {
    title: 'The buildings on fire are hotspots',
    body: 'They change often and are complex, which is where bugs tend to be fixed. Click any building to see who owns it and how it has changed.',
    place: 'left-1/2 top-24 -translate-x-1/2',
    mode: 'hotspots',
  },
  {
    title: 'The amber bridges are hidden dependencies',
    body: 'Two buildings are bridged when they keep changing in the same commits, even if nothing imports one from the other. Click a building to see everything it drags along.',
    place: 'left-1/2 top-24 -translate-x-1/2',
    mode: 'churn',
  },
  {
    title: 'Change the lens',
    body: 'The list in the top-right recolors the city: churn, activity, hotspots, owners, language, age. In Owners, click a person above the timeline to simulate them leaving.',
    place: 'right-40 top-24',
    mode: 'owners',
  },
  {
    title: 'Travel through time',
    body: 'Press space, or drag the line along the bottom, to watch the city grow commit by commit. The diamonds on it are the moments that shaped it: rewrites, demolitions, people arriving and leaving.',
    place: 'left-[4.6rem] bottom-40',
    mode: 'churn',
    play: true,
  },
  {
    title: 'Start from the findings',
    body: 'The statement at the top is what the history found, one at a time, with the proof one click away. Arrow keys move between them. Drag to orbit, scroll to zoom, ⌘K finds a file, walk strolls the streets.',
    place: 'left-1/2 top-44 -translate-x-1/2',
  },
]

export function shouldShowTour(): boolean {
  try {
    return !localStorage.getItem(KEY)
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
    <div key={step} className={`rise txt text-ivory border-amber pointer-events-auto absolute z-20 w-[24rem] max-w-[90vw] border-l pl-5 ${s.place}`} style={{ animationDuration: '0.5s' }}>
      <div className="label">
        {String(step + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')}
      </div>
      <div className="font-display mt-2 text-[24px] leading-tight">{s.title}</div>
      <p className="text-ivory/65 mt-2 text-[13.5px] leading-relaxed">{s.body}</p>
      <div className="mt-4 flex items-center gap-6 font-mono text-[11px] tracking-[0.12em] uppercase">
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
