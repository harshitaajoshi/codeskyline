import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { City, Dir } from '../city/types'
import { useFrame } from '@react-three/fiber'
import { sidewalkWidth, streetWidth } from './Districts'
import { atmosphere } from './atmosphere'
import { useStore } from '../store'
import { THEMES } from './themes'

const DASH = new THREE.BoxGeometry(0.55, 0.012, 0.06).translate(0, 0.006, 0)
const POLE = new THREE.BoxGeometry(0.05, 1.7, 0.05).translate(0, 0.85, 0)
const HEAD = new THREE.BoxGeometry(0.2, 0.06, 0.11).translate(0.07, 1.72, 0)
const TRUNK = new THREE.BoxGeometry(0.07, 0.55, 0.07).translate(0, 0.275, 0)
const CANOPY = new THREE.IcosahedronGeometry(0.38, 1).translate(0, 0.78, 0)
const POOL = new THREE.PlaneGeometry(3.4, 3.4).rotateX(-Math.PI / 2)

const MAX_DASHES = 60000
const MAX_LAMPS = 5000
const MAX_TREES = 4000
const LAMP_SPACING = 7
const MIN_STREET = 1.7 // markings, lamps and trees only where the street is wide enough

/** Streets that get furniture: every district plate deep enough to sit on a real street. */
export function furnishedPlates(city: City): Dir[] {
  return city.dirs.filter((d) => d.depth >= 1 && streetWidth(d.depth) >= MIN_STREET)
}

/**
 * Street furniture on the boulevards: a dashed centre line down every street,
 * lamps along the sidewalks with a pool of light under each, and trees
 * between the lamps on the widest streets. All instanced, all static.
 */
export function Streets({ city }: { city: City }) {
  const dashes = useRef<THREE.InstancedMesh>(null!)
  const trunks = useRef<THREE.InstancedMesh>(null!)
  const canopies = useRef<THREE.InstancedMesh>(null!)

  const data = useMemo(() => buildStreets(city), [city])

  const mats = useMemo(
    () => ({
      dash: new THREE.MeshStandardMaterial({ color: '#c9b872', roughness: 0.9 }),
      trunk: new THREE.MeshStandardMaterial({ color: '#2d2419', roughness: 1 }),
      canopy: new THREE.MeshStandardMaterial({ color: '#1f3a22', roughness: 1, flatShading: true }),
    }),
    [],
  )

  useEffect(() => {
    const mat = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const pos = new THREE.Vector3()
    const one = new THREE.Vector3(1, 1, 1)
    const color = new THREE.Color()

    data.dashes.forEach((d, i) => {
      q.setFromAxisAngle(up, d.yaw)
      mat.compose(pos.set(d.x, d.y, d.z), q, one)
      dashes.current.setMatrixAt(i, mat)
    })
    dashes.current.count = data.dashes.length

    data.trees.forEach((t, i) => {
      q.setFromAxisAngle(up, t.yaw)
      const s = 0.8 + 0.5 * t.size
      mat.compose(pos.set(t.x, t.y, t.z), q, pos.set(s, s, s))
      trunks.current.setMatrixAt(i, mat)
      canopies.current.setMatrixAt(i, mat)
      color.setHSL(0.3 + 0.06 * t.size, 0.35, 0.16 + 0.08 * t.size)
      canopies.current.setColorAt(i, color)
    })
    trunks.current.count = canopies.current.count = data.trees.length

    for (const m of [dashes.current, trunks.current, canopies.current]) {
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
      m.computeBoundingSphere()
    }
  }, [data])

  return (
    <>
      <instancedMesh ref={dashes} args={[DASH, mats.dash, Math.max(1, data.dashes.length)]} receiveShadow />
      <LampPosts lamps={data.lamps} />
      <instancedMesh ref={trunks} args={[TRUNK, mats.trunk, Math.max(1, data.trees.length)]} castShadow />
      <instancedMesh ref={canopies} args={[CANOPY, mats.canopy, Math.max(1, data.trees.length)]} castShadow />
    </>
  )
}

export interface Placed {
  x: number
  y: number
  z: number
  yaw: number
}

