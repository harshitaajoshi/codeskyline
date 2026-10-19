import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { City } from '../city/types'

const PLATE = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)

/** District plates: each directory is a thin slab, nested ones stacked slightly higher. */
export function Districts({ city }: { city: City }) {
  const mesh = useRef<THREE.InstancedMesh>(null!)
  const material = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 }), [])

  useEffect(() => {
    const m = mesh.current
    const mat = new THREE.Matrix4()
    const pos = new THREE.Vector3()
    const scl = new THREE.Vector3()
    const q = new THREE.Quaternion()
    const color = new THREE.Color()
    city.dirs.forEach((d, i) => {
      const y = 0.08 * d.depth
      pos.set(d.x + d.w / 2, 0, d.z + d.d / 2)
      scl.set(d.w, y + 0.08, d.d)
      mat.compose(pos, q, scl)
      m.setMatrixAt(i, mat)
      const l = 0.10 + Math.min(0.22, d.depth * 0.035)
      color.setHSL(0.62, 0.22, l)
      m.setColorAt(i, color)
    })
    m.count = city.dirs.length
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    m.computeBoundingSphere()
  }, [city])

  return <instancedMesh ref={mesh} args={[PLATE, material, Math.max(1, city.dirs.length)]} receiveShadow />
}
