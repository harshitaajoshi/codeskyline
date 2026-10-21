import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useStore } from '../store'
import type { TimelineData } from '../city/timeline'
import type { City } from '../city/types'

const SLAB = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)
const BASE = new THREE.Color('#141a28')
const DELETED = new THREE.Color('#6e1f26') // diff lens: a file this change removed

/**
 * A thin foundation under every lot that exists at the current keyframe.
 * Under a standing building it is hidden; where a file has been deleted it
 * remains as a dark footprint, so the present-day city shows the outline of
 * what used to be there. In the diff lens, lots of deleted files turn red.
 */
export function Lots({ city, timeline, fixedK }: { city: City; timeline: TimelineData; fixedK?: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null!)
  const hideGenerated = useStore((s) => s.hideGenerated)
  const mode = useStore((s) => s.mode)
  const storeK = useStore((s) => s.k)
  const k = fixedK ?? storeK
  const material = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 1 }), [])
  const deletedIds = useMemo(() => new Set((city.diff?.files ?? []).filter((d) => d.status === 'deleted').map((d) => d.id)), [city])

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
      const red = mode === 'diff' && deletedIds.has(fi)
      pos.set(f.x + f.w / 2, 0.08 * depth + 0.08, f.z + f.d / 2)
      scl.set(f.w - 0.06, red ? 0.35 : 0.05, f.d - 0.06)
      mat.compose(pos, q, scl)
      m.setMatrixAt(n, mat)
      m.setColorAt(n, red ? DELETED : BASE)
      n++
    })
    m.count = n
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    m.computeBoundingSphere()
  }, [city, timeline, k, hideGenerated, mode, deletedIds])

  return <instancedMesh ref={mesh} args={[SLAB, material, Math.max(1, city.files.length)]} receiveShadow />
}
