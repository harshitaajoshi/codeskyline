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
  return v
}
