/**
 * Looks for the city. One preset object per theme; the scene, the materials
 * and the street furniture read the active one from the store. Every theme
 * keeps the lenses legible: fire is always fire, owners stay distinct.
 */
export type ThemeId = 'dusk' | 'blueprint' | 'noir' | 'paper'

/** How the building facades are drawn: 0 real, 1 monochrome, 2 blueprint lines, 3 paper blocks. */
export type FacadeStyle = 0 | 1 | 2 | 3

export interface Theme {
  id: ThemeId
  label: string
  hint: string
  /** Target for `atmosphere.night` (windows, lamps, car lights) when daylight is off. */
  night: number
  facade: FacadeStyle
  /** Sky dome and environment map colours at "dusk" (the daylight switch lerps toward SKY_DAY). */
  sky: { zenith: string; mid: string; horizon: string; glow: string }
  dusk: { sun: string; sunIntensity: number; hemiSky: string; hemiGround: string; hemi: number; fog: string; background: string }
  /** Fog distances as multiples of the city size at dusk. */
  fogNear: number
  fogFar: number
  env: number
  ground: string
  lot: string
  asphalt: [number, number, number] // HSL
  sidewalk: [number, number] // L for boulevards, alleys
  crown: string
  labelColor: string
  lamp: { head: string; pool: [number, number, number] }
  car: string[]
  furniture: boolean // dashes, lamps, trees
  traffic: boolean
  water: boolean
  wet: boolean
  flames: boolean
  effects: { ao: boolean; bloom: boolean; tiltShift: boolean; grain: number }
}

export const THEMES: Record<ThemeId, Theme> = {
  dusk: {
    id: 'dusk',
    label: 'Dusk',
    hint: 'the city at nightfall',
    night: 1,
    facade: 0,
    sky: { zenith: '#0b1024', mid: '#1c2546', horizon: '#4a3a40', glow: '#a85e32' },
    dusk: { sun: '#ffc08a', sunIntensity: 3.2, hemiSky: '#5d6f96', hemiGround: '#1c1b1f', hemi: 1.6, fog: '#1b1e2c', background: '#0e1120' },
    fogNear: 0.6,
    fogFar: 4,
    env: 1.1,
    ground: '#14161c',
    lot: '#161616',
    asphalt: [0.62, 0.05, 0.11],
    sidewalk: [0.27, 0.18],
    crown: '#2b2b2d',
    labelColor: '#f1efe8',
    lamp: { head: '#f1d9a8', pool: [255, 214, 160] },
    car: ['#1d1f24', '#2a2d33', '#8d9097', '#c9cbd0', '#5a1d1f', '#1c2a44', '#3b3d42', '#e8e6e0'],
    furniture: true,
    traffic: true,
    water: true,
    wet: true,
    flames: true,
    effects: { ao: true, bloom: true, tiltShift: true, grain: 0 },
  },
  blueprint: {
    id: 'blueprint',
    label: 'Blueprint',
    hint: 'white lines on drafting paper',
    night: 0,
    facade: 2,
    sky: { zenith: '#0e2f6b', mid: '#113a80', horizon: '#164a9a', glow: '#164a9a' },
    dusk: { sun: '#ffffff', sunIntensity: 0.9, hemiSky: '#9fc0ff', hemiGround: '#28478a', hemi: 1.4, fog: '#123b82', background: '#0f3474' },
    fogNear: 2.5,
    fogFar: 9,
    env: 0.3,
    ground: '#0f3474',
    lot: '#17408c',
    asphalt: [0.6, 0.72, 0.26],
    sidewalk: [0.34, 0.3],
    crown: '#2d5fb4',
    labelColor: '#eaf2ff',
    lamp: { head: '#ffffff', pool: [255, 255, 255] },
    car: ['#dbe8ff'],
    furniture: false,
    traffic: false,
    water: false,
    wet: false,
    flames: true,
    effects: { ao: false, bloom: false, tiltShift: false, grain: 0 },
  },
  noir: {
    id: 'noir',
    label: 'Noir',
    hint: 'black and white; the fires are the only colour',
    night: 1,
    facade: 1,
    sky: { zenith: '#050507', mid: '#121216', horizon: '#3a3a3e', glow: '#6b6b70' },
    dusk: { sun: '#ffffff', sunIntensity: 4.2, hemiSky: '#6c6c72', hemiGround: '#0d0d0f', hemi: 1.2, fog: '#131316', background: '#060608' },
    fogNear: 0.5,
    fogFar: 3.6,
    env: 0.8,
    ground: '#0b0b0d',
    lot: '#111113',
    asphalt: [0, 0, 0.1],
    sidewalk: [0.3, 0.2],
    crown: '#2a2a2c',
    labelColor: '#f4f4f2',
    lamp: { head: '#ffffff', pool: [240, 240, 240] },
    car: ['#151517', '#2a2a2d', '#8a8a8e', '#d8d8d6', '#3a3a3e', '#e8e8e6'],
    furniture: true,
    traffic: true,
    water: true,
    wet: true,
    flames: true,
    effects: { ao: true, bloom: true, tiltShift: true, grain: 0.35 },
  },
  paper: {
    id: 'paper',
    label: 'Paper',
    hint: 'the architect’s model in daylight',
    night: 0,
    facade: 3,
    sky: { zenith: '#c9d6e6', mid: '#dfe7f0', horizon: '#efe9df', glow: '#f3e4c8' },
    dusk: { sun: '#fff1dc', sunIntensity: 1.9, hemiSky: '#cfd9e6', hemiGround: '#8f887c', hemi: 1.0, fog: '#d3d7dc', background: '#cdd4dc' },
    fogNear: 4,
    fogFar: 16,
    env: 0.6,
    ground: '#bdb8ad',
    lot: '#b5afa3',
    asphalt: [0.08, 0.05, 0.6],
    sidewalk: [0.78, 0.72],
    crown: '#e9e4da',
    labelColor: '#2a2a2a',
    lamp: { head: '#ffffff', pool: [255, 255, 255] },
    car: ['#ffffff'],
    furniture: false,
    traffic: false,
    water: false,
    wet: false,
    flames: true,
    effects: { ao: true, bloom: false, tiltShift: true, grain: 0 },
  },
}

export const THEME_IDS = Object.keys(THEMES) as ThemeId[]
export const isThemeId = (v: unknown): v is ThemeId => typeof v === 'string' && v in THEMES