/** Lamp posts with a pool of light on the pavement under each head. */
export function LampPosts({ lamps }: { lamps: Placed[] }) {
  const poles = useRef<THREE.InstancedMesh>(null!)
  const heads = useRef<THREE.InstancedMesh>(null!)
  const pools = useRef<THREE.InstancedMesh>(null!)
  const theme = useStore((s) => s.theme)
  const mats = useMemo(() => {
    const L = THEMES[theme].lamp
    const glow = new THREE.Color(L.head).multiplyScalar(3.2)
    return {
      pole: new THREE.MeshStandardMaterial({ color: '#2a2b2e', roughness: 0.6, metalness: 0.4 }),
      head: new THREE.MeshStandardMaterial({ color: L.head, emissive: glow, toneMapped: false }),
      pool: new THREE.MeshBasicMaterial({ map: poolTexture(L.pool), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    }
  }, [theme])
  useEffect(() => {
    const mat = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const pos = new THREE.Vector3()
    const one = new THREE.Vector3(1, 1, 1)
    lamps.forEach((l, i) => {
      q.setFromAxisAngle(up, l.yaw)
      mat.compose(pos.set(l.x, l.y, l.z), q, one)
      poles.current.setMatrixAt(i, mat)
      heads.current.setMatrixAt(i, mat)
      // The pool sits under the lamp head, out over the street.
      const hx = l.x + Math.cos(l.yaw) * 0.14
      const hz = l.z - Math.sin(l.yaw) * 0.14
      mat.compose(pos.set(hx, l.y + 0.012, hz), q, one)
      pools.current.setMatrixAt(i, mat)
    })
    for (const m of [poles.current, heads.current, pools.current]) {
      m.count = lamps.length
      m.instanceMatrix.needsUpdate = true
      m.computeBoundingSphere()
    }
  }, [lamps])
  useFrame(() => {
    mats.head.emissiveIntensity = 0.05 + 0.95 * atmosphere.night
    mats.pool.opacity = 0.55 * atmosphere.night
  })
  const n = Math.max(1, lamps.length)
  return (
    <>
      <instancedMesh ref={poles} args={[POLE, mats.pole, n]} castShadow />
      <instancedMesh ref={heads} args={[HEAD, mats.head, n]} />
      <instancedMesh ref={pools} args={[POOL, mats.pool, n]} renderOrder={2} />
    </>
  )
}

function buildStreets(city: City) {
  const dashes: Placed[] = []
  const lamps: Placed[] = []
  const trees: (Placed & { size: number })[] = []
  const siblings = new Map<number, Dir[]>()
  for (const d of city.dirs) {
    if (d.depth < 1) continue
    const arr = siblings.get(d.parent) ?? []
    arr.push(d)
    siblings.set(d.parent, arr)
  }
  const seen = new Set<string>()
  let seed = 11
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }

  for (const d of furnishedPlates(city)) {
    const g = streetWidth(d.depth)
    const sw = sidewalkWidth(d.depth)
    const y = 0.08 * d.depth // the parent's plate top: the street surface
    const sibs = (siblings.get(d.parent) ?? []).filter((s) => s !== d)
    const inSibling = (x: number, z: number) => sibs.some((s) => x > s.x - 0.2 && x < s.x + s.w + 0.2 && z > s.z - 0.2 && z < s.z + s.d + 0.2)

    // Centre line on all four sides, half a street out; shared with the
    // neighbour across the street, so dedupe on position.
    const half = g / 2
    const lines: { x0: number; z0: number; x1: number; z1: number }[] = [
      { x0: d.x - half, z0: d.z - half, x1: d.x + d.w + half, z1: d.z - half },
      { x0: d.x - half, z0: d.z + d.d + half, x1: d.x + d.w + half, z1: d.z + d.d + half },
      { x0: d.x - half, z0: d.z - half, x1: d.x - half, z1: d.z + d.d + half },
      { x0: d.x + d.w + half, z0: d.z - half, x1: d.x + d.w + half, z1: d.z + d.d + half },
    ]
    for (const l of lines) {
      const dx = l.x1 - l.x0
      const dz = l.z1 - l.z0
      const len = Math.hypot(dx, dz)
      const yaw = dx !== 0 ? 0 : Math.PI / 2
      for (let s = 0.6; s < len - 0.3; s += 1.1) {
        const x = l.x0 + (dx / len) * s
        const z = l.z0 + (dz / len) * s
        const key = `${x.toFixed(1)},${z.toFixed(1)}`
        if (seen.has(key) || inSibling(x, z)) continue
        seen.add(key)
        if (dashes.length < MAX_DASHES) dashes.push({ x, y: y + 0.002, z, yaw })
      }
    }

    // Lamps on the sidewalk, facing the street; trees between them on boulevards.
    const off = sw * 0.55
    const sides: { x0: number; z0: number; x1: number; z1: number; yaw: number }[] = [
      { x0: d.x, z0: d.z - off, x1: d.x + d.w, z1: d.z - off, yaw: Math.PI / 2 },
      { x0: d.x + d.w, z0: d.z + d.d + off, x1: d.x, z1: d.z + d.d + off, yaw: -Math.PI / 2 },
      { x0: d.x - off, z0: d.z + d.d, x1: d.x - off, z1: d.z, yaw: Math.PI },
      { x0: d.x + d.w + off, z0: d.z, x1: d.x + d.w + off, z1: d.z + d.d, yaw: 0 },
    ]
    for (const side of sides) {
      const dx = side.x1 - side.x0
      const dz = side.z1 - side.z0
      const len = Math.hypot(dx, dz)
      if (len < LAMP_SPACING * 0.6) continue
      const n = Math.max(1, Math.round(len / LAMP_SPACING))
      const step = len / n
      for (let i = 0; i < n; i++) {
        const s = step * (i + 0.5)
        const x = side.x0 + (dx / len) * s
        const z = side.z0 + (dz / len) * s
        if (lamps.length < MAX_LAMPS) lamps.push({ x, y, z, yaw: side.yaw })
        if (d.depth === 1 && step > 4 && trees.length < MAX_TREES) {
          const t = s + step / 2
          if (t < len - 1) trees.push({ x: side.x0 + (dx / len) * t, y, z: side.z0 + (dz / len) * t, yaw: rnd() * Math.PI * 2, size: rnd() })
        }
      }
    }
  }
  return { dashes, lamps, trees }
}

/** A soft radial gradient for the pool of lamplight on the pavement. */
function poolTexture(rgb: [number, number, number]): THREE.Texture {
  const size = 64
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5
      const dy = (y + 0.5) / size - 0.5
      const r = Math.min(1, Math.hypot(dx, dy) * 2)
      const a = Math.pow(1 - r, 2.2)
      const i = (y * size + x) * 4
      data[i] = rgb[0]
      data[i + 1] = rgb[1]
      data[i + 2] = rgb[2]
      data[i + 3] = Math.round(a * 255)
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  t.needsUpdate = true
  t.minFilter = t.magFilter = THREE.LinearFilter
  return t
}
