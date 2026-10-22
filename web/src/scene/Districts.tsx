import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { City } from '../city/types'
import { useStore } from '../store'
import { THEMES } from './themes'

const PLATE = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)

/** Mirrors layout.street in the analyzer: how wide the gap is at each depth. */
export function streetWidth(depth: number) {
  return Math.max(0.8, 3 - 0.6 * depth)
}

/** How far the sidewalk reaches out from a plate at this depth. */
export function sidewalkWidth(depth: number) {
  return depth <= 1 ? 0.3 : depth === 2 ? 0.2 : 0.08
}

/**
 * District plates: each directory is a slab, nested ones stacked slightly
 * higher. The exposed top of a plate between its children is the street, so
 * plates are asphalt; the ring around each plate, a hair lower, is the
 * sidewalk, paler and wider on the boulevards. Two instanced meshes.
 */
export function Districts({ city }: { city: City }) {
  const plates = useRef<THREE.InstancedMesh>(null!)
  const walks = useRef<THREE.InstancedMesh>(null!)
  const theme = useStore((s) => s.theme)
  const T = THEMES[theme]
  const plateMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0.05 }), [])
  const walkMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 }), [])

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
      // Asphalt: cool and dark, a touch lighter deep in the tree where the alleys are.
      color.setHSL(T.asphalt[0], T.asphalt[1], T.asphalt[2] + Math.min(0.08, d.depth * 0.012))
      plates.current.setColorAt(i, color)
      // Sidewalk ring: wider and paler on the boulevards, just below the plate top.
      const sw = sidewalkWidth(d.depth)
      scl.set(d.w + sw * 2, y + 0.062, d.d + sw * 2)
      mat.compose(pos, q, scl)
      walks.current.setMatrixAt(i, mat)
      color.setHSL(0.08, 0.03, d.depth <= 2 ? T.sidewalk[0] : T.sidewalk[1])
      walks.current.setColorAt(i, color)
    })
    for (const m of [plates.current, walks.current]) {
      m.count = city.dirs.length
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
      m.computeBoundingSphere()
    }
  }, [city, T])

  const n = Math.max(1, city.dirs.length)
  return (
    <>
      <instancedMesh ref={walks} args={[PLATE, walkMat, n]} receiveShadow />
      <instancedMesh ref={plates} args={[PLATE, plateMat, n]} receiveShadow />
    </>
  )
}
