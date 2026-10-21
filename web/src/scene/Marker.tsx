import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useStore } from '../store'
import { height } from '../city/scales'
import { linesAt, type TimelineData } from '../city/timeline'
import type { City } from '../city/types'

/**
 * Points out the selected building: a pulsing ring on the ground around its
 * lot, a light column, and (via the HUD) a name tag. The tag is plain DOM —
 * each frame the building's top is projected to screen space and written to
 * the store, which avoids drei's Html (a second React root) entirely.
 */
export function Marker({ city, timeline, beam: showBeam = true }: { city: City; timeline: TimelineData; beam?: boolean }) {
  const selected = useStore((s) => s.selected)
  const k = useStore((s) => s.k)
  const heightScale = useStore((s) => s.heightScale)
  const walking = useStore((s) => s.walking)
  const ring = useRef<THREE.Mesh>(null!)
  const beam = useRef<THREE.Mesh>(null!)
  const v = useMemo(() => new THREE.Vector3(), [])

  const f = selected == null ? undefined : city.files[selected]
  const show = !!f && !walking
  const h = f ? height(linesAt(timeline, f.id, k), heightScale, city.stats.maxLines) : 0
  const cx = f ? f.x + f.w / 2 : 0
  const cz = f ? f.z + f.d / 2 : 0
  const r = f ? Math.max(f.w, f.d) * 0.85 : 1
  const plateY = f ? 0.08 * (city.dirs[f.dir]?.depth ?? 0) + 0.3 : 0

  useFrame(({ clock, camera, size }) => {
    const t = clock.elapsedTime
    if (ring.current) {
      const s = 1 + 0.08 * Math.sin(t * 3)
      ring.current.scale.set(s, s, 1)
      ;(ring.current.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.35 * Math.sin(t * 3)
    }
    if (beam.current) (beam.current.material as THREE.MeshBasicMaterial).opacity = 0.16 + 0.08 * Math.sin(t * 2)
    const st = useStore.getState()
    if (!show) {
      if (st.markerScreen.visible) st.setMarkerScreen({ x: 0, y: 0, visible: false })
      return
    }
    v.set(cx, h + 0.4, cz).project(camera)
    const x = ((v.x + 1) / 2) * size.width
    const y = ((1 - v.y) / 2) * size.height
    const visible = v.z < 1 && x > -200 && x < size.width + 200 && y > -200 && y < size.height + 200
    const m = st.markerScreen
    if (m.visible !== visible || Math.abs(m.x - x) > 0.5 || Math.abs(m.y - y) > 0.5) st.setMarkerScreen({ x, y, visible })
  })

  return (
    <group visible={show}>
      <mesh ref={ring} position={[cx, plateY, cz]} rotation-x={-Math.PI / 2} renderOrder={4}>
        <ringGeometry args={[r, r + 0.25, 48]} />
        <meshBasicMaterial color="#e7633b" transparent opacity={0.7} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={beam} visible={showBeam} position={[cx, h + 8, cz]} renderOrder={4}>
        <cylinderGeometry args={[r * 0.3, r * 0.5, 16, 16, 1, true]} />
        <meshBasicMaterial color="#e7633b" transparent opacity={0.2} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
    </group>
  )
}
