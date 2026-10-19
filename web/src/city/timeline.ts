import type { City } from './types'

/**
 * Keyframe data unpacked into dense, texture-ready arrays.
 *
 * Texel index for (file f, keyframe k) is f*K + k, laid out row-major in a
 * texture of width texW. The GPU samples these directly; the CPU keeps them
 * for picking, flames and the inspector.
 */
export interface TimelineData {
  K: number
  F: number
  texW: number
  texH: number
  /** lines at (f,k) */
  lines: Float32Array
  /** RGBA per (f,k): activity 0..255, owner palette slot (255 = none), fire 0..3, churn 0..255 (log-scaled cumulative commits) */
  meta: Uint8Array
  /** first keyframe at which each file exists, or -1 */
  born: Int32Array
  /** activity value at the 95th percentile of non-zero activity, for color scaling */
  activityScale: number
}

export const TEX_W = 4096

export function buildTimeline(city: City, ownerSlot: (author: number) => number): TimelineData {
  const K = Math.max(1, city.timeline.keyframes.length)
  const F = city.files.length
  const texW = Math.min(TEX_W, Math.max(1, F * K))
  const texH = Math.max(1, Math.ceil((F * K) / texW))
  const lines = new Float32Array(texW * texH)
  const meta = new Uint8Array(texW * texH * 4)
  const born = new Int32Array(F).fill(-1)
  const ev = city.timeline.events

  // First pass: max cumulative commits for the churn scale, activity samples.
  let maxCommits = 1
  const acts: number[] = []
  {
    let cur = -1
    let cum = 0
    for (let i = 0; i < ev.length; i += 6) {
      const f = ev[i]!
      if (f !== cur) {
        cur = f
        cum = 0
      }
      cum += ev[i + 3]!
      if (cum > maxCommits) maxCommits = cum
      if (ev[i + 3]! > 0) acts.push(ev[i + 3]!)
    }
  }
  acts.sort((a, b) => a - b)
  const activityScale = Math.max(1, acts[Math.floor(acts.length * 0.95)] ?? 1)
  const logMax = Math.log1p(maxCommits)

  // Second pass: fill each file's run between consecutive events.
  const fill = (f: number, k0: number, k1: number, l: number, act: number, owner: number, fire: number, cum: number) => {
    const churn = Math.round((255 * Math.log1p(cum)) / logMax)
    const slot = owner < 0 ? 255 : Math.min(255, ownerSlot(owner))
    for (let k = k0; k < k1; k++) {
      const idx = f * K + k
      lines[idx] = l
      const o = idx * 4
      meta[o] = k === k0 ? act : 0 // activity is a pulse at the keyframe it happened
      meta[o + 1] = slot
      meta[o + 2] = fire
      meta[o + 3] = churn
    }
  }
  for (let i = 0; i < ev.length; ) {
    const f = ev[i]!
    let cum = 0
    if (born[f] === -1) born[f] = ev[i + 1]!
    let j = i
    while (j < ev.length && ev[j] === f) {
      const k = ev[j + 1]!
      const next = j + 6 < ev.length && ev[j + 6] === f ? ev[j + 7]! : K
      cum += ev[j + 3]!
      fill(f, k, next, ev[j + 2]!, ev[j + 3]!, ev[j + 4]!, ev[j + 5]!, cum)
      j += 6
    }
    i = j
  }
  return { K, F, texW, texH, lines, meta, born, activityScale }
}

export function linesAt(t: TimelineData, f: number, k: number): number {
  return t.lines[f * t.K + Math.min(t.K - 1, Math.max(0, k))] ?? 0
}

export function fireAt(t: TimelineData, f: number, k: number): number {
  return t.meta[(f * t.K + Math.min(t.K - 1, Math.max(0, k))) * 4 + 2] ?? 0
}

/** Interpolated wall-clock time for a fractional keyframe position. */
export function timeAt(city: City, t: number): number {
  const kf = city.timeline.keyframes
  if (kf.length === 0) return city.repo.lastCommit
  const k0 = Math.floor(t)
  const k1 = Math.min(kf.length - 1, k0 + 1)
  const a = kf[Math.max(0, Math.min(kf.length - 1, k0))]!.time
  const b = kf[k1]!.time
  return a + (b - a) * (t - k0)
}
