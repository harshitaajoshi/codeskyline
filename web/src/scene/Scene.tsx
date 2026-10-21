import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { CameraControls, MeshReflectorMaterial } from '@react-three/drei'
import { Bloom, EffectComposer, N8AO, TiltShift2, Vignette } from '@react-three/postprocessing'
import type CameraControlsImpl from 'camera-controls'
import { useStore } from '../store'
import { BEATS, reducedMotion, storyTargets, useStory } from '../story'
import { cityBounds, height } from '../city/scales'
import { buildTimeline, linesAt, type TimelineData } from '../city/timeline'
import { ownerSlots } from '../city/colors'
import type { City } from '../city/types'
import { Buildings } from './Buildings'
import { Coupling } from './Coupling'
import { Districts } from './Districts'
import { FireLights } from './FireLights'
import { Flames } from './Flames'
import { Labels } from './Labels'
import { Lots } from './Lots'
import { Marker } from './Marker'
import { Sky, makeSkyMaterial } from './Sky'
import { Streets } from './Streets'
import { Traffic } from './Traffic'
import { Walk } from './Walk'
import { patchHeightFog } from './fog'

patchHeightFog()

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
  const walking = useStore((s) => s.walking)
  // The extra passes are worth it up to a mid-sized city; beyond that the
  // frame budget goes to the buildings.
  const n = city.files.length
  const wet = n <= 12000
  const traffic = n <= 30000
  // The sun sits low on the horizon: long shadows, and the sky glows on its side.
  const sun = useMemo(() => new THREE.Vector3(cx + size * 0.85, size * 0.22, cz - size * 0.5), [cx, cz, size])
  const sunDir = useMemo(() => new THREE.Vector3(size * 0.85, size * 0.22, -size * 0.5).normalize(), [size])

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
      <color attach="background" args={['#0e1120']} />
      <fog attach="fog" args={['#1b1e2c', size * 0.6, size * 4]} />
      <Sky radius={size * 6} sun={sunDir} />
      <DuskEnvironment sun={sunDir} />
      <hemisphereLight args={['#5d6f96', '#1c1b1f', 1.6]} />
      {/* A low sun: long shadows across the districts are most of the depth. */}
      <directionalLight
        position={sun.toArray()}
        intensity={3.2}
        color="#ffc08a"
        castShadow
        shadow-mapSize={[3072, 3072]}
        shadow-camera-left={-size * 1.15}
        shadow-camera-right={size * 1.15}
        shadow-camera-top={size * 1.15}
        shadow-camera-bottom={-size * 1.15}
        shadow-camera-near={0.5}
        shadow-camera-far={size * 4}
        shadow-bias={-0.0003}
        shadow-normalBias={0.02}
      />
      <pointLight position={[cx, size * 0.25, cz]} intensity={size * 1.5} distance={size * 1.6} color="#ffb070" decay={2} />

      <mesh rotation-x={-Math.PI / 2} position={[cx, -0.02, cz]} receiveShadow>
        <planeGeometry args={[size * 10, size * 10]} />
        <meshStandardMaterial color="#14161c" roughness={1} />
      </mesh>
      <DepthTuning size={size} />

      <Districts city={city} />
      <Streets city={city} />
      {wet && <WetStreets city={city} />}
      {traffic && <Traffic city={city} timeline={timeline} />}
      <Lots city={city} timeline={timeline} />
      <Buildings city={city} timeline={timeline} interactive={!hero} />
      <Flames city={city} timeline={timeline} />
      <FireLights city={city} timeline={timeline} />
      <Coupling city={city} timeline={timeline} />
      <Suspense fallback={null}>
        <Labels city={city} />
      </Suspense>

      <Marker city={city} timeline={timeline} beam={!hero} />
      {hero ? <HeroCamera city={city} /> : <Camera city={city} />}
      {!hero && <Playback />}
      {!hero && <Walk city={city} timeline={timeline} />}

      <EffectComposer>
        <N8AO aoRadius={3} intensity={2.5} distanceFalloff={1} halfRes />
        <Bloom luminanceThreshold={1} mipmapBlur intensity={0.9} radius={0.55} />
        {/* Tilt-shift: a focus band across the middle, so the city reads as a model on a table. */}
        {walking ? <></> : <TiltShift2 blur={hero ? 0.14 : 0.07} taper={hero ? 0.6 : 0.75} start={[0, 0.54]} end={[1, 0.54]} samples={6} />}
        <Vignette eskil={false} offset={0.25} darkness={0.75} />
      </EffectComposer>
    </Canvas>
  )
}

/**
 * The sky, baked into an environment map so glass and wet asphalt reflect
 * the dusk. Built once per city size from the same shader as the dome.
 */
function DuskEnvironment({ sun }: { sun: THREE.Vector3 }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const env = new THREE.Scene()
    const dome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), makeSkyMaterial(sun))
    env.add(dome)
    const tex = pmrem.fromScene(env, 0.04).texture
    scene.environment = tex
    scene.environmentIntensity = 1.1
    pmrem.dispose()
    dome.geometry.dispose()
    ;(dome.material as THREE.Material).dispose()
    return () => {
      scene.environment = null
      tex.dispose()
    }
  }, [gl, scene, sun])
  return null
}

/**
 * Wet streets: a blurred planar reflection just above the root plate. The
 * district plates sit higher and cover it, so only the streets between them
 * reflect the windows and the fire. Rendered once more per frame, hence the
 * size gate in Scene.
 */
