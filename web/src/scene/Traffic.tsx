import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useStore } from '../store'
import type { TimelineData } from '../city/timeline'
import type { City } from '../city/types'
import { sidewalkWidth, streetWidth } from './Districts'
import { furnishedPlates } from './Streets'
import { atmosphere } from './atmosphere'

const MAX_CARS = 1400
const RECENT = 2 * 365 * 86400

// Body colors: mostly dark and silver, the odd red or white.
const PAINT = ['#1d1f24', '#2a2d33', '#8d9097', '#c9cbd0', '#5a1d1f', '#1c2a44', '#3b3d42', '#e8e6e0'].map((c) => new THREE.Color(c))

/**
 * One car: body, cabin, two headlights and two tail lights, merged into a
 * single geometry. `emit` marks the lamps for the shader (1 head, 2 tail).
 * The car faces +x.
 */
function carGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const add = (g: THREE.BufferGeometry, emit: number) => {
    const n = g.getAttribute('position').count
    g.setAttribute('emit', new THREE.Float32BufferAttribute(new Float32Array(n).fill(emit), 1))
    parts.push(g)
  }
  add(new THREE.BoxGeometry(0.46, 0.13, 0.22).translate(0, 0.1, 0), 0)
  add(new THREE.BoxGeometry(0.24, 0.1, 0.19).translate(-0.02, 0.21, 0), 0)
  for (const z of [-0.07, 0.07]) {
    add(new THREE.BoxGeometry(0.02, 0.04, 0.05).translate(0.23, 0.1, z), 1)
    add(new THREE.BoxGeometry(0.02, 0.03, 0.05).translate(-0.23, 0.1, z), 2)
  }
  const merged = mergeGeometries(parts, false)
  for (const p of parts) p.dispose()
  return merged
}

// Headlight beam on the road: a quad in front of the car, bright at the
// bumper and fading out, drawn additively. Injected into MeshBasicMaterial.
const BEAM = new THREE.PlaneGeometry(2.2, 1.1).rotateX(-Math.PI / 2).translate(1.3, 0.012, 0)
const BEAM_VERT = /* glsl */ `
varying vec2 vBeamUv;
`
const BEAM_FRAG_PARS = /* glsl */ `
varying vec2 vBeamUv;
uniform float uNight;
`
const BEAM_FRAG = /* glsl */ `
{
  // Clamped before pow: interpolation can push uv a hair past 1, and a
  // negative base gives NaN, which the bloom then smears over the whole frame.
  float along = clamp(1.0 - vBeamUv.x, 0.0, 1.0);            // 1 at the bumper, 0 at the far end
  float across = clamp(1.0 - abs(vBeamUv.y * 2.0 - 1.0), 0.0, 1.0);
  float spread = mix(0.35, 1.0, 1.0 - along);
  float a = clamp(pow(along, 1.4) * smoothstep(0.0, spread, across) * 0.55 * uNight, 0.0, 1.0);
  diffuseColor.rgb *= a;
  diffuseColor.a = a;
}
`

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
  s: number
  v: number
}

/**
 * Traffic on the boulevards. Each district plate has one clockwise lane
 * around it, a quarter street out from the sidewalk, so the two sides of
 * every street carry opposite directions. Busy districts (recent work) get
 * more cars. A district has no traffic until its first file exists.
 */
