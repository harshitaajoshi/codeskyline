/**
 * "Your cities": the repositories this browser has built or opened. Kept in
 * localStorage, never sent anywhere; the front page lists them so a visitor
 * can find their way back without an account.
 */
export interface MyCity {
  owner: string
  name: string
  sha: string
  /** When this browser last opened it. */
  at: number
}

const KEY = 'csky.cities.v1'
const MAX = 24

export function listCities(): MyCity[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as MyCity[]
    return Array.isArray(v) ? v.filter((c) => c && c.owner && c.name) : []
  } catch {
    return []
  }
}

export function rememberCity(owner: string, name: string, sha: string): void {
  try {
    const rest = listCities().filter((c) => !(c.owner === owner && c.name === name))
    localStorage.setItem(KEY, JSON.stringify([{ owner, name, sha, at: Date.now() }, ...rest].slice(0, MAX)))
  } catch {
    /* private mode */
  }
}

export function forgetCity(owner: string, name: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(listCities().filter((c) => !(c.owner === owner && c.name === name))))
  } catch {
    /* private mode */
  }
}

/** "today", "3d ago", "2w ago". */
export function ago(t: number, now = Date.now()): string {
  const d = Math.max(0, Math.floor((now - t) / 86400000))
  if (d === 0) return 'today'
  if (d < 14) return `${d}d ago`
  if (d < 60) return `${Math.floor(d / 7)}w ago`
  return `${Math.floor(d / 30)}mo ago`
}
