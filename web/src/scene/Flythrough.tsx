import { useEffect, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type CameraControlsImpl from 'camera-controls'
import { useStore } from '../store'
import { storyTargets } from '../story'
import { cityBounds, height } from '../city/scales'
import { linesAt } from '../city/timeline'
import type { City } from '../city/types'
import { timelineFor } from './Scene'

interface Shot {
  at: number // seconds from the start
  run: () => void
}

/**
 * The cinematic flythrough: a fixed sequence of shots over the city's
 * findings, ending with the whole history replayed from a wide angle.
 * Driven by elapsed time in the render loop so Escape stops it cleanly.
 */
export function Flythrough({ city, controls }: { city: City; controls: RefObject<CameraControlsImpl | null> }) {
  const filming = useStore((s) => s.filming)
  const start = useRef<number | null>(null)
  const next = useRef(0)
  const shots = useRef<Shot[]>([])

  useEffect(() => {
    const c = controls.current
    const s = useStore.getState()
    if (!filming || !c) return
    const { cx, cz, size } = cityBounds(city)
    const t = storyTargets(city)
    const tl = timelineFor(city)
    const last = Math.max(0, city.timeline.keyframes.length - 1)
    const heightScale = s.heightScale
    const wide = (azimuthOffset: number) => {
      void c.setLookAt(cx + size * 0.9 * Math.cos(azimuthOffset), size * 0.45, cz + size * 0.9 * Math.sin(azimuthOffset), cx, size * 0.04, cz, true)
    }
    const at = (fi: number, mult = 1) => {
      const f = city.files[fi]
      if (!f) return
      const h = height(linesAt(tl, fi, last), heightScale, city.stats.maxLines)
      const tx = f.x + f.w / 2
      const tz = f.z + f.d / 2
      const dist = Math.max(16, h * 2.4, Math.max(f.w, f.d) * 6) * mult
      void c.setLookAt(tx + dist * 0.75, h * 0.6 + dist * 0.5, tz + dist * 0.9, tx, h * 0.45, tz, true)
    }
    const prevSmooth = c.smoothTime
    c.smoothTime = 1.6
    s.select(null)
    s.setPlaying(false)
    s.goLive()
    s.setMode('churn')
    s.setShowCoupling(false)
    shots.current = [
      { at: 0, run: () => wide(0.9) },
      { at: 5, run: () => (t.tallest != null ? at(t.tallest) : wide(1.6)) },
      {
        at: 10,
        run: () => {
          s.setMode('hotspots')
          if (t.fire != null) at(t.fire, 1.6)
        },
      },
      {
        at: 16,
        run: () => {
          s.setMode('churn')
          if (t.pair) {
            s.setShowCoupling(true)
            s.select(t.pair.a)
            at(t.pair.a, 2.2)
          }
        },
      },
      {
        at: 22,
        run: () => {
          s.select(null)
          s.setShowCoupling(false)
          s.setMode('activity')
          wide(2.4)
          s.setT(0)
          s.setSpeed(Math.max(4, last / 14))
          s.setPlaying(true)
        },
      },
      {
        at: 38,
        run: () => {
          s.setPlaying(false)
          s.goLive()
          s.setMode('churn')
          s.setSpeed(12)
          s.setFilming(false)
        },
      },
    ]
    start.current = null
    next.current = 0
    return () => {
      c.smoothTime = prevSmooth
      const st = useStore.getState()
      if (st.playing) st.setPlaying(false)
      st.setSpeed(12)
      st.setShowCoupling(true)
    }
  }, [filming, city, controls])

  useFrame(({ clock }) => {
    if (!filming) return
    const c = controls.current
    if (!c) return
    if (start.current == null) start.current = clock.elapsedTime
    const elapsed = clock.elapsedTime - start.current
    const list = shots.current
    while (next.current < list.length && elapsed >= list[next.current]!.at) list[next.current++]!.run()
    // A slow drift between cuts keeps the frame alive.
    c.azimuthAngle += 0.04 * (1 / 60)
  })

  return null
}