function WetStreets({ city }: { city: City }) {
  const root = city.dirs.find((d) => d.depth === 0) ?? city.dirs[0]
  if (!root) return null
  return (
    <mesh rotation-x={-Math.PI / 2} position={[root.x + root.w / 2, 0.085, root.z + root.d / 2]} receiveShadow>
      <planeGeometry args={[root.w, root.d]} />
      <MeshReflectorMaterial
        blur={[260, 80]}
        resolution={768}
        mixBlur={0.9}
        mixStrength={9}
        depthScale={0}
        color="#232323"
        roughness={0.7}
        metalness={0.6}
        mirror={0.9}
      />
    </mesh>
  )
}

/**
 * Depth precision scales with the near plane. A big city hundreds of units
 * across with near=0.3 makes lots, plates and labels (a few cm apart)
 * z-fight and shimmer; pushing near out with city size fixes it. Walk mode
 * needs it tight again so nearby walls do not clip.
 */
function DepthTuning({ size }: { size: number }) {
  const walking = useStore((s) => s.walking)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  useEffect(() => {
    camera.near = walking ? 0.15 : Math.max(0.5, size * 0.004)
    camera.far = Math.max(2000, size * 14)
    camera.updateProjectionMatrix()
  }, [camera, size, walking])
  return null
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
    if (walking) return
    const c = ref.current
    if (!c) return
    // Start far out and high, then glide in — unless a link asked for a
    // specific building, in which case the fly-to below takes over. Also
    // runs when the controls come back after a walk.
    void c.setLookAt(cx + size * 1.6, size * 1.4, cz + size * 2.2, cx, 0, cz, false)
    if (useStore.getState().flyTo != null) return
    const t = setTimeout(() => void c.setLookAt(cx + size * 0.55, size * 0.45, cz + size * 0.8, cx, size * 0.04, cz, true), 150)
    return () => clearTimeout(t)
  }, [city, cx, cz, size, walking])

  useEffect(() => {
    if (flyTo == null) return
    const f = city.files[flyTo]
    if (!f) return
    const s = useStore.getState()
    const h = height(linesAt(timelineFor(city), flyTo, s.k), heightScale, city.stats.maxLines)
    const tx = f.x + f.w / 2
    const tz = f.z + f.d / 2
    // Far enough back that the whole building and its name tag fit.
    const dist = Math.max(16, h * 2.4, Math.max(f.w, f.d) * 6)
    // A beat after mount so it runs after the initial placement above. No
    // cleanup: consuming flyTo re-runs this effect and must not cancel it.
    setTimeout(() => {
      void ref.current?.setLookAt(tx + dist * 0.75, h * 0.6 + dist * 0.55, tz + dist * 0.9, tx, h * 0.45, tz, true)
      consume()
    }, 200)
  }, [flyTo, city, heightScale, consume])

  // While walking, the controls must not exist at all: even disabled, they
  // write the camera transform every frame and would fight the walk.
  if (walking) return null
  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={2}
      maxDistance={size * 4}
      maxPolarAngle={Math.PI / 2 - 0.02}
      smoothTime={0.6}
      draggingSmoothTime={0.12}
    />
  )
}

/**
 * Landing page: no input. A slow orbit on the wide beats, and a glide to
 * whichever building the story is talking about on the close ones. The
 * city is kept toward the right half; the copy sits on the left.
 */
function HeroCamera({ city }: { city: City }) {
  const ref = useRef<CameraControlsImpl>(null!)
  const beat = useStory((s) => s.beat)
  const heightScale = useStore((s) => s.heightScale)
  const { cx, cz, size } = cityBounds(city)
  const kind = BEATS[beat]
  const wide = kind == null || kind === 'hero' || kind === 'time' || kind === 'departure'
  const placed = useRef(false)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    // The first placement is a cut; every later one is a glide.
    const smooth = placed.current && !reducedMotion()
    placed.current = true
    const tl = timelineFor(city)
    const targets = storyTargets(city)
    const file = kind === 'buildings' ? targets.tallest : kind === 'hotspots' ? targets.fire : kind === 'bridges' ? targets.pair?.a : null
    const partner = kind === 'bridges' ? targets.pair?.b : null
    const f = file == null ? undefined : city.files[file]
    if (!f) {
      void c.setLookAt(cx + size * 0.36, size * 0.16, cz + size * 0.5, cx, size * 0.05, cz, smooth)
      void c.setFocalOffset(-size * 0.2, size * 0.03, 0, smooth)
      return
    }
    const last = Math.max(0, city.timeline.keyframes.length - 1)
    const h = height(linesAt(tl, f.id, last), heightScale, city.stats.maxLines)
    let tx = f.x + f.w / 2
    let tz = f.z + f.d / 2
    let dist = Math.max(18, h * 2.6, Math.max(f.w, f.d) * 7)
    const p = partner == null ? undefined : city.files[partner]
    if (p) {
      // Frame both ends of the bridge.
      const px = p.x + p.w / 2
      const pz = p.z + p.d / 2
      dist = Math.max(dist, Math.hypot(px - tx, pz - tz) * 1.4)
      tx = (tx + px) / 2
      tz = (tz + pz) / 2
    } else if (kind === 'hotspots') {
      dist *= 1.5
    }
    void c.setLookAt(tx + dist * 0.7, h * 0.5 + dist * 0.5, tz + dist * 0.85, tx, h * 0.4, tz, smooth)
    void c.setFocalOffset(-dist * 0.28, 0, 0, smooth)
  }, [beat, city, cx, cz, size, heightScale])

  useFrame((_, dt) => {
    const c = ref.current
    if (!c) return
    if (wide) c.azimuthAngle += dt * 0.05
    c.update(dt)
  })
  return <CameraControls ref={ref} enabled={false} smoothTime={1.1} />
}
