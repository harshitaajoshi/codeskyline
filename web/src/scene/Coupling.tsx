import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { useStore } from '../store'

type Line2 = React.ComponentRef<typeof Line>
import { height } from '../city/scales'
import { linesAt, type TimelineData } from '../city/timeline'
import type { City } from '../city/types'

const SEGMENTS = 18

/**
 * Temporal coupling as bridges from the focused building to the files that
 * keep changing in the same commits. Nothing is drawn until you hover or
 * select a building; then its bridges appear as glowing dashed ribbons that
 * flow away from it, hugging the rooftops.
 */
export function Coupling({ city, timeline }: { city: City; timeline: TimelineData }) {
  const show = useStore((s) => s.showCoupling)
  const selected = useStore((s) => s.selected)
  const hovered = useStore((s) => s.hovered)
  const hideGenerated = useStore((s) => s.hideGenerated)
  const k = useStore((s) => s.k)
  const heightScale = useStore((s) => s.heightScale)

  const focus = selected ?? hovered
  const strong = selected != null

  const bridges = useMemo(() => {
    if (focus == null) return []
    return city.couplings
      .filter((c) => c.a === focus || c.b === focus)
      .filter((c) => {
        const a = city.files[c.a]!
        const b = city.files[c.b]!
        return !(hideGenerated && (a.generated || a.vendored || b.generated || b.vendored))
      })
      .slice(0, 24)
      .map((c) => {
        const from = city.files[focus]!
        const to = city.files[c.a === focus ? c.b : c.a]!
        const fh = height(linesAt(timeline, from.id, k), heightScale, city.stats.maxLines)
        const th = height(linesAt(timeline, to.id, k), heightScale, city.stats.maxLines)
        const fx = from.x + from.w / 2
        const fz = from.z + from.d / 2
        const tx = to.x + to.w / 2
        const tz = to.z + to.d / 2
        const dist = Math.hypot(tx - fx, tz - fz)
        // Low arc: clears the taller rooftop by a little, rises gently with distance.
        const lift = Math.max(fh, th) + 1.2 + Math.min(10, dist * 0.08)
        const pts: THREE.Vector3[] = []
        for (let s = 0; s <= SEGMENTS; s++) {
          const t = s / SEGMENTS
          const mt = 1 - t
          pts.push(new THREE.Vector3(mt * mt * fx + 2 * mt * t * ((fx + tx) / 2) + t * t * tx, mt * mt * fh + 2 * mt * t * lift + t * t * th, mt * mt * fz + 2 * mt * t * ((fz + tz) / 2) + t * t * tz))
        }
        return { key: `${c.a}-${c.b}`, pts, confidence: c.confidence }
      })
  }, [city, timeline, focus, hideGenerated, k, heightScale])

  if (!show || bridges.length === 0) return null
  return (
    <group>
      {bridges.map((b) => (
        <Bridge key={b.key} points={b.pts} confidence={b.confidence} strong={strong} />
      ))}
    </group>
  )
}

function Bridge({ points, confidence, strong }: { points: THREE.Vector3[]; confidence: number; strong: boolean }) {
  const ref = useRef<Line2>(null)
  useFrame((_, dt) => {
    const m = ref.current?.material as THREE.ShaderMaterial & { dashOffset: number } | undefined
    if (m) m.dashOffset -= dt * 6 // flow away from the focused building
  })
  const color = strong ? '#ffc98a' : '#b58a55'
  return (
    <Line
      ref={ref}
      points={points}
      color={color}
      lineWidth={strong ? 1.6 + confidence * 2.2 : 1.2}
      dashed
      dashSize={1.4}
      gapSize={0.9}
      transparent
      opacity={strong ? 0.95 : 0.55}
      toneMapped={false}
      depthWrite={false}
      renderOrder={3}
    />
  )
}

/** Partner ids for a selected file, strongest first. */
export function partnersOf(city: City, id: number): { id: number; support: number; confidence: number }[] {
  return city.couplings
    .filter((c) => c.a === id || c.b === id)
    .map((c) => ({ id: c.a === id ? c.b : c.a, support: c.support, confidence: c.confidence }))
    .sort((x, y) => y.support * y.confidence - x.support * x.confidence)
}
