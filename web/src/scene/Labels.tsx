import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { cityBounds } from '../city/scales'
import type { City, Dir } from '../city/types'

/**
 * District signs. Each top-level district (and the larger second-level
 * ones) gets a sign at its near corner: the name on a thin post, facing the
 * camera, kept at a readable size on screen whatever the zoom. Deeper
 * districts only show their sign when the camera is close.
 */
export function Labels({ city }: { city: City }) {
  const signs = useMemo(() => pickSigns(city), [city])
  const { size } = cityBounds(city)
  const groups = useRef<(THREE.Group | null)[]>([])
  const v = useMemo(() => new THREE.Vector3(), [])

  useFrame(({ camera }) => {
    for (let i = 0; i < signs.length; i++) {
      const g = groups.current[i]
      const s = signs[i]!
      if (!g) continue
      const dist = v.set(s.x, s.y, s.z).distanceTo(camera.position)
      // Fade deeper signs in as the camera approaches; top-level signs always show.
      const reach = s.depth === 1 ? Infinity : s.depth === 2 ? size * 0.75 : size * 0.3
      const visible = dist < reach
      g.visible = visible
      if (!visible) continue
      // Constant size on screen: scale with distance, within limits.
      const k = s.depth === 1 ? 0.021 : s.depth === 2 ? 0.013 : 0.011
      const sc = Math.min(size * 0.06, Math.max(0.8, dist * k))
      g.scale.setScalar(sc)
      g.quaternion.copy(camera.quaternion)
    }
  })

  return (
    <group>
      {signs.map((s, i) => (
        <group
          key={s.dir.id}
          position={[s.x, s.y, s.z]}
          ref={(g) => {
            groups.current[i] = g
          }}
        >
          {/* The post: a thin line from the ground up to the name; top-level only. */}
          {s.depth === 1 && (
            <mesh position={[0, 0.6, 0]}>
              <planeGeometry args={[0.03, 1.2]} />
              <meshBasicMaterial color="#e7633b" toneMapped={false} transparent opacity={0.9} depthTest={false} />
            </mesh>
          )}
          <Text
            position={[0, s.depth === 1 ? 1.35 : 0.5, 0]}
            fontSize={s.depth === 1 ? 0.62 : 0.5}
            color="#f1efe8"
            outlineWidth={0.07}
            outlineColor="#0c0c0c"
            outlineOpacity={0.9}
            letterSpacing={0.06}
            anchorX="center"
            anchorY="bottom"
            whiteSpace="nowrap"
            renderOrder={8}
            material-depthTest={false}
          >
            {s.text}
          </Text>
        </group>
      ))}
    </group>
  )
}

interface Sign {
  dir: Dir
  depth: number
  text: string
  x: number
  y: number
  z: number
}

function pickSigns(city: City): Sign[] {
  const out: Sign[] = []
  for (const d of city.dirs) {
    if (d.depth === 0 || d.depth > 3 || d.files < 3) continue
    if (d.depth === 2 && d.files < 6) continue
    if (d.depth === 3 && d.files < 12) continue
    const name = d.path.slice(d.path.lastIndexOf('/') + 1)
    out.push({
      dir: d,
      depth: d.depth,
      text: d.depth === 1 ? name.toUpperCase() : name,
      // Near-left corner of the plate, on the sidewalk, toward the default camera.
      x: d.x + 0.35,
      y: 0.08 * d.depth + 0.08,
      z: d.z + d.d - 0.2,
    })
  }
  return out
}
