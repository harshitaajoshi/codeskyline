import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { CameraControls } from '@react-three/drei'
import { Bloom, EffectComposer, N8AO, Vignette } from '@react-three/postprocessing'
import type CameraControlsImpl from 'camera-controls'
import { useStore } from '../store'
import { cityBounds, height } from '../city/scales'
import { buildTimeline, linesAt, type TimelineData } from '../city/timeline'
import { ownerSlots } from '../city/colors'
import type { City } from '../city/types'
import { Buildings } from './Buildings'
import { Districts } from './Districts'
import { Flames } from './Flames'
import { Labels } from './Labels'
import { Lots } from './Lots'
import { Sky } from './Sky'
import { Walk } from './Walk'

const tlCache = new WeakMap<City, TimelineData>()
export function timelineFor(city: City): TimelineData {
  let t = tlCache.get(city)
  if (!t) {
    const slots = ownerSlots(city)
    t = buildTimeline(city, (a) => slots.get(a) ?? 255)
    tlCache.set(city, t)
  }
  return t
}

/**
 * The city. `hero` renders a slowly orbiting, non-interactive version for the
 * landing page; otherwise it is the full interactive scene.
 */
export function Scene({ city, hero = false }: { city: City; hero?: boolean }) {
  const { cx, cz, size } = cityBounds(city)
  const timeline = useMemo(() => timelineFor(city), [city])
  const setPointer = useStore((s) => s.setPointer)
  // The hero is pinned at "now"; the interactive scene follows the store.
  const fixedK = hero ? timeline.K - 1 : undefined

  return (
    <Canvas
      shadows
      dpr={[1, hero ? 1.5 : 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 42, near: 0.3, far: size * 12, position: [cx + size * 0.7, size * 0.6, cz + size * 0.9] }}
      onPointerMissed={() => !hero && useStore.getState().select(null)}
      onPointerMove={(e) => !hero && setPointer(e.clientX, e.clientY)}
      style={hero ? { pointerEvents: 'none' } : undefined}
    >
      <color attach="background" args={['#05070d']} />
      <fog attach="fog" args={['#0a0e1a', size * 1.4, size * 5]} />
      <Sky radius={size * 6} />
      <hemisphereLight args={['#6f8cc9', '#1a1f2e', 0.55]} />
      <directionalLight
        position={[cx + size * 0.5, size * 0.9, cz - size * 0.3]}
        intensity={1.3}
        color="#dfe8ff"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-size}
        shadow-camera-right={size}
        shadow-camera-top={size}
        shadow-camera-bottom={-size}
        shadow-camera-far={size * 3}
        shadow-bias={-0.0004}
      />
      <pointLight position={[cx, size * 0.25, cz]} intensity={size * 1.5} distance={size * 1.6} color="#ffb070" decay={2} />

      <mesh rotation-x={-Math.PI / 2} position={[cx, -0.02, cz]} receiveShadow>
        <planeGeometry args={[size * 8, size * 8]} />
        <meshStandardMaterial color="#090c15" roughness={1} />
      </mesh>

      <Districts city={city} />
      <Lots city={city} timeline={timeline} fixedK={fixedK} />
      <Buildings city={city} timeline={timeline} interactive={!hero} fixedK={fixedK} />
      <Flames city={city} timeline={timeline} fixedK={fixedK} />
      <Suspense fallback={null}>
        <Labels city={city} />
      </Suspense>

      {hero ? <HeroCamera city={city} /> : <Camera city={city} />}
      {!hero && <Playback />}
      {!hero && <Walk city={city} timeline={timeline} />}

      <EffectComposer>
        <N8AO aoRadius={3} intensity={2.5} distanceFalloff={1} halfRes />
        <Bloom luminanceThreshold={1} mipmapBlur intensity={0.9} radius={0.55} />
        <Vignette eskil={false} offset={0.25} darkness={0.75} />
      </EffectComposer>
    </Canvas>
  )
}

/** Advances the timeline while playing. Lives in the render loop, not React state per frame. */
function Playback() {
  useFrame((_, dt) => {
    const s = useStore.getState()
    if (!s.playing || !s.city) return
    const last = Math.max(0, s.city.timeline.keyframes.length - 1)
    const next = s.t + dt * s.speed
    if (next >= last) {
      s.setT(last)
      s.setPlaying(false)
    } else {
      s.setT(next)
    }
  })
  return null
}

/** Orbit camera with a cinematic fly-in and smooth fly-to on selection. */
function Camera({ city }: { city: City }) {
  const ref = useRef<CameraControlsImpl>(null!)
  const flyTo = useStore((s) => s.flyTo)
  const heightScale = useStore((s) => s.heightScale)
  const walking = useStore((s) => s.walking)
  const consume = useStore((s) => s.consumeFlyTo)
  const { cx, cz, size } = cityBounds(city)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    // Start far out and high, then glide in — unless a link asked for a
    // specific building, in which case the fly-to below takes over.
    void c.setLookAt(cx + size * 1.6, size * 1.4, cz + size * 2.2, cx, 0, cz, false)
    if (useStore.getState().flyTo != null) return
    const t = setTimeout(() => void c.setLookAt(cx + size * 0.55, size * 0.45, cz + size * 0.8, cx, size * 0.04, cz, true), 150)
    return () => clearTimeout(t)
  }, [city, cx, cz, size])

  // Leaving walk mode: return to the overview.
  const wasWalking = useRef(false)
  useEffect(() => {
    if (wasWalking.current && !walking) {
      void ref.current?.setLookAt(cx + size * 0.55, size * 0.45, cz + size * 0.8, cx, size * 0.04, cz, true)
    }
    wasWalking.current = walking
  }, [walking, cx, cz, size])

  useEffect(() => {
    if (flyTo == null) return
    const f = city.files[flyTo]
    if (!f) return
    const s = useStore.getState()
    const h = height(linesAt(timelineFor(city), flyTo, s.k), heightScale, city.stats.maxLines)
    const tx = f.x + f.w / 2
    const tz = f.z + f.d / 2
    const dist = Math.max(8, h * 1.6, Math.max(f.w, f.d) * 4)
    // A beat after mount so it runs after the initial placement above. No
    // cleanup: consuming flyTo re-runs this effect and must not cancel it.
    setTimeout(() => {
      void ref.current?.setLookAt(tx + dist * 0.7, h * 0.7 + dist * 0.6, tz + dist * 0.8, tx, h * 0.5, tz, true)
      consume()
    }, 200)
  }, [flyTo, city, heightScale, consume])

  return (
    <CameraControls
      ref={ref}
      makeDefault
      enabled={!walking}
      minDistance={2}
      maxDistance={size * 4}
      maxPolarAngle={Math.PI / 2 - 0.02}
      smoothTime={0.6}
      draggingSmoothTime={0.12}
    />
  )
}

/** Landing page: a slow orbit around the city, no input. */
function HeroCamera({ city }: { city: City }) {
  const ref = useRef<CameraControlsImpl>(null!)
  const { cx, cz, size } = cityBounds(city)
  useEffect(() => {
    void ref.current?.setLookAt(cx + size * 0.5, size * 0.22, cz + size * 0.7, cx, size * 0.06, cz, false)
  }, [cx, cz, size])
  useFrame((_, dt) => {
    const c = ref.current
    if (!c) return
    c.azimuthAngle += dt * 0.05
    c.update(dt)
  })
  return <CameraControls ref={ref} enabled={false} smoothTime={0} />
}
