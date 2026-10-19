import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useStore } from '../store'
import { fileColor, makeColorContext, type RGB } from '../city/colors'
import { height } from '../city/scales'
import type { City } from '../city/types'

// Unit box with its origin at the base so scale.y is the building height.
const BOX = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)
const LOT_MARGIN = 0.12 // gap between a building and its lot edge

const HOVER: RGB = [1, 1, 1]
const SELECT: RGB = [0.49, 0.77, 1]

/** All buildings as a single InstancedMesh: one draw call however big the city. */
export function Buildings({ city }: { city: City }) {
  const mesh = useRef<THREE.InstancedMesh>(null!)
  const mode = useStore((s) => s.mode)
  const heightScale = useStore((s) => s.heightScale)
  const hideGenerated = useStore((s) => s.hideGenerated)
  const hovered = useStore((s) => s.hovered)
  const selected = useStore((s) => s.selected)
  const hover = useStore((s) => s.hover)
  const select = useStore((s) => s.select)

  // Visible files → instance slots. Hidden files are simply not instanced.
  const visible = useMemo(() => {
    const ids: number[] = []
    city.files.forEach((f, i) => {
      if (hideGenerated && (f.generated || f.vendored)) return
      ids.push(i)
    })
    return ids
  }, [city, hideGenerated])

  const ctx = useMemo(() => makeColorContext(city, mode), [city, mode])

  // Geometry: positions and sizes only change with the city or the height scale.
  useEffect(() => {
    const m = mesh.current
    const mat = new THREE.Matrix4()
    const pos = new THREE.Vector3()
    const scl = new THREE.Vector3()
    const q = new THREE.Quaternion()
    visible.forEach((fi, slot) => {
      const f = city.files[fi]!
      const h = height(f.lines, heightScale, city.stats.maxLines)
      pos.set(f.x + f.w / 2, 0, f.z + f.d / 2)
      scl.set(Math.max(0.2, f.w - LOT_MARGIN), h, Math.max(0.2, f.d - LOT_MARGIN))
      mat.compose(pos, q, scl)
      m.setMatrixAt(slot, mat)
    })
    m.count = visible.length
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
  }, [city, visible, heightScale])

  // Colors: recomputed for mode changes; hover/select patch two slots.
  const base = useMemo(() => {
    const arr = new Float32Array(visible.length * 3)
    visible.forEach((fi, slot) => {
      const c = fileColor(city.files[fi]!, fi, ctx)
      arr[slot * 3] = c[0]
      arr[slot * 3 + 1] = c[1]
      arr[slot * 3 + 2] = c[2]
    })
    return arr
  }, [city, visible, ctx])

  const slotOf = useMemo(() => {
    const m = new Map<number, number>()
    visible.forEach((fi, slot) => m.set(fi, slot))
    return m
  }, [visible])

  useEffect(() => {
    const m = mesh.current
    if (!m.instanceColor || m.instanceColor.count < visible.length) {
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(visible.length * 3), 3)
    }
    const arr = m.instanceColor.array as Float32Array
    arr.set(base)
    const paint = (fi: number | null, c: RGB) => {
      const slot = fi == null ? undefined : slotOf.get(fi)
      if (slot == null) return
      arr[slot * 3] = c[0]
      arr[slot * 3 + 1] = c[1]
      arr[slot * 3 + 2] = c[2]
    }
    paint(selected, SELECT)
    paint(hovered, HOVER)
    m.instanceColor.needsUpdate = true
  }, [base, slotOf, hovered, selected, visible.length])

  // Burning buildings pulse: scale their emissive via a shared uniform.
  const material = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.1 }), [])
  useFrame(() => {
    // no-op placeholder for future per-frame effects
  })

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const fi = e.instanceId == null ? null : (visible[e.instanceId] ?? null)
    hover(fi)
  }
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    const fi = e.instanceId == null ? null : (visible[e.instanceId] ?? null)
    select(fi, true)
  }

  return (
    <instancedMesh
      ref={mesh}
      args={[BOX, material, Math.max(1, city.files.length)]}
      castShadow
      receiveShadow
      onPointerMove={onMove}
      onPointerOut={() => hover(null)}
      onClick={onClick}
    />
  )
}
