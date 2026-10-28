import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useStore } from '../store'
import { height } from '../city/scales'
import { burningAt, fireAt, linesAt, type TimelineData } from '../city/timeline'
import type { City } from '../city/types'

const NOISE = /* glsl */ `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.1 + 7.3; a *= 0.5; }
  return v;
}`

// Cylindrical billboards: quads always face the camera around the Y axis.
const VERT = /* glsl */ `
attribute vec3 aPos;
attribute float aSize;
attribute float aPhase;
attribute float aLevel;
uniform float uTime;
uniform float uSmoke;
varying vec2 vUv;
varying float vPhase;
varying float vRise;
varying float vLevel;
void main() {
  vUv = uv; vPhase = aPhase; vLevel = aLevel;
  vec3 right = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));
  float rise = uSmoke > 0.5 ? fract(uTime * 0.35 + aPhase) : 0.0;
  vRise = rise;
  float w = aSize * (uSmoke > 0.5 ? 1.6 + rise * 2.2 : 1.9);
  float h = aSize * (uSmoke > 0.5 ? 1.6 + rise * 1.6 : 2.0 + 0.35 * aLevel);
  vec3 p = aPos + right * (position.x * w) + vec3(0.0, (position.y + 0.5) * h + rise * aSize * 5.0, 0.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`

const FLAME_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying float vPhase;
varying float vLevel;
${NOISE}
void main() {
  vec2 uv = vUv;
  float t = uTime * 2.2 + vPhase * 37.0;
  float n = fbm(vec2(uv.x * 3.0 + vPhase * 9.0, uv.y * 2.2 - t));
  // Teardrop silhouette: wide at the base, narrowing toward the top, with
  // noise eating the edges so it licks and flickers.
  float core = 1.0 - smoothstep(0.1, 0.5, abs(uv.x - 0.5) * (0.9 + uv.y * 2.2));
  float f = clamp(core * (n * 1.3 + 0.55) - uv.y * uv.y * 0.9, 0.0, 1.0);
  if (f < 0.06) discard;
  float heat = clamp(f * 1.5 - uv.y * 0.4, 0.0, 1.0);
  vec3 col = mix(vec3(0.95, 0.15, 0.02), vec3(1.0, 0.62, 0.12), heat);
  col = mix(col, vec3(1.0, 0.92, 0.6), smoothstep(0.7, 1.0, f) * (1.0 - uv.y * 0.8));
  gl_FragColor = vec4(col * (0.9 + f * 1.4), min(1.0, f * 1.3));
}`

const SMOKE_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying float vPhase;
varying float vRise;
${NOISE}
void main() {
  vec2 uv = vUv;
  float t = uTime * 0.5 + vPhase * 23.0;
  float n = fbm(vec2(uv.x * 2.5 + vPhase * 5.0, uv.y * 2.5 - t));
  float d = length((uv - 0.5) * vec2(1.0, 1.2)) * 2.0;
  float a = (1.0 - smoothstep(0.35, 1.0, d)) * n * 0.55 * (1.0 - vRise) * smoothstep(0.0, 0.15, vRise);
  if (a < 0.015) discard;
  gl_FragColor = vec4(vec3(0.16, 0.15, 0.16), a);
}`

interface Particle {
  x: number
  y: number
  z: number
  size: number
  phase: number
  level: number
}

/**
 * Fire on hotspot rooftops: procedural flames (additive, bloom-bright) and
 * smoke puffs rising above them, as camera-facing quads. Everything animates
 * in the shader from a single time uniform.
 */
export function Flames({ city, timeline }: { city: City; timeline: TimelineData }) {
  const heightScale = useStore((s) => s.heightScale)
  const hideGenerated = useStore((s) => s.hideGenerated)
  const storeK = useStore((s) => s.k)
  const k = storeK

  const { flames, smoke } = useMemo(() => {
    const flames: Particle[] = []
    const smoke: Particle[] = []
    burningAt(timeline, k).forEach((fi) => {
      const f = city.files[fi]!
      if (hideGenerated && (f.generated || f.vendored)) return
      const level = fireAt(timeline, fi, k)
      if (level === 0) return
      const h = height(linesAt(timeline, fi, k), heightScale, city.stats.maxLines)
      // A cluster of overlapping tongues reads as one body of fire.
      const n = level === 3 ? 5 : level === 2 ? 3 : 2
      const base = Math.min(f.w, f.d)
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + fi
        const r = i === 0 ? 0 : 0.22
        flames.push({
          x: f.x + f.w * (0.5 + r * Math.cos(a)),
          y: h - 0.1,
          z: f.z + f.d * (0.5 + r * Math.sin(a)),
          size: base * (level === 3 ? 0.62 : level === 2 ? 0.5 : 0.4) * (i === 0 ? 1 : 0.8),
          phase: ((fi * 0.618 + i * 0.37) % 1),
          level,
        })
      }
      if (level >= 2) {
        for (let i = 0; i < 2; i++) {
          smoke.push({ x: f.x + f.w * 0.5, y: h + base * 0.6, z: f.z + f.d * 0.5, size: base * 0.5, phase: ((fi * 0.317 + i * 0.5) % 1), level })
        }
      }
    })
    return { flames, smoke }
  }, [city, timeline, k, heightScale, hideGenerated])

  return (
    <>
      <Particles items={flames} frag={FLAME_FRAG} smoke={false} />
      <Particles items={smoke} frag={SMOKE_FRAG} smoke />
    </>
  )
}

const QUAD = new THREE.PlaneGeometry(1, 1)

function Particles({ items, frag, smoke }: { items: Particle[]; frag: string; smoke: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null!)
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: frag,
        uniforms: { uTime: { value: 0 }, uSmoke: { value: smoke ? 1 : 0 } },
        transparent: true,
        depthWrite: false,
        blending: smoke ? THREE.NormalBlending : THREE.AdditiveBlending,
        toneMapped: false,
        fog: false,
      }),
    [frag, smoke],
  )
  const geometry = useMemo(() => {
    const g = QUAD.clone()
    const n = Math.max(1, items.length)
    const pos = new Float32Array(n * 3)
    const size = new Float32Array(n)
    const phase = new Float32Array(n)
    const level = new Float32Array(n)
    items.forEach((p, i) => {
      pos[i * 3] = p.x
      pos[i * 3 + 1] = p.y
      pos[i * 3 + 2] = p.z
      size[i] = p.size
      phase[i] = p.phase
      level[i] = p.level
    })
    g.setAttribute('aPos', new THREE.InstancedBufferAttribute(pos, 3))
    g.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 1))
    g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1))
    g.setAttribute('aLevel', new THREE.InstancedBufferAttribute(level, 1))
    return g
  }, [items])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => {
    if (mesh.current) mesh.current.count = items.length
  }, [items])
  useFrame(({ clock }) => {
    material.uniforms.uTime!.value = clock.elapsedTime
  })
  if (items.length === 0) return null
  return <instancedMesh ref={mesh} args={[geometry, material, Math.max(1, items.length)]} frustumCulled={false} renderOrder={smoke ? 6 : 5} />
}
