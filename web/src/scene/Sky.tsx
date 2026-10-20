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
uniform vec3 uHorizon;
uniform vec3 uGlow;
void main() {
  float h = clamp(vDir.y, -0.1, 1.0);
  vec3 c = mix(uHorizon, uZenith, smoothstep(0.0, 0.55, h));
  // A warm city glow hugging the horizon.
  c += uGlow * pow(1.0 - clamp(h * 4.0, 0.0, 1.0), 3.0) * 0.6;
  gl_FragColor = vec4(c, 1.0);
}`

/** Night sky: gradient dome with a horizon glow, plus stars. */
export function Sky({ radius }: { radius: number }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uZenith: { value: new THREE.Color('#04060d') },
          uHorizon: { value: new THREE.Color('#141c33') },
          uGlow: { value: new THREE.Color('#3b2a4a') },
        },
      }),
    [],
  )
  return (
    <>
      <mesh material={material} frustumCulled={false}>
        <sphereGeometry args={[radius, 32, 16]} />
      </mesh>
      <Stars radius={radius * 0.8} depth={radius * 0.2} count={2500} factor={radius * 0.012} saturation={0} fade speed={0.3} />
    </>
  )
}
