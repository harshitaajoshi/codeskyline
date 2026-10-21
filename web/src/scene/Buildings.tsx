import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useStore } from '../store'
import { ACTIVITY, CHURN, FIRE, GHOST, GPU_MODE, GRAY, OWNER_SLOTS, fileColor, makeColorContext, paletteSlot, type RGB } from '../city/colors'
import { height, type HeightScale } from '../city/scales'
import { linesAt, type TimelineData } from '../city/timeline'
import { simulateDeparture } from '../city/knowledge'
import { partnersOf } from './Coupling'
import type { City } from '../city/types'

const LOT_MARGIN = 0.12 // gap between a building and its lot edge

/** Tags every vertex of a geometry with the variant it belongs to. */
function tagged(g: THREE.BufferGeometry, variant: number): THREE.BufferGeometry {
  const n = g.getAttribute('position').count
  g.setAttribute('variant', new THREE.Float32BufferAttribute(new Float32Array(n).fill(variant), 1))
  return g
}

/**
 * Building bodies: a few silhouettes inside one unit box (origin at the base,
 * height 1), all merged into one geometry. Every instance carries its
 * variant; the vertex shader collapses the other variants to a point, so
 * one draw call still renders the whole city.
 *   0 plain block
 *   1 podium with a slimmer tower
 *   2 stepped: three setbacks
 *   3 slab tower with a thin top
 */
function bodyGeometry(): THREE.BufferGeometry {
  const box = (w: number, h: number, d: number, y: number) => new THREE.BoxGeometry(w, h, d).translate(0, y + h / 2, 0)
  const parts = [
    tagged(box(1, 1, 1, 0), 0),
    tagged(box(1, 0.22, 1, 0), 1),
    tagged(box(0.72, 0.78, 0.72, 0.22), 1),
    tagged(box(1, 0.4, 1, 0), 2),
    tagged(box(0.84, 0.32, 0.84, 0.4), 2),
    tagged(box(0.66, 0.28, 0.66, 0.72), 2),
    tagged(box(1, 0.9, 0.8, 0), 3),
    tagged(box(0.6, 0.1, 0.5, 0.9), 3),
  ]
  return mergeGeometries(parts, false)
}

/**
 * Rooftops, placed at the live building height by the shader. Unit footprint,
 * real-world height (the crown's instance matrix does not scale in y).
 *   0 nothing
 *   1 parapet rim
 *   2 parapet plus plant rooms
 *   3 spire with a warning light (emit = 1)
 *   4 water tank
 */
function crownGeometry(): THREE.BufferGeometry {
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z)
  const emit = (g: THREE.BufferGeometry, v: number) => {
    const n = g.getAttribute('position').count
    g.setAttribute('emit', new THREE.Float32BufferAttribute(new Float32Array(n).fill(v), 1))
    return g
  }
  const rim = (variant: number) => [
    tagged(box(1, 0.08, 0.07, 0, 0, -0.465), variant),
    tagged(box(1, 0.08, 0.07, 0, 0, 0.465), variant),
    tagged(box(0.07, 0.08, 1, -0.465, 0, 0), variant),
    tagged(box(0.07, 0.08, 1, 0.465, 0, 0), variant),
  ]
  const parts = [
    ...rim(1),
    ...rim(2),
    tagged(box(0.3, 0.16, 0.22, -0.2, 0, 0.15), 2),
    tagged(box(0.18, 0.1, 0.18, 0.22, 0, -0.18), 2),
    tagged(box(0.1, 0.22, 0.1, 0.25, 0, 0.25), 2),
    ...rim(3),
    tagged(box(0.16, 0.25, 0.16, 0, 0, 0), 3),
    tagged(box(0.05, 1.3, 0.05, 0, 0.25, 0), 3),
    emit(tagged(box(0.06, 0.06, 0.06, 0, 1.55, 0), 3), 1),
    tagged(box(0.05, 0.3, 0.05, 0.14, 0, 0.14), 4),
    tagged(box(0.05, 0.3, 0.05, -0.14, 0, 0.14), 4),
    tagged(box(0.05, 0.3, 0.05, 0.14, 0, -0.14), 4),
    tagged(box(0.05, 0.3, 0.05, -0.14, 0, -0.14), 4),
    tagged(new THREE.CylinderGeometry(0.17, 0.17, 0.3, 10).translate(0, 0.45, 0), 4),
  ]
  for (const g of parts) if (!g.getAttribute('emit')) emit(g, 0)
  return mergeGeometries(parts, false)
}

