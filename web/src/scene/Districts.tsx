import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { City } from '../city/types'

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
  const edges = useRef<THREE.InstancedMesh>(null!)
  const plateMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0.05 }), [])
  const walkMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 }), [])
  // Top-level districts get a lit kerb line, so the neighbourhoods read at a glance.
  const edgeMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.0, 0.55), toneMapped: false }), [])
  const topLevel = useMemo(() => city.dirs.filter((d) => d.depth === 1 && d.files >= 3), [city])

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
      color.setHSL(0.62, 0.05, 0.11 + Math.min(0.08, d.depth * 0.012))
      plates.current.setColorAt(i, color)
      // Sidewalk ring: wider and paler on the boulevards, just below the plate top.
      const sw = sidewalkWidth(d.depth)
      scl.set(d.w + sw * 2, y + 0.062, d.d + sw * 2)
      mat.compose(pos, q, scl)
      walks.current.setMatrixAt(i, mat)
      color.setHSL(0.08, 0.03, d.depth <= 2 ? 0.27 : 0.18)
      walks.current.setColorAt(i, color)
    })
    for (const m of [plates.current, walks.current]) {
      m.count = city.dirs.length
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
      m.computeBoundingSphere()
    }
    // Four thin strips along the outer edge of each top-level sidewalk.
    let k = 0
    const t = 0.07
    topLevel.forEach((d) => {
      const sw = sidewalkWidth(1)
      const y = 0.08 * 1 + 0.062
      const x0 = d.x - sw
      const z0 = d.z - sw
      const w = d.w + sw * 2
      const dd = d.d + sw * 2
      const strips: [number, number, number, number][] = [
        [x0 + w / 2, z0 + t / 2, w, t],
        [x0 + w / 2, z0 + dd - t / 2, w, t],
        [x0 + t / 2, z0 + dd / 2, t, dd],
        [x0 + w - t / 2, z0 + dd / 2, t, dd],
      ]
      for (const [cx, cz, sx, sz] of strips) {
        pos.set(cx, y, cz)
        scl.set(sx, 0.012, sz)
        mat.compose(pos, q, scl)
        edges.current.setMatrixAt(k++, mat)
      }
    })
    edges.current.count = k
    edges.current.instanceMatrix.needsUpdate = true
    edges.current.computeBoundingSphere()
  }, [city, topLevel])

  const n = Math.max(1, city.dirs.length)
  return (
    <>
      <instancedMesh ref={walks} args={[PLATE, walkMat, n]} receiveShadow />
      <instancedMesh ref={plates} args={[PLATE, plateMat, n]} receiveShadow />
      <instancedMesh ref={edges} args={[PLATE, edgeMat, Math.max(1, topLevel.length * 4)]} raycast={() => null} />
    </>
  )
}
