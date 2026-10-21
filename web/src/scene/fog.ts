import * as THREE from 'three'

/**
 * Height fog for every fogged material in the scene, by replacing three's
 * fog shader chunks before any material compiles. Streets sit in haze and
 * the tall buildings rise out of it, which is what makes the city read as
 * deep instead of flat. Uses the ordinary linear `fog` object on the scene:
 * the haze ceiling is a fraction of `fogFar`, so it scales with city size.
 */
let patched = false

export function patchHeightFog(): void {
  if (patched) return
  patched = true

  THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying float vFogY;
#endif
`
  THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  #ifdef USE_INSTANCING
    vFogY = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).y;
  #else
    vFogY = ( modelMatrix * vec4( transformed, 1.0 ) ).y;
  #endif
#endif
`
  THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying float vFogY;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif
`
  THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    // Haze ceiling: the ground is fully inside it, rooftops above it are clear.
    float hazeTop = fogFar * 0.035;
    float low = 1.0 - smoothstep( 0.0, hazeTop, vFogY );
    float dist = smoothstep( fogNear, fogFar, vFogDepth );
    // Distance fog is strongest down in the haze; a little ground haze shows
    // even nearby so streets look like they have air over them.
    float haze = low * 0.18 * smoothstep( 0.0, fogNear, vFogDepth );
    float fogFactor = clamp( dist * ( 0.35 + 0.65 * low ) + haze, 0.0, 1.0 );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`
}
