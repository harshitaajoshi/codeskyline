import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useStore } from '../store'
import { height } from '../city/scales'
import { fireAt, linesAt, type TimelineData } from '../city/timeline'
import type { City } from '../city/types'

const FLAME = new THREE.ConeGeometry(0.5, 1, 6).translate(0, 0.5, 0)

interface Flame {
  x: number
  z: number
  y: number
  size: number
  phase: number
  level: number
}

/**
 * Flames on hotspot rooftops at the current keyframe. Emissive cones with
 * values above 1.0 so the bloom pass picks them up; per-frame flicker is a
 * few scales, not geometry.
 */
export function Fire({ city, timeline }: { city: City; timeline: TimelineData }) {
  const mesh = useRef<THREE.InstancedMesh>(null!)
  const heightScale = useStore((s) => s.heightScale)
  const hideGenerated = useStore((s) => s.hideGenerated)
  const k = useStore((s) => s.k)

  const flames = useMemo<Flame[]>(() => {
    const out: Flame[] = []
    city.files.forEach((f, fi) => {
      if (hideGenerated && (f.generated || f.vendored)) return
      const level = fireAt(timeline, fi, k)
      if (level === 0) return
      const h = height(linesAt(timeline, fi, k), heightScale, city.stats.maxLines)
      const n = level === 3 ? 5 : level === 2 ? 3 : 1
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n
        out.push({
          x: f.x + f.w * (n === 1 ? 0.5 : 0.2 + 0.6 * u),
          z: f.z + f.d * (0.35 + (0.3 * ((i * 7) % 3)) / 2),
          y: h,
          size: Math.min(f.w, f.d) * (level === 3 ? 0.55 : 0.4),
          phase: (fi * 0.618 + i) % (Math.PI * 2),
          level,
        })
      }
    })
    return out
  }, [city, timeline, k, heightScale, hideGenerated])

  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 0.9, 0.2), toneMapped: false, transparent: true, opacity: 0.9 }),
    [],
  )

  const capacity = useMemo(() => Math.max(1, city.files.length * 2), [city])

  useEffect(() => {
    const m = mesh.current
    const color = new THREE.Color()
    flames.forEach((fl, i) => {
      color.setRGB(fl.level === 3 ? 3 : 2.2, fl.level === 3 ? 0.6 : 1.0, 0.15)
      m.setColorAt(i, color)
    })
    m.count = flames.length
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [flames])

  const mat = useMemo(() => new THREE.Matrix4(), [])
  const pos = useMemo(() => new THREE.Vector3(), [])
  const scl = useMemo(() => new THREE.Vector3(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])

  useFrame(({ clock }) => {
    const m = mesh.current
    if (!m || flames.length === 0) return
    const t = clock.elapsedTime
    flames.forEach((fl, i) => {
      const flicker = 0.75 + 0.25 * Math.sin(t * 9 + fl.phase) * Math.sin(t * 5.3 + fl.phase * 1.7)
      const lean = 0.08 * Math.sin(t * 3 + fl.phase)
      pos.set(fl.x + lean, fl.y, fl.z)
      scl.set(fl.size, fl.size * (1.6 + fl.level * 0.5) * flicker, fl.size)
      mat.compose(pos, q, scl)
      m.setMatrixAt(i, mat)
    })
    m.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={mesh} args={[FLAME, material, capacity]} frustumCulled={false} />
}