const BOX = bodyGeometry()
const CROWN = crownGeometry()

const HOVER: RGB = [1, 1, 1]
const PARTNER: RGB = [1.0, 0.68, 0.5] // coupled to the selection
const SELECT: RGB = [0.91, 0.39, 0.23] // orange, matching the HUD accent
const HEIGHT_MODE: Record<HeightScale, number> = { sqrt: 0, log: 1, linear: 2 }

/**
 * All buildings as one InstancedMesh. Heights and timeline colors are computed
 * in the vertex shader from keyframe textures, so scrubbing time costs a
 * single uniform update however many buildings there are.
 */
export function Buildings({
  city,
  timeline,
  interactive = true,
}: {
  city: City
  timeline: TimelineData
  interactive?: boolean
}) {
  const mesh = useRef<THREE.InstancedMesh>(null!)
  const mode = useStore((s) => s.mode)
  const heightScale = useStore((s) => s.heightScale)
  const hideGenerated = useStore((s) => s.hideGenerated)
  const hovered = useStore((s) => s.hovered)
  const selected = useStore((s) => s.selected)
  const storeK = useStore((s) => s.k)
  const showCoupling = useStore((s) => s.showCoupling)
  const k = storeK
  const hover = useStore((s) => s.hover)
  const select = useStore((s) => s.select)

  // Visible files → instance slots. Hidden files are simply not instanced.
  const visible = useMemo(() => {
    const ids: number[] = []
    city.files.forEach((f, i) => {
      if (hideGenerated && (f.generated || f.vendored)) return
      ids.push(i)
    })
    return ids
  }, [city, hideGenerated])

  const slotOf = useMemo(() => {
    const m = new Map<number, number>()
    visible.forEach((fi, slot) => m.set(fi, slot))
    return m
  }, [visible])

  // --- textures + shader --------------------------------------------------
  const textures = useMemo(() => {
    const lines = new THREE.DataTexture(timeline.lines, timeline.texW, timeline.texH, THREE.RedFormat, THREE.FloatType)
    lines.minFilter = lines.magFilter = THREE.NearestFilter
    lines.needsUpdate = true
    const meta = new THREE.DataTexture(timeline.meta, timeline.texW, timeline.texH, THREE.RGBAFormat, THREE.UnsignedByteType)
    meta.minFilter = meta.magFilter = THREE.NearestFilter
    meta.needsUpdate = true
    return { lines, meta }
  }, [timeline])
  useEffect(() => () => {
    textures.lines.dispose()
    textures.meta.dispose()
  }, [textures])

  const uniforms = useMemo(
    () => ({
      uT: { value: 0 },
      uK: { value: timeline.K },
      uTexW: { value: timeline.texW },
      uLines: { value: textures.lines },
      uMeta: { value: textures.meta },
      uMode: { value: 1 },
      uHeightMode: { value: 0 },
      uMaxLines: { value: Math.max(1, city.stats.maxLines) },
      uActScale: { value: timeline.activityScale },
      uChurn: { value: CHURN.map((c) => new THREE.Vector3(...c)) },
      uActivity: { value: ACTIVITY.map((c) => new THREE.Vector3(...c)) },
      uFire: { value: FIRE.map((c) => new THREE.Vector3(...c)) },
      uPalette: { value: Array.from({ length: OWNER_SLOTS }, (_, i) => new THREE.Vector3(...paletteSlot(i))) },
      uGray: { value: new THREE.Vector3(...GRAY) },
      uGhost: { value: new THREE.Vector3(...GHOST) },
      uLost: { value: new THREE.Vector3(0.42, 0.12, 0.14) }, // departure simulation: goes dark red
      uWindows: { value: 1 },
      uWindowBase: { value: 0.2 },
      uTime: { value: 0 },
    }),
    [timeline, textures, city],
  )

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.2, envMapIntensity: 0.55 })
    m.customProgramCacheKey = () => 'csky-buildings'
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = VERT_PARS + shader.vertexShader
        .replace('#include <color_vertex>', '#include <color_vertex>\n' + VERT_SAMPLE)
        .replace('#include <begin_vertex>', VERT_BEGIN + VERT_VARIANT)
      shader.fragmentShader = FRAG_PARS + shader.fragmentShader
        .replace('void main() {', 'void main() {\n vec3 csky_windowGlow = vec3(0.0);')
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_FACADE)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vCskyEmissive + csky_windowGlow;')
    }
    return m
  }, [uniforms])
  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    uniforms.uMode.value = GPU_MODE[mode]
    uniforms.uHeightMode.value = HEIGHT_MODE[heightScale]
  }, [uniforms, mode, heightScale])

  useFrame(({ clock }) => {
    uniforms.uT.value = useStore.getState().t
    uniforms.uTime.value = clock.elapsedTime
  })

  // --- instance geometry ---------------------------------------------------
  // Instance matrices carry footprint and position; the shader multiplies in
  // height. We still write the current keyframe's height so raycasting hits
  // the visible box.
  const aFile = useMemo(() => {
    const arr = new Float32Array(Math.max(1, city.files.length))
    visible.forEach((fi, slot) => (arr[slot] = fi))
    return new THREE.InstancedBufferAttribute(arr, 1)
  }, [city, visible])

  useEffect(() => {
    const m = mesh.current
    const mat = new THREE.Matrix4()
    const pos = new THREE.Vector3()
    const scl = new THREE.Vector3()
    const q = new THREE.Quaternion()
    visible.forEach((fi, slot) => {
      const f = city.files[fi]!
      const h = height(linesAt(timeline, fi, k), heightScale, city.stats.maxLines)
      pos.set(f.x + f.w / 2, 0, f.z + f.d / 2)
      scl.set(Math.max(0.2, f.w - LOT_MARGIN), h, Math.max(0.2, f.d - LOT_MARGIN))
      mat.compose(pos, q, scl)
      m.setMatrixAt(slot, mat)
    })
    m.count = visible.length
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
  }, [city, visible, heightScale, timeline, k])

  // Per-file flags the timeline textures do not carry:
  //   bit 1 = ghost town, bit 2 = would lose its last owner in the departure simulation.
  const simulateAuthor = useStore((s) => s.simulateAuthor)
  const lost = useMemo(() => (simulateAuthor == null ? null : simulateDeparture(city, simulateAuthor).lost), [city, simulateAuthor])
  const aFlags = useMemo(() => {
    const arr = new Float32Array(Math.max(1, city.files.length))
    visible.forEach((fi, slot) => {
      const f = city.files[fi]!
      arr[slot] = (f.ghost ? 1 : 0) + (lost?.has(fi) ? 2 : 0)
    })
    const attr = new THREE.InstancedBufferAttribute(arr, 1)
    return attr
  }, [city, visible, lost])

  // Silhouettes: tall files get towers and setbacks, wide short ones stay
  // blocks; rooftops follow the silhouette. Chosen once per city from the
  // file's size, so a building keeps its shape through time.
  const aVariant = useMemo(() => {
    const body = new Float32Array(Math.max(1, city.files.length))
    const crown = new Float32Array(Math.max(1, city.files.length))
    const lines = visible.map((fi) => city.files[fi]!.lines).sort((a, b) => a - b)
    const pct = (p: number) => lines[Math.min(lines.length - 1, Math.floor(lines.length * p))] ?? 0
    const tall = pct(0.8)
    const mid = pct(0.5)
    visible.forEach((fi, slot) => {
      const f = city.files[fi]!
      const r = fract(fi * 0.6180339887)
      const wide = Math.min(f.w, f.d) >= 1.1
      if (f.lines >= tall && wide) {
        body[slot] = r < 0.45 ? 1 : r < 0.8 ? 2 : 3
        crown[slot] = r < 0.3 ? 3 : r < 0.75 ? 2 : 1
      } else if (f.lines >= mid && wide) {
        body[slot] = r < 0.25 ? 2 : 0
        crown[slot] = r < 0.35 ? 2 : r < 0.5 ? 4 : 1
      } else {
        body[slot] = 0
        crown[slot] = wide && r < 0.4 ? 1 : 0
      }
    })
    return { body: new THREE.InstancedBufferAttribute(body, 1), crown: new THREE.InstancedBufferAttribute(crown, 1) }
  }, [city, visible])

  useEffect(() => {
    const m = mesh.current
    m.geometry.setAttribute('aFile', aFile)
    m.geometry.setAttribute('aFlags', aFlags)
    m.geometry.setAttribute('aVariant', aVariant.body)
  }, [aFile, aFlags, aVariant])

  // --- static colors (language/age) + hover/select highlight ---------------
  const ctx = useMemo(() => makeColorContext(city, mode), [city, mode])
  const base = useMemo(() => {
    const arr = new Float32Array(visible.length * 3)
    visible.forEach((fi, slot) => {
      const c = fileColor(city.files[fi]!, fi, ctx)
      arr[slot * 3] = c[0]
      arr[slot * 3 + 1] = c[1]
      arr[slot * 3 + 2] = c[2]
    })
    return arr
  }, [city, visible, ctx])

  const highlight = useMemo(() => new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, city.files.length)), 1), [city])
  useEffect(() => {
    const m = mesh.current
    if (!m.instanceColor || m.instanceColor.count < visible.length) {
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, visible.length) * 3), 3)
    }
    const arr = m.instanceColor.array as Float32Array
    arr.set(base)
    const hl = highlight.array as Float32Array
    hl.fill(0)
    const paint = (fi: number | null, c: RGB, flag: number) => {
      const slot = fi == null ? undefined : slotOf.get(fi)
      if (slot == null) return
      arr[slot * 3] = c[0]
      arr[slot * 3 + 1] = c[1]
      arr[slot * 3 + 2] = c[2]
      hl[slot] = flag
    }
    // Files coupled to the selection light up with it (its blast radius).
    if (selected != null && showCoupling) {
      for (const p of partnersOf(city, selected)) paint(p.id, PARTNER, 3)
    }
    paint(selected, SELECT, 2)
    paint(hovered, HOVER, 1)
    m.instanceColor.needsUpdate = true
    highlight.needsUpdate = true
    m.geometry.setAttribute('aHighlight', highlight)
  }, [base, slotOf, hovered, selected, visible.length, highlight, city, showCoupling])

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const fi = e.instanceId == null ? null : (visible[e.instanceId] ?? null)
    hover(fi)
  }
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    const fi = e.instanceId == null ? null : (visible[e.instanceId] ?? null)
    select(fi, true)
  }

  return (
    <>
      <instancedMesh
        ref={mesh}
        args={[BOX, material, Math.max(1, city.files.length)]}
        castShadow
        receiveShadow
        frustumCulled={false}
        onPointerMove={interactive ? onMove : undefined}
        onPointerOut={interactive ? () => hover(null) : undefined}
        onClick={interactive ? onClick : undefined}
      />
      <Crowns city={city} visible={visible} uniforms={uniforms} aFile={aFile} aVariant={aVariant.crown} aBody={aVariant.body} />
    </>
  )
}

