import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useStore } from '../store'
import { atmosphere } from './atmosphere'

/**
 * `?debug=1`: a small readout of the state that decides whether anything is
 * visible, written into the DOM twice a second. Dev tooling, not UI.
 */
export function Diagnostics() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const box = useRef<HTMLPreElement | null>(null)
  const last = useRef(0)

  useEffect(() => {
    const el = document.createElement('pre')
    el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9999;font:11px/1.4 ui-monospace,monospace;color:#0f0;background:rgba(0,0,0,.75);padding:8px;margin:0;pointer-events:none;white-space:pre'
    document.body.appendChild(el)
    box.current = el
    return () => el.remove()
  }, [])

  useFrame(({ clock }) => {
    if (clock.elapsedTime - last.current < 0.5 || !box.current) return
    last.current = clock.elapsedTime
    const s = useStore.getState()
    const hemi = scene.children.find((o): o is THREE.HemisphereLight => o instanceof THREE.HemisphereLight)
    const sun = scene.children.find((o): o is THREE.DirectionalLight => o instanceof THREE.DirectionalLight)
    const fog = scene.fog instanceof THREE.Fog ? scene.fog : null
    const ctx = gl.getContext()
    const err = ctx.getError()
    const lines = [
      `three ${THREE.REVISION}  dpr ${gl.getPixelRatio()}  size ${gl.domElement.width}x${gl.domElement.height}`,
      `t ${s.t}  k ${s.k}  K ${s.city?.timeline.keyframes.length ?? '-'}  files ${s.city?.files.length ?? '-'}`,
      `night ${atmosphere.night.toFixed(3)}  rain ${atmosphere.rain.toFixed(3)}  mode ${s.mode}`,
      `hemi ${hemi ? hemi.intensity.toFixed(2) + ' #' + hemi.color.getHexString() : '-'}  sun ${sun ? sun.intensity.toFixed(2) + ' #' + sun.color.getHexString() + ' y=' + sun.position.y.toFixed(1) : '-'}`,
      `bg ${scene.background instanceof THREE.Color ? '#' + scene.background.getHexString() : scene.background}  fog ${fog ? '#' + fog.color.getHexString() + ' ' + fog.near.toFixed(1) + '..' + fog.far.toFixed(1) : '-'}  env ${scene.environment ? scene.environmentIntensity.toFixed(2) : 'none'}`,
      `camera ${camera.position.x.toFixed(1)},${camera.position.y.toFixed(1)},${camera.position.z.toFixed(1)}  near ${(camera as THREE.PerspectiveCamera).near.toFixed(2)} far ${(camera as THREE.PerspectiveCamera).far.toFixed(0)}`,
      `calls ${gl.info.render.calls}  tris ${gl.info.render.triangles}  programs ${gl.info.programs?.length ?? '-'}  glError ${err}`,
      `renderer ${(() => { const e = ctx.getExtension('WEBGL_debug_renderer_info'); return e ? ctx.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?' })()}`,
      `maxVaryings ${ctx.getParameter(ctx.MAX_VARYING_VECTORS)}  maxFragUniforms ${ctx.getParameter(ctx.MAX_FRAGMENT_UNIFORM_VECTORS)}  maxTex ${ctx.getParameter(ctx.MAX_TEXTURE_SIZE)}  float ${!!ctx.getExtension('EXT_color_buffer_float')}`,
    ]
    box.current.textContent = lines.join('\n')
  })
  return null
}
