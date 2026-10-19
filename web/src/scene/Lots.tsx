import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useStore } from '../store'
import type { TimelineData } from '../city/timeline'
import type { City } from '../city/types'

const SLAB = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)

/**
 * A thin foundation under every lot that exists at the current keyframe.
 * Under a standing building it is hidden; where a file has been deleted it
 * remains as a dark footprint, so the present-day city shows the outline of
 * what used to be there.
 */
export function Lots({ city, timeline }: { city: City; timeline: TimelineData }) {
  const mesh = useRef<THREE.InstancedMesh>(null!)
  const hideGenerated = useStore((s) => s.hideGenerated)
  const k = useStore((s) => s.k)
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: '#141a28', roughness: 1 }), [])

  useEffect(() => {
    const m = mesh.current
    const mat = new THREE.Matrix4()
    const pos = new THREE.Vector3()
    const scl = new THREE.Vector3()
    const q = new THREE.Quaternion()
    let n = 0
    city.files.forEach((f, fi) => {
      if (hideGenerated && (f.generated || f.vendored)) return
      const born = timeline.born[fi] ?? -1
      if (born < 0 || born > k) return
      const depth = city.dirs[f.dir]?.depth ?? 0
      pos.set(f.x + f.w / 2, 0.08 * depth + 0.08, f.z + f.d / 2)
      scl.set(f.w - 0.06, 0.05, f.d - 0.06)
      mat.compose(pos, q, scl)
      m.setMatrixAt(n++, mat)
    })
    m.count = n
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
  }, [city, timeline, k, hideGenerated])

  return <instancedMesh ref={mesh} args={[SLAB, material, Math.max(1, city.files.length)]} receiveShadow />
}
