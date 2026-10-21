import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useStore } from '../store'
import type { TimelineData } from '../city/timeline'
import type { City } from '../city/types'

const CAR = new THREE.BoxGeometry(0.34, 0.1, 0.16).translate(0, 0.05, 0)
const MAX_CARS = 1600
const RECENT = 2 * 365 * 86400

// Over 1.0 so the bloom pass catches them: streams of head and tail lights.
const HEAD = new THREE.Color(2.3, 2.1, 1.7)
const TAIL = new THREE.Color(2.6, 0.55, 0.4)

/** Mirrors layout.street in the analyzer: boulevards up top, alleys deep down. */
function streetWidth(depth: number) {
  return Math.max(0.8, 3 - 0.6 * depth)
}

interface Loop {
  dir: number
  x: number
  z: number
  w: number
  d: number
  y: number
  perimeter: number
}

interface Car {
  loop: number
  s: number // distance along the loop
  v: number // units per second, clockwise
}

/**
 * Traffic: small lights driving the ring road around every district, as
 * many as the district has had recent work. The streets are the gaps the
 * layout left between sibling plates, so one clockwise lane per plate gives
 * opposite directions on the two sides of every street for free. A district
 * has no traffic until its first file exists at the current keyframe.
 */
export function Traffic({ city, timeline }: { city: City; timeline: TimelineData }) {
  const mesh = useRef<THREE.InstancedMesh>(null!)
  const k = useStore((s) => s.k)
  const material = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), [])

  const { loops, cars, minBorn } = useMemo(() => buildTraffic(city, timeline), [city, timeline])

  // Which loops are live at this keyframe.
  const live = useMemo(() => loops.map((l) => (minBorn[l.dir] ?? -1) >= 0 && (minBorn[l.dir] ?? 0) <= k), [loops, minBorn, k])

  useEffect(() => {
    const m = mesh.current
    const color = new THREE.Color()
    cars.forEach((_, i) => {
      color.copy(i % 5 < 3 ? HEAD : TAIL)
      m.setColorAt(i, color)
    })
    m.count = cars.length
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [cars])

  const mat = useMemo(() => new THREE.Matrix4(), [])
  const pos = useMemo(() => new THREE.Vector3(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const one = useMemo(() => new THREE.Vector3(1, 1, 1), [])
  const zero = useMemo(() => new THREE.Vector3(0, 0, 0), [])

  useFrame((_, dt) => {
    const m = mesh.current
    if (!m || cars.length === 0) return
    const step = Math.min(dt, 0.05)
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i]!
      const l = loops[c.loop]!
      if (!live[c.loop]) {
        mat.compose(zero, q, zero)
        m.setMatrixAt(i, mat)
        continue
      }
      c.s += c.v * step
      if (c.s >= l.perimeter) c.s -= l.perimeter
      // Clockwise from the top-left corner: along +x, then +z, then -x, then -z.
      let s = c.s
      let yaw: number
      if (s < l.w) {
        pos.set(l.x + s, l.y, l.z)
        yaw = 0
      } else if ((s -= l.w) < l.d) {
        pos.set(l.x + l.w, l.y, l.z + s)
        yaw = -Math.PI / 2
      } else if ((s -= l.d) < l.w) {
        pos.set(l.x + l.w - s, l.y, l.z + l.d)
        yaw = Math.PI
      } else {
        s -= l.w
        pos.set(l.x, l.y, l.z + l.d - s)
        yaw = Math.PI / 2
      }
      q.setFromAxisAngle(up, yaw)
      mat.compose(pos, q, one)
      m.setMatrixAt(i, mat)
    }
    m.instanceMatrix.needsUpdate = true
  })

  if (cars.length === 0) return null
  return <instancedMesh ref={mesh} args={[CAR, material, Math.max(1, cars.length)]} frustumCulled={false} raycast={() => null} />
}

function buildTraffic(city: City, timeline: TimelineData): { loops: Loop[]; cars: Car[]; minBorn: Int32Array } {
  const since = city.repo.lastCommit - RECENT
  // Recent work per district, counted up through every ancestor, and the
  // first keyframe at which any file of the district exists.
  const active = new Int32Array(city.dirs.length)
  const minBorn = new Int32Array(city.dirs.length).fill(-1)
  city.files.forEach((f, fi) => {
    if (f.removed || f.generated || f.vendored) return
    const recent = f.lastTouched >= since
    const born = timeline.born[fi] ?? -1
    let d = f.dir
    while (d >= 0) {
      const dir = city.dirs[d]
      if (!dir) break
      if (recent) active[d]!++
      if (born >= 0 && (minBorn[d]! < 0 || born < minBorn[d]!)) minBorn[d] = born
      if (dir.depth === 0) break
      d = dir.parent
    }
  })

  const loops: Loop[] = []
  const want: number[] = []
  city.dirs.forEach((d, i) => {
    if (d.depth < 1 || d.depth > 4 || d.files === 0) return
    // One lane just outside the curb, on the parent's plate.
    const off = 0.09 + Math.max(0.22, streetWidth(d.depth) * 0.28)
    const x = d.x - off
    const z = d.z - off
    const w = d.w + off * 2
    const dd = d.d + off * 2
    const perimeter = 2 * (w + dd)
    loops.push({ dir: i, x, z, w, d: dd, y: 0.08 * d.depth, perimeter })
    // Every district gets a trickle for its size; recent work adds the rush hour.
    want.push(Math.min(Math.floor(perimeter / 4), Math.max(1, Math.round(active[i]! * 0.6 + d.files * 0.08 + perimeter / 40))))
  })
  const total = want.reduce((a, b) => a + b, 0)
  const scale = total > MAX_CARS ? MAX_CARS / total : 1
  const cars: Car[] = []
  let seed = 7
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  loops.forEach((l, li) => {
    const n = Math.max(1, Math.round(want[li]! * scale))
    for (let i = 0; i < n; i++) cars.push({ loop: li, s: rnd() * l.perimeter, v: 4 + rnd() * 4 })
  })
  return { loops, cars: cars.slice(0, MAX_CARS), minBorn }
}
