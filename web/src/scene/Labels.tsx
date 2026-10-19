import { useMemo } from 'react'
import { Text } from '@react-three/drei'
import type { City, Dir } from '../city/types'

/**
 * District names painted on the ground along each district's near edge.
 * Only the larger, shallower districts get labels; deep alleys would just be
 * noise from any distance a whole city is viewed at.
 */
export function Labels({ city }: { city: City }) {
  const labels = useMemo(() => pickLabels(city), [city])
  return (
    <group>
      {labels.map((l) => (
        <Text
          key={l.dir.id}
          position={[l.x, 0.08 * l.dir.depth + 0.12, l.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={l.size}
          color="#9fb0d0"
          fillOpacity={0.85}
          anchorX="left"
          anchorY="top"
          maxWidth={l.dir.w - l.size}
          clipRect={[0, -l.size * 1.3, l.dir.w - l.size, 0]}
          renderOrder={2}
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
  z: number
  size: number
}

function pickLabels(city: City): Label[] {
  const out: Label[] = []
  const root = city.dirs[0]
  if (!root) return out
  const citySide = Math.max(root.w, root.d)
  for (const d of city.dirs) {
    if (d.depth === 0 || d.depth > 3) continue
    const side = Math.min(d.w, d.d)
    // Big enough to matter: at least ~4% of the city's side, or many files.
    if (side < citySide * 0.04 && d.files < 25) continue
    const name = d.path.slice(d.path.lastIndexOf('/') + 1)
    const size = Math.max(0.9, Math.min(side * 0.14, citySide * 0.022))
    out.push({ dir: d, text: name, x: d.x + size * 0.5, z: d.z + size * 0.4, size })
  }
  return out
}
