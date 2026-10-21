import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useStore } from '../store'
import { height } from '../city/scales'
import { linesAt, type TimelineData } from '../city/timeline'
import type { City } from '../city/types'

const MAX_CRANES = 400
const MAX_RUBBLE = 600
const RUBBLE_KEYFRAMES = 6

// Mast: unit height, scaled per crane. Top: jib assembly at the mast head,
// facing +x, with a red light on the cab (emit = 1).
const MAST = new THREE.BoxGeometry(0.14, 1, 0.14).translate(0, 0.5, 0)
function topGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const add = (g: THREE.BufferGeometry, emit: number) => {
    const n = g.getAttribute('position').count
    g.setAttribute('emit', new THREE.Float32BufferAttribute(new Float32Array(n).fill(emit), 1))
    parts.push(g)
  }
  add(new THREE.BoxGeometry(2.6, 0.09, 0.09).translate(1.1, 0.1, 0), 0) // jib
  add(new THREE.BoxGeometry(0.9, 0.09, 0.09).translate(-0.55, 0.1, 0), 0) // counter jib
  add(new THREE.BoxGeometry(0.3, 0.2, 0.22).translate(-0.85, 0.0, 0), 0) // counterweight
  add(new THREE.BoxGeometry(0.22, 0.22, 0.2).translate(0.15, -0.05, 0), 0) // cab
  add(new THREE.BoxGeometry(0.06, 0.5, 0.06).translate(0, 0.35, 0), 0) // tower top
  add(new THREE.BoxGeometry(0.02, 0.9, 0.02).translate(2.0, -0.35, 0), 0) // hook cable
  add(new THREE.BoxGeometry(0.12, 0.1, 0.1).translate(2.0, -0.85, 0), 0) // hook block
  add(new THREE.BoxGeometry(0.06, 0.06, 0.06).translate(0, 0.62, 0), 1) // warning light
  return mergeGeometries(parts, false)
}
const TOP = topGeometry()
const RUBBLE = new THREE.IcosahedronGeometry(0.5, 0)

interface Crane {
  x: number
  z: number
  y: number // mast base
  h: number // mast height
  yaw: number
}
interface Rubble {
  x: number
  z: number
  y: number
  w: number
  d: number
  age: number // keyframes since the demolition
  seed: number
}

/**
 * Construction and demolition on the timeline. A building whose line count
 * jumps at the current keyframe gets a tower crane beside it; a file deleted
 * in the last few keyframes leaves a rubble pile on its lot that settles
 * before the dark footprint takes over.
 */
