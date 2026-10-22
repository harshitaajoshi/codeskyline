import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Stars } from '@react-three/drei'
import { atmosphere } from './atmosphere'
import { useStore } from '../store'
import { THEMES } from './themes'

/** Sky colours at dusk (the default) and in full day; blended by `atmosphere.night`. */
export const SKY_DUSK = { zenith: '#0b1024', mid: '#1c2546', horizon: '#4a3a40', glow: '#a85e32' }
export const SKY_DAY = { zenith: '#2a5096', mid: '#5f8cc8', horizon: '#a8a79e', glow: '#e8cfa0' }

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const FRAG = /* glsl */ `
varying vec3 vDir;
uniform vec3 uZenith;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform vec3 uSun;
void main() {
  float h = clamp(vDir.y, -0.1, 1.0);
  vec3 c = mix(uHorizon, uMid, smoothstep(0.0, 0.18, h));
  c = mix(c, uZenith, smoothstep(0.15, 0.7, h));
  // The last of the sun: a warm glow low on the horizon, brightest toward it.
  // Clamped: pow() of a base a hair below zero is NaN, and NaN spreads through the bloom.
  float toward = clamp(0.5 + 0.5 * dot(normalize(vec3(vDir.x, 0.0, vDir.z)), normalize(vec3(uSun.x, 0.0, uSun.z))), 0.0, 1.0);
  float band = pow(1.0 - clamp(h * 3.5, 0.0, 1.0), 2.5);
  c += uGlow * band * (0.25 + 0.75 * pow(toward, 3.0));
  gl_FragColor = vec4(c, 1.0);
}`

/** Dusk sky colors; one place so the environment map matches the dome. */
export function makeSkyMaterial(sun: THREE.Vector3, sky: typeof SKY_DUSK = SKY_DUSK): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uZenith: { value: new THREE.Color(sky.zenith) },
      uMid: { value: new THREE.Color(sky.mid) },
      uHorizon: { value: new THREE.Color(sky.horizon) },
      uGlow: { value: new THREE.Color(sky.glow) },
      uSun: { value: sun.clone() },
    },
  })
}

/** Dusk: a blue dome fading to a warm horizon on the sun's side, and stars. */
export function Sky({ radius, sun }: { radius: number; sun: THREE.Vector3 }) {
  const material = useMemo(() => makeSkyMaterial(sun), [sun])
  const stars = useRef<THREE.Group>(null!)
  const theme = useStore((s) => s.theme)
  const palette = useMemo(() => {
    const sky = THEMES[theme].sky
    const c = (k: keyof typeof SKY_DUSK) => ({ day: new THREE.Color(SKY_DAY[k]), dusk: new THREE.Color(sky[k]) })
    return { zenith: c('zenith'), mid: c('mid'), horizon: c('horizon'), glow: c('glow') }
  }, [theme])
  useFrame(() => {
    const n = atmosphere.night
    for (const key of ['zenith', 'mid', 'horizon', 'glow'] as const) {
      const u = material.uniforms[`u${key[0]!.toUpperCase()}${key.slice(1)}`]!.value as THREE.Color
      u.copy(palette[key].day).lerp(palette[key].dusk, n)
    }
    if (stars.current) stars.current.visible = n > 0.55
  })
  return (
    <>
      <mesh material={material} frustumCulled={false}>
        <sphereGeometry args={[radius, 32, 16]} />
      </mesh>
      <group ref={stars}>
        <Stars radius={radius * 0.8} depth={radius * 0.2} count={1800} factor={radius * 0.01} saturation={0} fade speed={0.3} />
      </group>
    </>
  )
}