function fract(x: number) {
  return x - Math.floor(x)
}

/**
 * Rooftop details as a second instanced mesh. The instance matrix carries
 * the footprint; the shader samples the same keyframe textures as the
 * bodies and lifts each crown to its building's live height.
 */
function Crowns({
  city,
  visible,
  uniforms,
  aFile,
  aVariant,
  aBody,
}: {
  city: City
  visible: number[]
  uniforms: Record<string, THREE.IUniform>
  aFile: THREE.InstancedBufferAttribute
  aVariant: THREE.InstancedBufferAttribute
  aBody: THREE.InstancedBufferAttribute
}) {
  const mesh = useRef<THREE.InstancedMesh>(null!)
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: '#2b2b2d', roughness: 0.7, metalness: 0.3 })
    m.customProgramCacheKey = () => 'csky-crowns'
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = CROWN_VERT_PARS + shader.vertexShader.replace('#include <begin_vertex>', CROWN_VERT_BEGIN)
      shader.fragmentShader =
        'varying float vCskyEmit;\nuniform float uTime;\n' +
        shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n if (vCskyEmit > 0.5) totalEmissiveRadiance += vec3(3.0, 0.2, 0.15) * (0.3 + 0.7 * step(0.5, fract(uTime * 0.8 + vCskyEmit)));',
        )
    }
    return m
  }, [uniforms])
  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    const m = mesh.current
    const mat = new THREE.Matrix4()
    const pos = new THREE.Vector3()
    const scl = new THREE.Vector3()
    const q = new THREE.Quaternion()
    visible.forEach((fi, slot) => {
      const f = city.files[fi]!
      pos.set(f.x + f.w / 2, 0, f.z + f.d / 2)
      scl.set(Math.max(0.2, f.w - LOT_MARGIN), 1, Math.max(0.2, f.d - LOT_MARGIN))
      mat.compose(pos, q, scl)
      m.setMatrixAt(slot, mat)
    })
    m.count = visible.length
    m.instanceMatrix.needsUpdate = true
    m.geometry.setAttribute('aFile', aFile)
    m.geometry.setAttribute('aVariant', aVariant)
    m.geometry.setAttribute('aBody', aBody)
    m.computeBoundingSphere()
  }, [city, visible, aFile, aVariant, aBody])

  return <instancedMesh ref={mesh} args={[CROWN, material, Math.max(1, city.files.length)]} frustumCulled={false} raycast={() => null} />
}

