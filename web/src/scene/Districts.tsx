import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { City } from '../city/types'

const PLATE = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)

/**
 * District plates: each directory is a thin concrete slab, nested ones stacked
 * slightly higher, with a lighter curb around the edge so streets read as
 * streets. Two instanced meshes: curbs then plates.
 */
export function Districts({ city }: { city: City }) {
  const plates = useRef<THREE.InstancedMesh>(null!)
  const curbs = useRef<THREE.InstancedMesh>(null!)
  const plateMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 }), [])
  const curbMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2a3550', roughness: 0.8, metalness: 0 }), [])

  useEffect(() => {
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
      plates.current.setMatrixAt(i, mat)
      color.setHSL(0.63, 0.18, 0.11 + Math.min(0.2, d.depth * 0.03))
      plates.current.setColorAt(i, color)
      // Curb: a hair wider and a hair lower.
      scl.set(d.w + 0.18, y + 0.055, d.d + 0.18)
      mat.compose(pos, q, scl)
      curbs.current.setMatrixAt(i, mat)
    })
    for (const m of [plates.current, curbs.current]) {
      m.count = city.dirs.length
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
      m.computeBoundingSphere()
    }
  }, [city])

  const n = Math.max(1, city.dirs.length)
  return (
    <>
      <instancedMesh ref={curbs} args={[PLATE, curbMat, n]} receiveShadow />
      <instancedMesh ref={plates} args={[PLATE, plateMat, n]} receiveShadow />
    </>
  )
}
