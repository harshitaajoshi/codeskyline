import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useStore } from '../store'
import { height } from '../city/scales'
import { fireAt, linesAt, type TimelineData } from '../city/timeline'
import type { City } from '../city/types'

const N = 6

/**
 * The biggest fires throw flickering orange light onto their neighbours.
 * A fixed set of point lights (so shaders never recompile) parked at the
 * worst hotspots of the current keyframe; unused ones sit at zero.
 */
export function FireLights({ city, timeline }: { city: City; timeline: TimelineData }) {
  const k = useStore((s) => s.k)
  const heightScale = useStore((s) => s.heightScale)
  const hideGenerated = useStore((s) => s.hideGenerated)
  const refs = useRef<(THREE.PointLight | null)[]>([])

  const spots = useMemo(() => {
    const burning: { fi: number; level: number; hot: number }[] = []
    city.files.forEach((f, fi) => {
      if (hideGenerated && (f.generated || f.vendored)) return
      const level = fireAt(timeline, fi, k)
      if (level > 0) burning.push({ fi, level, hot: f.hotspot })
    })
    burning.sort((a, b) => b.level - a.level || b.hot - a.hot)
    return burning.slice(0, N).map((b) => {
      const f = city.files[b.fi]!
      const h = height(linesAt(timeline, b.fi, k), heightScale, city.stats.maxLines)
      const reach = Math.max(f.w, f.d) * (b.level === 3 ? 9 : b.level === 2 ? 7 : 5)
      return { x: f.x + f.w / 2, y: h + 1.2, z: f.z + f.d / 2, power: b.level * 3.0, reach, phase: b.fi * 0.37 }
    })
  }, [city, timeline, k, heightScale, hideGenerated])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    for (let i = 0; i < N; i++) {
      const l = refs.current[i]
      if (!l) continue
      const s = spots[i]
      if (!s) {
        l.intensity = 0
        continue
      }
      l.position.set(s.x, s.y, s.z)
      l.distance = s.reach
      // Two sines at odd ratios read as a flicker, not a pulse.
      l.intensity = s.power * s.reach * (0.75 + 0.15 * Math.sin(t * 9.1 + s.phase) + 0.1 * Math.sin(t * 23.7 + s.phase * 3.0))
    }
  })

  return (
    <>
      {Array.from({ length: N }, (_, i) => (
        <pointLight
          key={i}
          ref={(l) => {
            refs.current[i] = l
          }}
          color="#ff7a2a"
          intensity={0}
          decay={2}
        />
      ))}
    </>
  )
}
