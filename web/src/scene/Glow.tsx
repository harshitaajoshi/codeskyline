import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useStore } from '../store'
import type { TimelineData } from '../city/timeline'
import type { City } from '../city/types'
import { atmosphere } from './atmosphere'

const QUAD = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)

// Injected into MeshBasicMaterial so three handles instancing and colour
// space. Every pow() base is clamped: on ANGLE's Metal backend a base a hair
// below zero returns NaN, and one NaN pixel turns the whole frame black once
// the bloom's mipmap blur has smeared it.
const VERT_PARS = /* glsl */ `
attribute float aFile;
uniform sampler2D uLines;
uniform sampler2D uMeta;
uniform float uT;
uniform int uK;
uniform int uTexW;
uniform float uActScale;
varying vec2 vGlowUv;
varying float vLit;
ivec2 glowTexel(int idx) { return ivec2(idx % uTexW, idx / uTexW); }
`
const VERT_MAIN = /* glsl */ `
vGlowUv = uv;
{
  int f = int(aFile + 0.5);
  float t = clamp(uT, 0.0, float(uK - 1));
  int k0 = int(floor(t));
  int k1 = min(k0 + 1, uK - 1);
  float fr = t - float(k0);
  float lines = mix(texelFetch(uLines, glowTexel(f * uK + k0), 0).r, texelFetch(uLines, glowTexel(f * uK + k1), 0).r, fr);
  vec4 m0 = texelFetch(uMeta, glowTexel(f * uK + k0), 0);
  vec4 m1 = texelFetch(uMeta, glowTexel(f * uK + k1), 0);
  // Same measure the facades use for lit windows: cumulative churn plus the current burst.
  float act = clamp(mix(m0.a, m1.a, fr) * 0.6 + max(m0.r * (1.0 - fr), m1.r * fr) * 255.0 / max(1e-3, uActScale), 0.0, 1.0);
  vLit = lines > 40.0 ? 0.35 + 0.65 * act : 0.0;
}
`
const FRAG_PARS = /* glsl */ `
varying vec2 vGlowUv;
varying float vLit;
uniform float uNight;
`
const FRAG_MAIN = /* glsl */ `
{
  // Soft box falloff from the building's footprint out to the quad's edge.
  vec2 e = 1.0 - abs(vGlowUv * 2.0 - 1.0);
  float a = clamp(pow(max(0.0, e.x * e.y), 0.7) * 0.42 * vLit * uNight, 0.0, 1.0);
  diffuseColor.rgb *= a;
  diffuseColor.a = a;
}
`

/**
 * Storefront glow: lit ground floors spill warm light onto the pavement
 * around the building. One additive quad per building, sized a little
 * wider than its lot, with the same keyframe textures driving how lit it is.
 */
export function Glow({ city, timeline, uniforms }: { city: City; timeline: TimelineData; uniforms: Record<string, THREE.IUniform> }) {
  const mesh = useRef<THREE.InstancedMesh>(null!)
  const hideGenerated = useStore((s) => s.hideGenerated)
  const night = useMemo(() => ({ value: 1 }), [])
  const material = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.0, 0.78, 0.5),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    m.customProgramCacheKey = () => 'csky-glow'
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        uLines: uniforms.uLines!,
        uMeta: uniforms.uMeta!,
        uT: uniforms.uT!,
        uK: uniforms.uK!,
        uTexW: uniforms.uTexW!,
        uActScale: uniforms.uActScale!,
        uNight: night,
      })
      shader.vertexShader = VERT_PARS + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_MAIN)
      shader.fragmentShader = FRAG_PARS + shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_MAIN)
    }
    return m
  }, [uniforms, night])
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
    night.value = atmosphere.night
  })

  return <instancedMesh ref={mesh} args={[QUAD, material, Math.max(1, city.files.length)]} frustumCulled={false} raycast={() => null} renderOrder={2} />
}
