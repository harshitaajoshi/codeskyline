import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { City } from './city/types'
import type { ColorMode } from './city/colors'
import type { HeightScale } from './city/scales'
import type { ThemeId } from './scene/themes'

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
  /** Screen position of the selected building's top, for the DOM name tag. */
  markerScreen: { x: number; y: number; visible: boolean }
  setMarkerScreen: (m: { x: number; y: number; visible: boolean }) => void

  showCoupling: boolean
  setShowCoupling: (v: boolean) => void
  insightsOpen: boolean
  setInsightsOpen: (v: boolean) => void
  insightIndex: number
  setInsightIndex: (i: number) => void
  /** Which dock popover is open. */
  dockPanel: 'more' | null
  setDockPanel: (p: 'more' | null) => void
  /** Owners lens: author whose departure is being simulated. */
  simulateAuthor: number | null
  setSimulateAuthor: (a: number | null) => void
  /** Story event pinned open on the timeline (index into timeline.story). */
  pinnedEvent: number | null
  setPinnedEvent: (i: number | null) => void
  /** Daylight instead of the default dusk. */
  day: boolean
  setDay: (v: boolean) => void
  /** The look of the city. */
  theme: ThemeId
  setTheme: (t: ThemeId) => void
  /** The cinematic flythrough is running; the HUD steps aside. */
  filming: boolean
  setFilming: (v: boolean) => void
  /** Bumped to ask the scene for a postcard (PNG of the canvas, no HUD). */
  snapshot: number
  requestSnapshot: () => void

  setCity: (c: City) => void
  setLoading: () => void
  setError: (msg: string) => void
  setMode: (m: ColorMode) => void
  setHeightScale: (s: HeightScale) => void
  toggleGenerated: () => void
  hover: (id: number | null) => void
  select: (id: number | null, fly?: boolean) => void
  consumeFlyTo: () => void
  /** Glide back to the wide view of the whole city. */
  flyWide: () => void
  setPointer: (x: number, y: number) => void
  setT: (t: number) => void
  setPlaying: (p: boolean) => void
  setSpeed: (s: number) => void
  goLive: () => void
  setWalking: (w: boolean) => void
  setLensOpen: (o: boolean) => void
  setTourStep: (s: number | null) => void
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
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
  markerScreen: { x: 0, y: 0, visible: false },
  setMarkerScreen: (markerScreen) => set({ markerScreen }),
  showCoupling: true,
  setShowCoupling: (showCoupling) => set({ showCoupling }),
  insightsOpen: true,
  setInsightsOpen: (insightsOpen) => set({ insightsOpen }),
  insightIndex: 0,
  setInsightIndex: (insightIndex) => set({ insightIndex }),
  dockPanel: null,
  setDockPanel: (dockPanel) => set({ dockPanel }),
  simulateAuthor: null,
  setSimulateAuthor: (simulateAuthor) => set({ simulateAuthor }),
  pinnedEvent: null,
  setPinnedEvent: (pinnedEvent) => set({ pinnedEvent }),
  day: false,
  setDay: (day) => set({ day }),
  theme: 'dusk',
  setTheme: (theme) => set({ theme }),
  filming: false,
  setFilming: (filming) => set({ filming }),
  snapshot: 0,
  requestSnapshot: () => set((s) => ({ snapshot: s.snapshot + 1 })),
  setCity: (city) => {
    const last = Math.max(0, city.timeline.keyframes.length - 1)
    set({
      city,
      status: 'ready',
      error: undefined,
      hovered: null,
      selected: null,
      flyTo: null,
      t: last,
      k: last,
      playing: false,
      walking: false,
      simulateAuthor: null,
      pinnedEvent: null,
      insightIndex: 0,
      insightsOpen: true,
      dockPanel: null,
      // A city built with a diff opens on the diff lens.
      mode: city.diff ? 'diff' : get().mode === 'diff' ? 'churn' : get().mode,
    })
  },
  setLoading: () => set({ status: 'loading', error: undefined }),
  setError: (error) => set({ status: 'error', error }),
  setMode: (mode) => set({ mode }),
  setHeightScale: (heightScale) => set({ heightScale }),
  toggleGenerated: () => set((s) => ({ hideGenerated: !s.hideGenerated })),
  hover: (hovered) => set((s) => (s.hovered === hovered ? s : { hovered })),
  select: (selected, fly = false) => set({ selected, flyTo: fly ? selected : null }),
  consumeFlyTo: () => set({ flyTo: null }),
  flyWide: () => set({ flyTo: -1 }),
  setPointer: (x, y) => set({ pointer: { x, y } }),
  setT: (t) => {
    if (!Number.isFinite(t)) return
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
    }),
    {
      name: 'csky.prefs.v1',
      // Only what a returning visitor expects to find as they left it.
      partialize: (s) => ({ theme: s.theme, heightScale: s.heightScale, hideGenerated: s.hideGenerated, day: s.day, showCoupling: s.showCoupling }),
    },
  ),
)

/** Subscribe-free read used inside the render loop. */
export const readT = () => useStore.getState().t