// ---------------------------------------------------------------------------
// GLSL. Injected into MeshStandardMaterial so lighting/shadows stay intact.

const VERT_PARS = /* glsl */ `
attribute float aFile;
attribute float aHighlight;
attribute float aFlags;
attribute float aVariant;
attribute float variant;
uniform vec3 uGhost;
uniform vec3 uLost;
uniform sampler2D uLines;
uniform sampler2D uMeta;
uniform float uT;
uniform int uK;
uniform int uTexW;
uniform int uMode;
uniform int uHeightMode;
uniform float uMaxLines;
uniform float uActScale;
uniform vec3 uChurn[6];
uniform vec3 uActivity[5];
uniform vec3 uFire[4];
uniform vec3 uPalette[${OWNER_SLOTS}];
uniform vec3 uGray;
varying vec3 vCskyEmissive;
varying vec3 vCskyPos;   // position scaled to world size, y from the ground
varying vec3 vCskyNrm;   // object-space normal
varying float vCskySeed;
varying float vCskyAct;
varying float vCskyH;

ivec2 cskyTexel(int idx) { return ivec2(idx % uTexW, idx / uTexW); }
float cskyLines(int idx) { return texelFetch(uLines, cskyTexel(idx), 0).r; }
vec4 cskyMeta(int idx) { return texelFetch(uMeta, cskyTexel(idx), 0); }

float cskyHeight(float lines) {
  if (lines <= 0.0) return 0.0;
  float h;
  if (uHeightMode == 0) h = sqrt(lines) * 0.4;
  else if (uHeightMode == 1) h = log2(1.0 + lines) * 2.2;
  else h = lines / max(1.0, uMaxLines) * 70.0;
  return clamp(h, 0.6, 70.0);
}

vec3 cskyGradient6(vec3 s[6], float t) {
  float x = clamp(t, 0.0, 1.0) * 5.0;
  int i = int(min(4.0, floor(x)));
  return mix(s[i], s[i + 1], x - float(i));
}
vec3 cskyGradient5(vec3 s[5], float t) {
  float x = clamp(t, 0.0, 1.0) * 4.0;
  int i = int(min(3.0, floor(x)));
  return mix(s[i], s[i + 1], x - float(i));
}
`

