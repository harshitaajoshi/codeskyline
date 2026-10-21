import { useMemo } from 'react'
import * as THREE from 'three'
import { Stars } from '@react-three/drei'

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
  float toward = 0.5 + 0.5 * dot(normalize(vec3(vDir.x, 0.0, vDir.z)), normalize(vec3(uSun.x, 0.0, uSun.z)));
  float band = pow(1.0 - clamp(h * 3.5, 0.0, 1.0), 2.5);
  c += uGlow * band * (0.25 + 0.75 * pow(toward, 3.0));
  gl_FragColor = vec4(c, 1.0);
}`

/** Dusk sky colors; one place so the environment map matches the dome. */
export function makeSkyMaterial(sun: THREE.Vector3): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uZenith: { value: new THREE.Color('#0b1024') },
      uMid: { value: new THREE.Color('#1c2546') },
      uHorizon: { value: new THREE.Color('#4a3a40') },
      uGlow: { value: new THREE.Color('#a85e32') },
      uSun: { value: sun.clone() },
    },
  })
}

/** Dusk: a blue dome fading to a warm horizon on the sun's side, and stars. */
export function Sky({ radius, sun }: { radius: number; sun: THREE.Vector3 }) {
  const material = useMemo(() => makeSkyMaterial(sun), [sun])
  return (
    <>
      <mesh material={material} frustumCulled={false}>
        <sphereGeometry args={[radius, 32, 16]} />
      </mesh>
      <Stars radius={radius * 0.8} depth={radius * 0.2} count={1800} factor={radius * 0.01} saturation={0} fade speed={0.3} />
    </>
  )
}