export function Cranes({ city, timeline }: { city: City; timeline: TimelineData }) {
  const k = useStore((s) => s.k)
  const heightScale = useStore((s) => s.heightScale)
  const hideGenerated = useStore((s) => s.hideGenerated)
  const masts = useRef<THREE.InstancedMesh>(null!)
  const tops = useRef<THREE.InstancedMesh>(null!)
  const rubble = useRef<THREE.InstancedMesh>(null!)

  const mats = useMemo(() => {
    const crane = new THREE.MeshStandardMaterial({ color: '#d9961c', roughness: 0.6, metalness: 0.4 })
    const top = new THREE.MeshStandardMaterial({ color: '#d9961c', roughness: 0.6, metalness: 0.4 })
    top.onBeforeCompile = (shader) => {
      shader.vertexShader = 'attribute float emit;\nvarying float vEmit;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmit = emit;')
      shader.fragmentShader =
        'varying float vEmit;\n' + shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n if (vEmit > 0.5) totalEmissiveRadiance += vec3(3.0, 0.2, 0.15);')
    }
    const stone = new THREE.MeshStandardMaterial({ color: '#4a4744', roughness: 1, flatShading: true })
    return { crane, top, stone }
  }, [])

  const { cranes, piles } = useMemo(() => {
    const cranes: (Crane & { growth: number })[] = []
    const piles: Rubble[] = []
    if (k <= 0) return { cranes, piles }
    city.files.forEach((f, fi) => {
      if (hideGenerated && (f.generated || f.vendored)) return
      const now = linesAt(timeline, fi, k)
      const before = linesAt(timeline, fi, k - 1)
      const growth = now - before
      if (growth >= Math.max(8, before * 0.12) && now > 0) {
        const h = height(now, heightScale, city.stats.maxLines)
        const depth = city.dirs[f.dir]?.depth ?? 0
        cranes.push({ x: f.x - 0.18, z: f.z - 0.18, y: 0.08 * depth + 0.08, h: h + 1.6, yaw: (fi * 0.618) % (Math.PI * 2), growth })
      }
      // Demolished within the last few keyframes: a pile that settles.
      if (now === 0) {
        for (let j = Math.max(1, k - RUBBLE_KEYFRAMES + 1); j <= k; j++) {
          if (linesAt(timeline, fi, j) === 0 && linesAt(timeline, fi, j - 1) > 0) {
            const depth = city.dirs[f.dir]?.depth ?? 0
            piles.push({ x: f.x + f.w / 2, z: f.z + f.d / 2, y: 0.08 * depth + 0.13, w: f.w, d: f.d, age: k - j, seed: fi })
            break
          }
        }
      }
    })
    cranes.sort((a, b) => b.growth - a.growth)
    return { cranes: cranes.slice(0, MAX_CRANES), piles: piles.slice(0, MAX_RUBBLE) }
  }, [city, timeline, k, heightScale, hideGenerated])

  useEffect(() => {
    const mat = new THREE.Matrix4()
    const pos = new THREE.Vector3()
    const scl = new THREE.Vector3()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    cranes.forEach((c, i) => {
      mat.compose(pos.set(c.x, c.y, c.z), q.identity(), scl.set(1, c.h, 1))
      masts.current.setMatrixAt(i, mat)
    })
    masts.current.count = cranes.length
    masts.current.instanceMatrix.needsUpdate = true
    masts.current.computeBoundingSphere()

    // Three stones per pile, lower and flatter the older the demolition.
    let n = 0
    piles.forEach((p) => {
      const settle = 1 - p.age / RUBBLE_KEYFRAMES
      for (let i = 0; i < 3 && n < MAX_RUBBLE * 3; i++) {
        const r = ((p.seed * 7 + i * 13) % 11) / 11
        const ox = (r - 0.5) * p.w * 0.5
        const oz = (((p.seed * 3 + i * 5) % 7) / 7 - 0.5) * p.d * 0.5
        const s = Math.min(p.w, p.d) * (0.35 + 0.25 * r)
        q.setFromAxisAngle(up, r * 6.28)
        mat.compose(pos.set(p.x + ox, p.y, p.z + oz), q, scl.set(s, s * (0.25 + 0.45 * settle), s))
        rubble.current.setMatrixAt(n++, mat)
      }
    })
    rubble.current.count = n
    rubble.current.instanceMatrix.needsUpdate = true
    rubble.current.computeBoundingSphere()
  }, [cranes, piles])

  // The jibs slew slowly; the hook swings over the building.
  const tmp = useMemo(() => ({ mat: new THREE.Matrix4(), pos: new THREE.Vector3(), q: new THREE.Quaternion(), up: new THREE.Vector3(0, 1, 0), one: new THREE.Vector3(1, 1, 1) }), [])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const m = tops.current
    if (!m) return
    const { mat, pos, q, up, one } = tmp
    cranes.forEach((c, i) => {
      q.setFromAxisAngle(up, c.yaw + Math.sin(t * 0.25 + c.yaw) * 0.9)
      mat.compose(pos.set(c.x, c.y + c.h, c.z), q, one)
      m.setMatrixAt(i, mat)
    })
    m.count = cranes.length
    m.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <instancedMesh ref={masts} args={[MAST, mats.crane, Math.max(1, MAX_CRANES)]} frustumCulled={false} raycast={() => null} castShadow />
      <instancedMesh ref={tops} args={[TOP, mats.top, Math.max(1, MAX_CRANES)]} frustumCulled={false} raycast={() => null} castShadow />
      <instancedMesh ref={rubble} args={[RUBBLE, mats.stone, MAX_RUBBLE * 3]} frustumCulled={false} raycast={() => null} castShadow receiveShadow />
    </>
  )
}
