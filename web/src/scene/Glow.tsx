import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useStore } from '../store'
import type { TimelineData } from '../city/timeline'
import type { City } from '../city/types'
import { atmosphere } from './atmosphere'

const QUAD = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)

const VERT = /* glsl */ `
attribute float aFile;
uniform sampler2D uLines;
uniform sampler2D uMeta;
uniform float uT;
uniform int uK;
uniform int uTexW;
uniform float uActScale;
varying vec2 vUv;
varying float vLit;
ivec2 texel(int idx) { return ivec2(idx % uTexW, idx / uTexW); }
void main() {
  vUv = uv;
  int f = int(aFile + 0.5);
  float t = clamp(uT, 0.0, float(uK - 1));
  int k0 = int(floor(t));
  int k1 = min(k0 + 1, uK - 1);
  float fr = t - float(k0);
  float lines = mix(texelFetch(uLines, texel(f * uK + k0), 0).r, texelFetch(uLines, texel(f * uK + k1), 0).r, fr);
  vec4 m0 = texelFetch(uMeta, texel(f * uK + k0), 0);
  vec4 m1 = texelFetch(uMeta, texel(f * uK + k1), 0);
  // Same measure the facades use for lit windows: cumulative churn plus the current burst.
  float act = clamp(mix(m0.a, m1.a, fr) * 0.6 + max(m0.r * (1.0 - fr), m1.r * fr) * 255.0 / uActScale, 0.0, 1.0);
  vLit = lines > 40.0 ? 0.35 + 0.65 * act : 0.0;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`

const FRAG = /* glsl */ `
varying vec2 vUv;
varying float vLit;
uniform float uNight;
void main() {
  // Soft box falloff from the building's footprint out to the quad's edge.
  vec2 e = 1.0 - abs(vUv * 2.0 - 1.0);
  float a = pow(e.x * e.y, 0.7) * 0.42 * vLit * uNight;
  gl_FragColor = vec4(vec3(1.0, 0.78, 0.5) * a, a);
}`

/**
 * Storefront glow: lit ground floors spill warm light onto the pavement
 * around the building. One additive quad per building, sized a little
 * wider than its lot, with the same keyframe textures driving how lit it is.
 */
export function Glow({ city, timeline, uniforms }: { city: City; timeline: TimelineData; uniforms: Record<string, THREE.IUniform> }) {
  const mesh = useRef<THREE.InstancedMesh>(null!)
  const hideGenerated = useStore((s) => s.hideGenerated)
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uLines: uniforms.uLines!,
          uMeta: uniforms.uMeta!,
          uT: uniforms.uT!,
          uK: uniforms.uK!,
          uTexW: uniforms.uTexW!,
          uActScale: uniforms.uActScale!,
          uNight: { value: 1 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [uniforms],
  )
  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    const m = mesh.current
    const mat = new THREE.Matrix4()
    const pos = new THREE.Vector3()
    const scl = new THREE.Vector3()
    const q = new THREE.Quaternion()
    const ids: number[] = []
    city.files.forEach((f, fi) => {
      if (hideGenerated && (f.generated || f.vendored)) return
      const depth = city.dirs[f.dir]?.depth ?? 0
      pos.set(f.x + f.w / 2, 0.08 * depth + 0.092, f.z + f.d / 2)
      scl.set(f.w + 0.7, 1, f.d + 0.7)
      mat.compose(pos, q, scl)
      m.setMatrixAt(ids.length, mat)
      ids.push(fi)
    })
    m.count = ids.length
    m.instanceMatrix.needsUpdate = true
    m.geometry.setAttribute('aFile', new THREE.InstancedBufferAttribute(new Float32Array(ids), 1))
    m.computeBoundingSphere()
  }, [city, timeline, hideGenerated])

  useFrame(() => {
    material.uniforms.uNight!.value = atmosphere.night
  })

  return <instancedMesh ref={mesh} args={[QUAD, material, Math.max(1, city.files.length)]} frustumCulled={false} raycast={() => null} renderOrder={2} />
}
