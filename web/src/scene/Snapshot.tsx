import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useStore } from '../store'
import type { City } from '../city/types'
import { drawCredit, fileStem, loadCreditFonts, saveBlob } from './credit'
import { activeTap } from './recorder'

/**
 * Postcard: when the store asks, render a few frames at 2x and save the
 * canvas as a JPEG with the credit along the bottom. The HUD is DOM, so the
 * picture is only the city. Runs after the composer (render priority 2) so
 * the frame is complete. The HUD flashes on the click and shows the result.
 */
export function Snapshot({ city }: { city: City }) {
  const gl = useThree((s) => s.gl)
  const setDpr = useThree((s) => s.setDpr)
  const viewport = useThree((s) => s.viewport)
  const want = useStore((s) => s.snapshot)
  const setSaved = useStore((s) => s.setSaved)
  const pending = useRef<{ frames: number; restore: number } | null>(null)
  const seen = useRef(want)

  useEffect(() => {
    if (want === seen.current) return
    seen.current = want
    void loadCreditFonts()
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
    setDpr(p.restore)
    drawCredit(ctx, out.width, out.height, city)
    // JPEG: a fraction of PNG's encode time and size, and it posts anywhere.
    out.toBlob(
      (blob) => {
        if (!blob) return
        const name = `${fileStem(city)}-postcard.jpg`
        saveBlob(blob, name)
        setSaved({ url: URL.createObjectURL(blob), name, kind: 'image' })
      },
      'image/jpeg',
      0.92,
    )
  }, 2)

  return null
}

/** While a video is recording, hand it every finished frame. */
export function RecordTap() {
  const gl = useThree((s) => s.gl)
  useFrame(() => activeTap?.(gl.domElement), 3)
  return null
}
