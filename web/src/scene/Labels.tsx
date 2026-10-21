import { useMemo } from 'react'
import { Text } from '@react-three/drei'
import type { City, Dir } from '../city/types'

/**
 * District names painted on the street just outside each district's near
 * edge (toward the default camera), so nothing inside the district can cover
 * them. Only shallow districts with real content get labels.
 */
export function Labels({ city }: { city: City }) {
  const labels = useMemo(() => pickLabels(city), [city])
  return (
    <group>
      {labels.map((l) => (
        <Text
          key={l.dir.id}
          position={[l.x, l.y, l.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={l.size}
          color="#d9d6cf"
          fillOpacity={0.95}
          anchorX="left"
          anchorY="top"
          whiteSpace="nowrap"
          clipRect={[0, -l.size * 1.4, l.dir.w, l.size * 0.2]}
          renderOrder={3}
        >
          {l.text}
        </Text>
      ))}
    </group>
  )
}

interface Label {
  dir: Dir
  text: string
  x: number
  y: number
  z: number
  size: number
}

// Mirrors layout.street in the analyzer: the gap between sibling districts.
function street(depth: number) {
  return Math.max(0.8, 3 - 0.6 * depth)
}

function pickLabels(city: City): Label[] {
  const out: Label[] = []
  for (const d of city.dirs) {
    if (d.depth === 0 || d.depth > 3 || d.files < 3) continue
    const gap = street(d.depth)
    const size = Math.max(0.6, Math.min(gap * 0.85, Math.min(d.w, d.d) * 0.14))
    out.push({
      dir: d,
      text: d.path.slice(d.path.lastIndexOf('/') + 1),
      x: d.x + 0.2,
      y: 0.08 * (d.depth - 1) + 0.11, // just above the parent's plate
      z: d.z + d.d + 0.18,
      size,
    })
  }
  return out
}