// Runs right after color_vertex (early in main) so csky_h is ready for begin_vertex.
const VERT_SAMPLE = /* glsl */ `
int csky_f = int(aFile + 0.5);
float csky_t = clamp(uT, 0.0, float(uK - 1));
int csky_k0 = int(floor(csky_t));
int csky_k1 = min(csky_k0 + 1, uK - 1);
float csky_fr = csky_t - float(csky_k0);
float csky_l0 = cskyLines(csky_f * uK + csky_k0);
float csky_l1 = cskyLines(csky_f * uK + csky_k1);
float csky_h = mix(cskyHeight(csky_l0), cskyHeight(csky_l1), csky_fr);
vec4 csky_m0 = cskyMeta(csky_f * uK + csky_k0);
vec4 csky_m1 = cskyMeta(csky_f * uK + csky_k1);
vCskyEmissive = vec3(0.0);
{
  float sx = 1.0, sz = 1.0;
  #ifdef USE_INSTANCING
  sx = length(instanceMatrix[0].xyz); sz = length(instanceMatrix[2].xyz);
  #endif
  vCskyPos = vec3(position.x * sx, position.y * csky_h, position.z * sz);
  vCskyNrm = normal;
  vCskyH = csky_h;
  vCskySeed = fract(sin(aFile * 12.9898) * 43758.5453);
  // Windows light up with activity: cumulative churn gives a baseline, the
  // current keyframe's commits add a burst.
  vCskyAct = clamp(mix(csky_m0.a, csky_m1.a, csky_fr) * 0.6 + max(csky_m0.r * (1.0 - csky_fr), csky_m1.r * csky_fr) * 255.0 / uActScale, 0.0, 1.0);
}
#if defined( USE_INSTANCING_COLOR )
if (uMode > 0 && aHighlight < 0.5) {
  if (uMode == 1) {
    vColor.rgb = cskyGradient6(uChurn, mix(csky_m0.a, csky_m1.a, csky_fr));
  } else if (uMode == 2) {
    // Activity pulses: bright at the keyframe a commit landed, fading into the next.
    float a = max(csky_m0.r * (1.0 - csky_fr), csky_m1.r * csky_fr) * 255.0 / uActScale;
    vColor.rgb = cskyGradient5(uActivity, a);
    vCskyEmissive = vColor.rgb * smoothstep(0.5, 1.0, a) * 0.6;
  } else if (uMode == 3) {
    int fire = int((csky_fr < 0.5 ? csky_m0.b : csky_m1.b) * 255.0 + 0.5);
    vColor.rgb = uFire[fire];
    vCskyEmissive = fire > 0 ? uFire[fire] * (0.25 * float(fire)) : vec3(0.0);
  } else {
    int slot = int((csky_fr < 0.5 ? csky_m0.g : csky_m1.g) * 255.0 + 0.5);
    vColor.rgb = slot < ${OWNER_SLOTS} ? uPalette[slot] : uGray;
    // Ghost town: at the present day, files nobody active still owns go dark.
    int flags = int(aFlags + 0.5);
    bool nowish = csky_t >= float(uK - 1) - 0.001;
    if ((flags & 2) != 0) { vColor.rgb = uLost; vCskyEmissive = uLost * 0.6; }
    else if ((flags & 1) != 0 && nowish) vColor.rgb = uGhost;
  }
}
#endif
`

