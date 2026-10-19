import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useStore } from '../store'
import { ACTIVITY, CHURN, FIRE, GHOST, GPU_MODE, GRAY, OWNER_SLOTS, fileColor, makeColorContext, paletteSlot, type RGB } from '../city/colors'
import { height, type HeightScale } from '../city/scales'
import { linesAt, type TimelineData } from '../city/timeline'
import type { City } from '../city/types'

// Unit box with its origin at the base so scale.y is the building height.
const BOX = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)
const LOT_MARGIN = 0.12 // gap between a building and its lot edge

const HOVER: RGB = [1, 1, 1]
const SELECT: RGB = [0.49, 0.77, 1]
const HEIGHT_MODE: Record<HeightScale, number> = { sqrt: 0, log: 1, linear: 2 }

/**
 * All buildings as one InstancedMesh. Heights and timeline colors are computed
 * in the vertex shader from keyframe textures, so scrubbing time costs a
 * single uniform update however many buildings there are.
 */
export function Buildings({ city, timeline }: { city: City; timeline: TimelineData }) {
  const mesh = useRef<THREE.InstancedMesh>(null!)
  const mode = useStore((s) => s.mode)
  const heightScale = useStore((s) => s.heightScale)
  const hideGenerated = useStore((s) => s.hideGenerated)
  const hovered = useStore((s) => s.hovered)
  const selected = useStore((s) => s.selected)
  const k = useStore((s) => s.k)
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
    }),
    [timeline, textures, city],
  )

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.1 })
    m.customProgramCacheKey = () => 'csky-buildings'
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = VERT_PARS + shader.vertexShader
        .replace('#include <color_vertex>', '#include <color_vertex>\n' + VERT_SAMPLE)
        .replace('#include <begin_vertex>', VERT_BEGIN)
      shader.fragmentShader = FRAG_PARS + shader.fragmentShader
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vCskyEmissive;')
    }
    return m
  }, [uniforms])
  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    uniforms.uMode.value = GPU_MODE[mode]
    uniforms.uHeightMode.value = HEIGHT_MODE[heightScale]
  }, [uniforms, mode, heightScale])

  useFrame(() => {
    uniforms.uT.value = useStore.getState().t
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

  // Static per-file flags the timeline textures do not carry: 1 = ghost.
  const aFlags = useMemo(() => {
    const arr = new Float32Array(Math.max(1, city.files.length))
    visible.forEach((fi, slot) => (arr[slot] = city.files[fi]!.ghost ? 1 : 0))
    return new THREE.InstancedBufferAttribute(arr, 1)
  }, [city, visible])

  useEffect(() => {
    const m = mesh.current
    m.geometry.setAttribute('aFile', aFile)
    m.geometry.setAttribute('aFlags', aFlags)
  }, [aFile, aFlags])

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
    paint(selected, SELECT, 2)
    paint(hovered, HOVER, 1)
    m.instanceColor.needsUpdate = true
    highlight.needsUpdate = true
    m.geometry.setAttribute('aHighlight', highlight)
  }, [base, slotOf, hovered, selected, visible.length, highlight])

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
    <instancedMesh
      ref={mesh}
      args={[BOX, material, Math.max(1, city.files.length)]}
      castShadow
      receiveShadow
      frustumCulled={false}
      onPointerMove={onMove}
      onPointerOut={() => hover(null)}
      onClick={onClick}
    />
  )
}

// ---------------------------------------------------------------------------
// GLSL. Injected into MeshStandardMaterial so lighting/shadows stay intact.

const VERT_PARS = /* glsl */ `
attribute float aFile;
attribute float aHighlight;
attribute float aFlags;
uniform vec3 uGhost;
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
    if (aFlags > 0.5 && csky_t >= float(uK - 1) - 0.001) vColor.rgb = uGhost;
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

const FRAG_PARS = /* glsl */ `
varying vec3 vCskyEmissive;
`
