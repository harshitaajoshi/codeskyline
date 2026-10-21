import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useStore } from '../store'
import { height } from '../city/scales'
import { linesAt, type TimelineData } from '../city/timeline'
import type { City } from '../city/types'

const SEGMENTS = 14
const AMBER = new THREE.Color('#f2b36b')

/**
 * Temporal coupling as bridges: an arc between the rooftops of two files that
 * keep changing in the same commits. With nothing selected the strongest
 * links glow faintly; select a building and only its links show, bright, so
 * you see its blast radius.
 */
export function Coupling({ city, timeline }: { city: City; timeline: TimelineData }) {
  const show = useStore((s) => s.showCoupling)
  const selected = useStore((s) => s.selected)
  const hideGenerated = useStore((s) => s.hideGenerated)
  const k = useStore((s) => s.k)
  const heightScale = useStore((s) => s.heightScale)

  const links = useMemo(() => {
    const all = city.couplings.filter((c) => {
      const a = city.files[c.a]!
      const b = city.files[c.b]!
      if (hideGenerated && (a.generated || a.vendored || b.generated || b.vendored)) return false
      return true
    })
    if (selected != null) return all.filter((c) => c.a === selected || c.b === selected)
    return all.slice(0, 40)
  }, [city, selected, hideGenerated])

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const n = links.length * SEGMENTS * 2
    const pos = new Float32Array(Math.max(1, n) * 3)
    const col = new Float32Array(Math.max(1, n) * 3)
    const p = new THREE.Vector3()
    let o = 0
    const focused = selected != null
    links.forEach((c) => {
      const a = city.files[c.a]!
      const b = city.files[c.b]!
      const ax = a.x + a.w / 2
      const az = a.z + a.d / 2
      const bx = b.x + b.w / 2
      const bz = b.z + b.d / 2
      const ah = height(linesAt(timeline, c.a, k), heightScale, city.stats.maxLines)
      const bh = height(linesAt(timeline, c.b, k), heightScale, city.stats.maxLines)
      if (ah <= 0.61 && bh <= 0.61) return
      const dist = Math.hypot(bx - ax, bz - az)
      const lift = Math.max(ah, bh) + 2 + dist * 0.22
      // Brightness: confidence drives intensity; bloom catches the focused set.
      const glow = focused ? 1.3 + c.confidence * 1.2 : 0.4 + c.confidence * 0.6
      for (let s = 0; s < SEGMENTS; s++) {
        for (const t of [s / SEGMENTS, (s + 1) / SEGMENTS]) {
          const mt = 1 - t
          // Quadratic bezier through a raised midpoint.
          p.set(mt * mt * ax + 2 * mt * t * ((ax + bx) / 2) + t * t * bx, mt * mt * ah + 2 * mt * t * lift + t * t * bh, mt * mt * az + 2 * mt * t * ((az + bz) / 2) + t * t * bz)
          pos[o * 3] = p.x
          pos[o * 3 + 1] = p.y
          pos[o * 3 + 2] = p.z
          // Fade toward the ends so arcs read as bridges, not wires.
          const fade = 0.55 + 0.45 * Math.sin(Math.PI * t)
          col[o * 3] = AMBER.r * glow * fade
          col[o * 3 + 1] = AMBER.g * glow * fade
          col[o * 3 + 2] = AMBER.b * glow * fade
          o++
        }
      }
    })
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    g.setDrawRange(0, o)
    return g
  }, [links, city, timeline, k, heightScale, selected])
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () => new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }),
    [],
  )

  if (!show || links.length === 0) return null
  return <lineSegments geometry={geometry} material={material} frustumCulled={false} renderOrder={3} />
}

/** Partner ids for a selected file, strongest first. */
export function partnersOf(city: City, id: number): { id: number; support: number; confidence: number }[] {
  return city.couplings
    .filter((c) => c.a === id || c.b === id)
    .map((c) => ({ id: c.a === id ? c.b : c.a, support: c.support, confidence: c.confidence }))
    .sort((x, y) => y.support * y.confidence - x.support * x.confidence)
}
