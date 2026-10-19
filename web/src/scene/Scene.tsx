import { Suspense, useEffect, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { CameraControls, Environment } from '@react-three/drei'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import type CameraControlsImpl from 'camera-controls'
import { useStore } from '../store'
import { cityBounds, height } from '../city/scales'
import type { City } from '../city/types'
import { Buildings } from './Buildings'
import { Districts } from './Districts'
import { Fire } from './Fire'

export function Scene({ city }: { city: City }) {
  const { cx, cz, size } = cityBounds(city)
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 45, near: 0.5, far: size * 10, position: [cx + size * 0.7, size * 0.6, cz + size * 0.9] }}
      onPointerMissed={() => useStore.getState().select(null)}
    >
      <color attach="background" args={['#0b0f1a']} />
      <fog attach="fog" args={['#0b0f1a', size * 1.2, size * 4]} />
      <hemisphereLight args={['#8fb7ff', '#1a1f2e', 0.5]} />
      <directionalLight
        position={[cx + size * 0.5, size * 0.9, cz - size * 0.3]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-size}
        shadow-camera-right={size}
        shadow-camera-top={size}
        shadow-camera-bottom={-size}
        shadow-camera-far={size * 3}
        shadow-bias={-0.0004}
      />
      <Suspense fallback={null}>
        <Environment preset="night" />
      </Suspense>

      <mesh rotation-x={-Math.PI / 2} position={[cx, -0.01, cz]} receiveShadow>
        <planeGeometry args={[size * 6, size * 6]} />
        <meshStandardMaterial color="#070a12" roughness={1} />
      </mesh>

      <Districts city={city} />
      <Buildings city={city} />
      <Fire city={city} />

      <Camera city={city} />

      <EffectComposer>
        <Bloom luminanceThreshold={1} mipmapBlur intensity={1.1} radius={0.6} />
        <Vignette eskil={false} offset={0.2} darkness={0.7} />
      </EffectComposer>
    </Canvas>
  )
}

/** Orbit camera with smooth fly-to on selection. */
function Camera({ city }: { city: City }) {
  const ref = useRef<CameraControlsImpl>(null!)
  const flyTo = useStore((s) => s.flyTo)
  const heightScale = useStore((s) => s.heightScale)
  const consume = useStore((s) => s.consumeFlyTo)
  const { cx, cz, size } = cityBounds(city)

  useEffect(() => {
    void ref.current?.setLookAt(cx + size * 0.7, size * 0.6, cz + size * 0.9, cx, 0, cz, false)
  }, [city, cx, cz, size])

  useEffect(() => {
    if (flyTo == null) return
    const f = city.files[flyTo]
    if (!f) return
    const h = height(f.lines, heightScale, city.stats.maxLines)
    const tx = f.x + f.w / 2
    const tz = f.z + f.d / 2
    const dist = Math.max(8, h * 1.6, Math.max(f.w, f.d) * 4)
    void ref.current?.setLookAt(tx + dist * 0.7, h * 0.7 + dist * 0.6, tz + dist * 0.8, tx, h * 0.5, tz, true)
    consume()
  }, [flyTo, city, heightScale, consume])

  return <CameraControls ref={ref} makeDefault minDistance={2} maxDistance={size * 4} maxPolarAngle={Math.PI / 2 - 0.02} smoothTime={0.45} />
}
