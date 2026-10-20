import { create } from 'zustand'
import type { City } from './city/types'
import type { ColorMode } from './city/colors'
import type { HeightScale } from './city/scales'

interface State {
  city: City | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  error?: string
  mode: ColorMode
  heightScale: HeightScale
  hideGenerated: boolean
  hovered: number | null // file id
  selected: number | null
  flyTo: number | null // file id the camera should travel to; consumed by the scene
  pointer: { x: number; y: number }

  /** Timeline position in keyframe units (fractional). K-1 is "now". */
  t: number
  /** floor(t); updated only when the integer part changes so React work stays per-keyframe. */
  k: number
  playing: boolean
  speed: number // keyframes per second

  walking: boolean
  lensOpen: boolean
  tourStep: number | null // null = closed

  setCity: (c: City) => void
  setLoading: () => void
  setError: (msg: string) => void
  setMode: (m: ColorMode) => void
  setHeightScale: (s: HeightScale) => void
  toggleGenerated: () => void
  hover: (id: number | null) => void
  select: (id: number | null, fly?: boolean) => void
  consumeFlyTo: () => void
  setPointer: (x: number, y: number) => void
  setT: (t: number) => void
  setPlaying: (p: boolean) => void
  setSpeed: (s: number) => void
  goLive: () => void
  setWalking: (w: boolean) => void
  setLensOpen: (o: boolean) => void
  setTourStep: (s: number | null) => void
}

export const useStore = create<State>((set, get) => ({
  city: null,
  status: 'idle',
  mode: 'churn',
  heightScale: 'sqrt',
  hideGenerated: true,
  hovered: null,
  selected: null,
  flyTo: null,
  pointer: { x: 0, y: 0 },
  t: 0,
  k: 0,
  playing: false,
  speed: 12,
  walking: false,
  lensOpen: true,
  tourStep: null,
  setCity: (city) => {
    const last = Math.max(0, city.timeline.keyframes.length - 1)
    set({ city, status: 'ready', error: undefined, hovered: null, selected: null, flyTo: null, t: last, k: last, playing: false, walking: false })
  },
  setLoading: () => set({ status: 'loading', error: undefined }),
  setError: (error) => set({ status: 'error', error }),
  setMode: (mode) => set({ mode }),
  setHeightScale: (heightScale) => set({ heightScale }),
  toggleGenerated: () => set((s) => ({ hideGenerated: !s.hideGenerated })),
  hover: (hovered) => set((s) => (s.hovered === hovered ? s : { hovered })),
  select: (selected, fly = false) => set({ selected, flyTo: fly ? selected : null }),
  consumeFlyTo: () => set({ flyTo: null }),
  setPointer: (x, y) => set({ pointer: { x, y } }),
  setT: (t) => {
    const city = get().city
    const last = Math.max(0, (city?.timeline.keyframes.length ?? 1) - 1)
    const clamped = Math.min(last, Math.max(0, t))
    const k = Math.floor(clamped)
    set(k === get().k ? { t: clamped } : { t: clamped, k })
  },
  setPlaying: (playing) => {
    const s = get()
    const last = Math.max(0, (s.city?.timeline.keyframes.length ?? 1) - 1)
    // Pressing play at the end restarts from the beginning.
    if (playing && s.t >= last) set({ t: 0, k: 0, playing })
    else set({ playing })
  },
  setSpeed: (speed) => set({ speed }),
  goLive: () => {
    const last = Math.max(0, (get().city?.timeline.keyframes.length ?? 1) - 1)
    set({ t: last, k: last, playing: false })
  },
  setWalking: (walking) => set({ walking, hovered: null }),
  setLensOpen: (lensOpen) => set({ lensOpen }),
  setTourStep: (tourStep) => set({ tourStep }),
}))

/** Subscribe-free read used inside the render loop. */
export const readT = () => useStore.getState().t
