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
  setCity: (c: City) => void
  setLoading: () => void
  setError: (msg: string) => void
  setMode: (m: ColorMode) => void
  setHeightScale: (s: HeightScale) => void
  toggleGenerated: () => void
  hover: (id: number | null) => void
  select: (id: number | null, fly?: boolean) => void
  consumeFlyTo: () => void
}

export const useStore = create<State>((set) => ({
  city: null,
  status: 'idle',
  mode: 'churn',
  heightScale: 'sqrt',
  hideGenerated: true,
  hovered: null,
  selected: null,
  flyTo: null,
  setCity: (city) => set({ city, status: 'ready', error: undefined, hovered: null, selected: null, flyTo: null }),
  setLoading: () => set({ status: 'loading', error: undefined }),
  setError: (error) => set({ status: 'error', error }),
  setMode: (mode) => set({ mode }),
  setHeightScale: (heightScale) => set({ heightScale }),
  toggleGenerated: () => set((s) => ({ hideGenerated: !s.hideGenerated })),
  hover: (hovered) => set((s) => (s.hovered === hovered ? s : { hovered })),
  select: (selected, fly = false) => set({ selected, flyTo: fly ? selected : null }),
  consumeFlyTo: () => set({ flyTo: null }),
}))
