import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { atmosphere } from './atmosphere'

const COUNT = 4000
const BOX = 36 // streaks live in a cube this wide around the camera
const LEN = 0.7

const VERT = /* glsl */ `
attribute float seed;
attribute float tip;
uniform float uTime;
uniform float uBox;
varying float vFade;
void main() {
  float speed = 14.0 + 8.0 * seed;
  vec3 p = position;
  // Fall and wrap inside the box; a little sideways drift for wind.
  p.y = mod(p.y - uTime * speed, uBox) - uBox * 0.5;
  p.x += sin(uTime * 0.7 + seed * 6.28) * 0.6;
  p.y += tip * ${LEN.toFixed(2)};
  vFade = tip;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`

const FRAG = /* glsl */ `
uniform float uAmount;
varying float vFade;
void main() {
  float a = (0.35 - 0.25 * vFade) * uAmount;
  gl_FragColor = vec4(0.75, 0.82, 0.95, a);
}`

/**
 * Rain: a cloud of falling streaks that rides along with the camera, so
 * it is always raining where you are looking. Positions are static; the
 * shader does the falling. `atmosphere.rain` fades it in and out.
 */
export function Rain() {
  const group = useRef<THREE.Group>(null!)
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: { uTime: { value: 0 }, uBox: { value: BOX }, uAmount: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [],
  )
  const geometry = useMemo(() => {
    const pos = new Float32Array(COUNT * 2 * 3)
    const seed = new Float32Array(COUNT * 2)
    const tip = new Float32Array(COUNT * 2)
    let s = 3
    const rnd = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff
      return s / 0x7fffffff
    }
    for (let i = 0; i < COUNT; i++) {
      const x = (rnd() - 0.5) * BOX
      const y = rnd() * BOX
      const z = (rnd() - 0.5) * BOX
      const r = rnd()
      for (let v = 0; v < 2; v++) {
        const j = i * 2 + v
        pos[j * 3] = x
        pos[j * 3 + 1] = y
        pos[j * 3 + 2] = z
        seed[j] = r
        tip[j] = v
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1))
    g.setAttribute('tip', new THREE.BufferAttribute(tip, 1))
    return g
  }, [])

  useFrame(({ camera, clock }) => {
    const amount = atmosphere.rain
    material.uniforms.uAmount!.value = amount
    material.uniforms.uTime!.value = clock.elapsedTime
    const g = group.current
    if (!g) return
    g.visible = amount > 0.01
    // Keep the cloud centred a little ahead of the camera.
    const dir = camera.getWorldDirection(new THREE.Vector3())
    g.position.copy(camera.position).addScaledVector(dir, BOX * 0.3)
  })

  return (
    <group ref={group}>
      <lineSegments geometry={geometry} material={material} frustumCulled={false} />
    </group>
  )
}
