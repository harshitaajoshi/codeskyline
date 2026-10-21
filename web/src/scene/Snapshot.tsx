import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useStore } from '../store'
import type { City } from '../city/types'

/**
 * Postcard: when the store asks, render two frames at 2x and save the canvas
 * as a PNG with a small caption. The HUD is DOM, so the picture is only the
 * city. Runs after the composer (render priority 2) so the frame is complete.
 */
export function Snapshot({ city }: { city: City }) {
  const gl = useThree((s) => s.gl)
  const setDpr = useThree((s) => s.setDpr)
  const viewport = useThree((s) => s.viewport)
  const want = useStore((s) => s.snapshot)
  const pending = useRef<{ frames: number; restore: number } | null>(null)
  const seen = useRef(want)

  useEffect(() => {
    if (want === seen.current) return
    seen.current = want
    pending.current = { frames: 3, restore: viewport.dpr }
    setDpr(Math.max(2, viewport.dpr))
  }, [want, setDpr, viewport.dpr])

  useFrame(() => {
    const p = pending.current
    if (!p) return
    if (--p.frames > 0) return
    pending.current = null
    const src = gl.domElement
    const out = document.createElement('canvas')
    out.width = src.width
    out.height = src.height
    const ctx = out.getContext('2d')!
    ctx.drawImage(src, 0, 0)
    // Caption, bottom left, in the site's type.
    const s = out.width / 1440
    ctx.fillStyle = 'rgba(241, 239, 232, 0.9)'
    ctx.font = `${Math.round(16 * s)}px "JetBrains Mono", ui-monospace, monospace`
    ctx.textBaseline = 'bottom'
    ctx.fillText(city.repo.name, Math.round(32 * s), out.height - Math.round(32 * s))
    ctx.fillStyle = 'rgba(231, 99, 59, 0.95)'
    ctx.font = `800 ${Math.round(16 * s)}px Archivo, system-ui, sans-serif`
    const w = ctx.measureText(city.repo.name + '  ').width
    ctx.fillText('codeskyline', Math.round(32 * s) + w, out.height - Math.round(32 * s))
    out.toBlob((blob) => {
      setDpr(p.restore)
      if (!blob) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${city.repo.name.replace('/', '__')}-postcard.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
    }, 'image/png')
  }, 2)

  return null
}