// The instance matrix carries the current keyframe's height (so raycasts hit
// the visible box); divide it back out and apply the interpolated height.
const VERT_BEGIN = /* glsl */ `
float csky_sy = 1.0;
#ifdef USE_INSTANCING
csky_sy = max(1e-4, length(instanceMatrix[1].xyz));
#endif
vec3 transformed = vec3(position.x, position.y * csky_h / csky_sy, position.z);
`

// Only this instance's silhouette survives; the rest collapse to a point.
const VERT_VARIANT = /* glsl */ `
if (abs(variant - aVariant) > 0.5) transformed = vec3(0.0);
`

const CROWN_VERT_PARS = /* glsl */ `
attribute float aFile;
attribute float aVariant;
attribute float aBody;
attribute float variant;
attribute float emit;
uniform sampler2D uLines;
uniform float uT;
uniform int uK;
uniform int uTexW;
uniform int uHeightMode;
uniform float uMaxLines;
varying float vCskyEmit;
ivec2 cskyTexel(int idx) { return ivec2(idx % uTexW, idx / uTexW); }
float cskyLines(int idx) { return texelFetch(uLines, cskyTexel(idx), 0).r; }
float cskyHeight(float lines) {
  if (lines <= 0.0) return 0.0;
  float h;
  if (uHeightMode == 0) h = sqrt(lines) * 0.4;
  else if (uHeightMode == 1) h = log2(1.0 + lines) * 2.2;
  else h = lines / max(1.0, uMaxLines) * 70.0;
  return clamp(h, 0.6, 70.0);
}
`

