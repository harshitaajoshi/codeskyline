import { isCity, type City } from './types'

export const SAMPLES: { id: string; label: string }[] = [
  { id: 'expressjs__express', label: 'expressjs/express' },
]

export async function loadSample(id: string): Promise<City> {
  const res = await fetch(`/samples/${id}.city.json`)
  if (!res.ok) throw new Error(`sample ${id}: ${res.status}`)
  return parseCity(await res.text())
}

export async function loadFile(file: globalThis.File): Promise<City> {
  return parseCity(await file.text())
}

export function parseCity(text: string): City {
  const v: unknown = JSON.parse(text)
  if (!isCity(v)) throw new Error('not a CodeSkyline city document')
  return normalizeCity(v)
}

/**
 * Cities analyzed by older versions of csky lack newer fields. Fill them so
 * the viewer never has to check; the format version stays 1 because nothing
 * existing changed meaning.
 */
export function normalizeCity(c: City): City {
  c.couplings ??= []
  c.timeline ??= { keyframes: [], events: [], story: [] }
  c.timeline.story ??= []
  c.timeline.events ??= []
  c.timeline.keyframes ??= []
  c.stats.removed ??= 0
  for (const d of c.dirs) d.bus ??= 0
  for (const f of c.files) {
    f.maxLines ??= f.lines
    f.owners ??= []
  }
  return c
}