export function Traffic({ city, timeline }: { city: City; timeline: TimelineData }) {
  const mesh = useRef<THREE.InstancedMesh>(null!)
  const k = useStore((s) => s.k)
  const geometry = useMemo(() => carGeometry(), [])
  const night = useMemo(() => ({ value: 1 }), [])
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.6 })
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uNight = night
      shader.vertexShader = 'attribute float emit;\nvarying float vEmit;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmit = emit;')
      shader.fragmentShader =
        'varying float vEmit;\nuniform float uNight;\n' +
        shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n if (vEmit > 1.5) totalEmissiveRadiance += vec3(2.4, 0.25, 0.2) * (0.3 + 0.7 * uNight); else if (vEmit > 0.5) totalEmissiveRadiance += vec3(2.8, 2.6, 2.2) * (0.2 + 0.8 * uNight);',
        )
    }
    return m
  }, [night])
  const beams = useRef<THREE.InstancedMesh>(null!)
  const beamMat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.93, 0.78), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
    m.customProgramCacheKey = () => 'csky-beam'
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uNight = night
      shader.vertexShader = BEAM_VERT + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvBeamUv = uv;')
      shader.fragmentShader = BEAM_FRAG_PARS + shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + BEAM_FRAG)
    }
    return m
  }, [night])
  useEffect(() => () => {
    geometry.dispose()
    material.dispose()
    beamMat.dispose()
  }, [geometry, material, beamMat])

  const { loops, cars, minBorn } = useMemo(() => buildTraffic(city, timeline), [city, timeline])
  const live = useMemo(() => loops.map((l) => (minBorn[l.dir] ?? -1) >= 0 && (minBorn[l.dir] ?? 0) <= k), [loops, minBorn, k])

  useEffect(() => {
    const m = mesh.current
    cars.forEach((_, i) => m.setColorAt(i, PAINT[(i * 7) % PAINT.length]!))
    m.count = cars.length
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [cars])

  const tmp = useMemo(() => ({ mat: new THREE.Matrix4(), pos: new THREE.Vector3(), q: new THREE.Quaternion(), up: new THREE.Vector3(0, 1, 0), one: new THREE.Vector3(1, 1, 1), away: new THREE.Vector3(0, -1e4, 0) }), [])

  useFrame((_, dt) => {
    const m = mesh.current
    const b = beams.current
    if (!m || cars.length === 0) return
    night.value = atmosphere.night
    const { mat, pos, q, up, one, away } = tmp
    const step = Math.min(dt, 0.05)
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i]!
      const l = loops[c.loop]!
      if (!live[c.loop]) {
        // Parked out of sight; a zero-scale matrix would give NaN normals.
        mat.compose(away, q, one)
        m.setMatrixAt(i, mat)
        if (b) b.setMatrixAt(i, mat)
        continue
      }
      c.s += c.v * step
      if (c.s >= l.perimeter) c.s -= l.perimeter
      // Clockwise from the top-left corner: +x, then +z, then -x, then -z.
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
      if (b) b.setMatrixAt(i, mat)
    }
    m.instanceMatrix.needsUpdate = true
    if (b) b.instanceMatrix.needsUpdate = true
  })

  if (cars.length === 0) return null
  return (
    <>
      <instancedMesh ref={mesh} args={[geometry, material, Math.max(1, cars.length)]} frustumCulled={false} raycast={() => null} castShadow />
      <instancedMesh ref={beams} args={[BEAM, beamMat, Math.max(1, cars.length)]} frustumCulled={false} raycast={() => null} renderOrder={3} />
    </>
  )
}

function buildTraffic(city: City, timeline: TimelineData): { loops: Loop[]; cars: Car[]; minBorn: Int32Array } {
  const since = city.repo.lastCommit - RECENT
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
  for (const d of furnishedPlates(city)) {
    if (d.files === 0) continue
    const i = d.id
    // The lane runs a quarter street out: clear of the sidewalk, short of the centre line.
    const off = Math.max(sidewalkWidth(d.depth) + 0.2, streetWidth(d.depth) * 0.27)
    const x = d.x - off
    const z = d.z - off
    const w = d.w + off * 2
    const dd = d.d + off * 2
    const perimeter = 2 * (w + dd)
    loops.push({ dir: i, x, z, w, d: dd, y: 0.08 * d.depth, perimeter })
    want.push(Math.min(Math.floor(perimeter / 5), Math.max(1, Math.round(active[i]! * 0.5 + d.files * 0.05 + perimeter / 60))))
  }
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
    for (let i = 0; i < n; i++) cars.push({ loop: li, s: rnd() * l.perimeter, v: 2.5 + rnd() * 2.5 })
  })
  return { loops, cars: cars.slice(0, MAX_CARS), minBorn }
}
