import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { MeshReflectorMaterial } from '@react-three/drei'
import { cityBounds } from '../city/scales'
import type { City } from '../city/types'
import { LampPosts, type Placed } from './Streets'

const QUAY = 2.6 // promenade between the last district and the water
const LAMP_SPACING = 9

/** Overlapping sine ripples as a tiling normal map, scrolled for motion. */
function rippleNormals(): THREE.DataTexture {
  const size = 128
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2
      const v = (y / size) * Math.PI * 2
      // Partial derivatives of a few waves give the slope at each texel.
      const dx = Math.cos(u * 3 + v) * 3 + Math.cos(u * 7 - v * 2) * 1.5 + Math.cos(u * 13 + v * 5) * 0.6
      const dz = Math.cos(u * 3 + v) * 1 + Math.cos(u * 7 - v * 2) * -1 + Math.cos(u * 13 + v * 5) * 2.2
      const n = new THREE.Vector3(-dx * 0.08, 1, -dz * 0.08).normalize()
      const i = (y * size + x) * 4
      data[i] = Math.round((n.x * 0.5 + 0.5) * 255)
      data[i + 1] = Math.round((n.z * 0.5 + 0.5) * 255)
      data[i + 2] = Math.round((n.y * 0.5 + 0.5) * 255)
      data[i + 3] = 255
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.magFilter = THREE.LinearFilter
  t.generateMipmaps = true
  t.needsUpdate = true
  return t
}

/**
 * The city sits on a harbour. Past the last district on the sunset side
 * there is a promenade with lamps, a sea wall, and dark water that carries
 * the skyline's reflection. The water is the one big reflector in the scene.
 */
export function Waterfront({ city }: { city: City }) {
  const { size } = cityBounds(city)
  const root = city.dirs.find((d) => d.depth === 0) ?? city.dirs[0]
  const normals = useMemo(() => rippleNormals(), [])
  useEffect(() => () => normals.dispose(), [normals])
  const water = useRef<THREE.Mesh>(null!)

  const lamps = useMemo<Placed[]>(() => {
    if (!root) return []
    const out: Placed[] = []
    const z = root.z - QUAY * 0.55
    const n = Math.max(2, Math.round(root.w / LAMP_SPACING))
    for (let i = 0; i < n; i++) out.push({ x: root.x + (root.w * (i + 0.5)) / n, y: 0.1, z, yaw: -Math.PI / 2 })
    return out
  }, [root])

  useFrame((_, dt) => {
    normals.offset.x += dt * 0.012
    normals.offset.y += dt * 0.007
  })

  if (!root) return null
  const cx = root.x + root.w / 2
  const reach = size * 4
  const waterZ = root.z - QUAY
  return (
    <group>
      {/* Promenade and sea wall. */}
      <mesh position={[cx, 0.05, root.z - QUAY / 2]} receiveShadow>
        <boxGeometry args={[root.w + QUAY * 2, 0.1, QUAY]} />
        <meshStandardMaterial color="#3a3835" roughness={0.95} />
      </mesh>
      <mesh position={[cx, 0.12, waterZ + 0.12]}>
        <boxGeometry args={[root.w + QUAY * 2, 0.24, 0.24]} />
        <meshStandardMaterial color="#2a2927" roughness={0.9} />
      </mesh>
      <LampPosts lamps={lamps} />
      {/* Water: a slow, rippled mirror. */}
      <mesh ref={water} rotation-x={-Math.PI / 2} position={[cx, 0.0, waterZ - reach / 2]}>
        <planeGeometry args={[root.w + reach * 2, reach]} />
        <MeshReflectorMaterial
          blur={[500, 160]}
          resolution={768}
          mixBlur={0.6}
          mixStrength={5}
          depthScale={0}
          color="#0b111c"
          roughness={0.35}
          metalness={0.7}
          mirror={0.85}
          normalMap={normals}
          normalScale={new THREE.Vector2(0.35, 0.35)}
          distortionMap={normals}
          distortion={0.25}
        />
      </mesh>
    </group>
  )
}