// Lift the crown to the live height; the footprint comes from the instance
// matrix, the height does not, so a parapet is the same thickness on every
// building. Nothing is drawn where the building does not exist yet.
const CROWN_VERT_BEGIN = /* glsl */ `
int csky_f = int(aFile + 0.5);
float csky_t = clamp(uT, 0.0, float(uK - 1));
int csky_k0 = int(floor(csky_t));
int csky_k1 = min(csky_k0 + 1, uK - 1);
float csky_fr = csky_t - float(csky_k0);
float csky_h = mix(cskyHeight(cskyLines(csky_f * uK + csky_k0)), cskyHeight(cskyLines(csky_f * uK + csky_k1)), csky_fr);
// Towers and setbacks narrow toward the top; shrink the crown to the top storey.
float csky_top = aBody < 0.5 ? 1.0 : aBody < 1.5 ? 0.72 : aBody < 2.5 ? 0.66 : 0.5;
vec3 transformed = vec3(position.x * csky_top, position.y + csky_h, position.z * csky_top);
if (abs(variant - aVariant) > 0.5 || csky_h <= 0.0 || aVariant < 0.5) transformed = vec3(0.0);
vCskyEmit = emit * (1.0 + fract(aFile * 0.37));
`

const FRAG_PARS = /* glsl */ `
varying vec3 vCskyEmissive;
varying vec3 vCskyPos;
varying vec3 vCskyNrm;
varying float vCskySeed;
varying float vCskyAct;
varying float vCskyH;
uniform float uWindows;
uniform float uWindowBase;
float cskyHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
`

// Procedural facades: per-building tint, darker roofs, and a grid of windows
// on the side faces, a random subset of which are lit. Runs after
// color_fragment so diffuseColor already holds the building's mode color.
const FRAG_FACADE = /* glsl */ `
{
  vec3 n = normalize(vCskyNrm);
  float s1 = fract(vCskySeed * 7.31);
  float s2 = fract(vCskySeed * 3.17);
  diffuseColor.rgb *= 0.85 + 0.3 * s1;
  if (n.y > 0.5) {
    // Roofs: flat grey membrane, a little lighter than the walls.
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.16, 0.17), 0.8);
  } else if (abs(n.y) < 0.5) {
    float along = abs(n.x) > 0.5 ? vCskyPos.z : vCskyPos.x;
    float up = vCskyPos.y;
    // Floors: a storey every 0.62 units, a slab line between them, and a
    // taller ground floor with wider openings.
    float floorH = 0.62;
    float winW = 0.42 + 0.14 * s2;
    bool ground = up < floorH * 1.3;
    float band = ground ? floorH * 1.3 : floorH;
    float fy = ground ? up / band : (up - floorH * 1.3) / band;
    float fx = along / winW;
    vec2 cell = vec2(floor(fx), ground ? -1.0 : floor(fy));
    vec2 f = vec2(fract(fx), fract(fy));
    // Slab edge between floors and a pilaster every few bays.
    float slab = smoothstep(0.0, 0.06, f.y) * (1.0 - smoothstep(0.94, 1.0, f.y));
    float pilaster = mod(cell.x + floor(s1 * 4.0), 4.0 + floor(s2 * 3.0)) < 1.0 ? 0.75 : 1.0;
    diffuseColor.rgb *= mix(0.55, 1.0, slab) * pilaster;
    bool inWin = uWindows > 0.5 && vCskyH > 1.3 && f.x > 0.26 && f.x < 0.74 && f.y > 0.2 && f.y < (ground ? 0.85 : 0.72) && up < vCskyH - 0.25 && pilaster > 0.9;
    if (inWin) {
      float r = cskyHash(cell + vec2(vCskySeed * 91.7, vCskySeed * 13.3) + floor(n.x * 2.0 + n.z * 3.0));
      // Some buildings are busy at this hour, some have gone home.
      float litFrac = (uWindowBase + 0.6 * vCskyAct) * (0.6 + 0.8 * s1) + (ground ? 0.35 : 0.0);
      if (r < litFrac) {
        float warm = fract(r * 17.0);
        vec3 light = warm < 0.7 ? vec3(1.0, 0.8, 0.5) : warm < 0.9 ? vec3(0.9, 0.94, 1.0) : vec3(0.75, 0.95, 0.9);
        csky_windowGlow = light * (0.9 + 0.9 * fract(r * 31.0));
        diffuseColor.rgb = light * 0.6;
      } else {
        // Dark glass: keeps a little sky in it via the environment map.
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.06, 0.08), 0.85);
      }
    }
  }
}
`
