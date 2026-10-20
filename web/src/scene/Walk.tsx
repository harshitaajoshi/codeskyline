import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import { useStore } from '../store'

type PLC = React.ComponentRef<typeof PointerLockControls>
import { cityBounds } from '../city/scales'
import { linesAt, type TimelineData } from '../city/timeline'
import type { City } from '../city/types'

const EYE = 1.7
const SPEED = 14
const RADIUS = 0.45
const CELL = 12

/**
 * First-person walk mode: pointer lock + WASD, sliding collision against
 * every standing building at the current keyframe, bounded to the city.
 */
export function Walk({ city, timeline }: { city: City; timeline: TimelineData }) {
  const walking = useStore((s) => s.walking)
  const setWalking = useStore((s) => s.setWalking)
  const k = useStore((s) => s.k)
  const { camera } = useThree()
  const controls = useRef<PLC>(null!)
  const keys = useRef<Record<string, boolean>>({})

  // Spatial hash of lots so collision checks stay cheap in big cities.
  const grid = useMemo(() => {
    const m = new Map<string, number[]>()
    city.files.forEach((f, i) => {
      for (let cx = Math.floor(f.x / CELL); cx <= Math.floor((f.x + f.w) / CELL); cx++)
        for (let cz = Math.floor(f.z / CELL); cz <= Math.floor((f.z + f.d) / CELL); cz++) {
          const key = `${cx},${cz}`
          const arr = m.get(key)
          if (arr) arr.push(i)
          else m.set(key, [i])
        }
    })
    return m
  }, [city])

  useEffect(() => {
    const down = (e: KeyboardEvent) => (keys.current[e.code] = true)
    const up = (e: KeyboardEvent) => (keys.current[e.code] = false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // Drop onto a street near the city centre when walking starts.
  useEffect(() => {
    if (!walking) return
    const { cx, cz } = cityBounds(city)
    const root = city.dirs[0]!
    camera.position.set(cx, EYE, root.z + root.d - 0.6)
    camera.lookAt(cx, EYE, cz)
    const t = setTimeout(() => controls.current?.lock(), 50)
    return () => clearTimeout(t)
  }, [walking, city, camera])

  const blocked = (x: number, z: number) => {
    const cx = Math.floor(x / CELL)
    const cz = Math.floor(z / CELL)
    for (let i = cx - 1; i <= cx + 1; i++)
      for (let j = cz - 1; j <= cz + 1; j++) {
        const arr = grid.get(`${i},${j}`)
        if (!arr) continue
        for (const fi of arr) {
          const f = city.files[fi]!
          if (linesAt(timeline, fi, k) <= 0) continue
          if (x > f.x - RADIUS && x < f.x + f.w + RADIUS && z > f.z - RADIUS && z < f.z + f.d + RADIUS) return true
        }
      }
    return false
  }

  const fwd = useMemo(() => new THREE.Vector3(), [])
  const right = useMemo(() => new THREE.Vector3(), [])
  useFrame((_, dt) => {
    if (!walking || !controls.current?.isLocked) return
    const kk = keys.current
    const speed = SPEED * (kk.ShiftLeft || kk.ShiftRight ? 2 : 1) * Math.min(dt, 0.05)
    camera.getWorldDirection(fwd)
    fwd.y = 0
    fwd.normalize()
    right.set(-fwd.z, 0, fwd.x)
    let dx = 0
    let dz = 0
    if (kk.KeyW || kk.ArrowUp) (dx += fwd.x * speed), (dz += fwd.z * speed)
    if (kk.KeyS || kk.ArrowDown) (dx -= fwd.x * speed), (dz -= fwd.z * speed)
    if (kk.KeyD || kk.ArrowRight) (dx += right.x * speed), (dz += right.z * speed)
    if (kk.KeyA || kk.ArrowLeft) (dx -= right.x * speed), (dz -= right.z * speed)
    if (dx === 0 && dz === 0) return
    const root = city.dirs[0]!
    const clampX = (x: number) => Math.min(root.x + root.w + 6, Math.max(root.x - 6, x))
    const clampZ = (z: number) => Math.min(root.z + root.d + 6, Math.max(root.z - 6, z))
    const nx = clampX(camera.position.x + dx)
    const nz = clampZ(camera.position.z + dz)
    // Slide: try each axis on its own so walls do not stop you dead.
    if (!blocked(nx, camera.position.z)) camera.position.x = nx
    if (!blocked(camera.position.x, nz)) camera.position.z = nz
    camera.position.y = EYE
  })

  if (!walking) return null
  return <PointerLockControls ref={controls} onUnlock={() => setWalking(false)} />
}
