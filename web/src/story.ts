import { create } from 'zustand'
import { worstDeparture, type DepartureImpact } from './city/knowledge'
import type { City } from './city/types'

/**
 * The landing page story: as the reader scrolls, the hero city demonstrates
 * one thing per beat. The page owns the scroll; the camera and the store
 * follow `beat` and `progress`.
 */
export const BEATS = ['hero', 'buildings', 'hotspots', 'bridges', 'time', 'departure'] as const
export type Beat = (typeof BEATS)[number]

interface StoryState {
  beat: number
  /** 0..1 through the current beat's block. */
  progress: number
  set: (beat: number, progress: number) => void
}

export const useStory = create<StoryState>((set) => ({
  beat: 0,
  progress: 0,
  set: (beat, progress) => set((s) => (s.beat === beat && Math.abs(s.progress - progress) < 0.002 ? s : { beat, progress })),
}))

export interface StoryTargets {
  tallest: number | null
  fire: number | null
  burning: number
  pair: { a: number; b: number; support: number; confidence: number } | null
  departure: DepartureImpact | null
  /** Live files nobody active wrote and nobody has touched in a year. */
  ghosts: number
  alive: number
}

const cache = new WeakMap<City, StoryTargets>()

/** The buildings and people each beat points at, chosen once per city. */
export function storyTargets(city: City): StoryTargets {
  let t = cache.get(city)
  if (t) return t
  const alive = city.files.filter((f) => !f.removed && !f.generated && !f.vendored && !f.binary)
  const tallest = alive.reduce<(typeof alive)[number] | null>((best, f) => (!best || f.lines > best.lines ? f : best), null)
  const burning = alive.filter((f) => f.fire > 0).sort((a, b) => b.fire - a.fire || b.hotspot - a.hotspot)
  const c0 = city.couplings[0]
  t = {
    tallest: tallest?.id ?? null,
    fire: burning[0]?.id ?? null,
    burning: burning.length,
    pair: c0 ? { a: c0.a, b: c0.b, support: c0.support, confidence: c0.confidence } : null,
    departure: worstDeparture(city),
    ghosts: alive.filter((f) => f.ghost).length,
    alive: alive.length,
  }
  cache.set(city, t)
  return t
}

export const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
