import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Corrente a passar no cabo: néon na cor do próprio cabo.
 *
 * Duas camadas de tubo aditivas por cima do cabo: um núcleo fino e brilhante e um
 * halo largo e suave. Um shader faz correr impulsos (cabeça intensa, cauda que se
 * apaga) ao longo do comprimento real do cabo, sempre ao mesmo passo em mm — um
 * cabo curto e um longo têm impulsos do mesmo tamanho. O brilho desvanece para as
 * arestas do tubo (como um tubo de néon visto de lado), nunca é um cilindro chapado.
 */

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  void main() {
    vUv = uv;
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    vNormalView = normalize(normalMatrix * normal);
    vViewDir = normalize(-view.xyz);
    gl_Position = projectionMatrix * view;
  }
`

const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uLength;
  uniform float uSpacing;
  uniform float uSpeed;
  uniform float uHalo;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  void main() {
    float along = vUv.x * uLength;
    // 0 na cabeça do impulso, cresce para trás (cauda).
    float behind = fract((uTime * uSpeed - along) / uSpacing);
    float pulse = pow(1.0 - behind, 7.0) + 0.9 * smoothstep(0.985, 1.0, 1.0 - behind);
    float facing = clamp(abs(dot(normalize(vNormalView), normalize(vViewDir))), 0.0, 1.0);
    float edge = uHalo > 0.5 ? pow(facing, 2.2) : pow(facing, 0.8);
    float base = uHalo > 0.5 ? 0.10 : 0.22;
    float intensity = (base + pulse * (uHalo > 0.5 ? 0.9 : 1.6)) * edge;
    // Núcleo da cabeça a puxar para branco, como um gás de néon saturado.
    vec3 color = mix(uColor, vec3(1.0), clamp(pulse * (uHalo > 0.5 ? 0.15 : 0.55), 0.0, 0.8));
    gl_FragColor = vec4(color * (1.0 + pulse * 1.4), intensity * uOpacity);
  }
`

/** Cabos escuros (preto, castanho) brilham num tom claro do mesmo matiz — senão o néon não se vê. */
export function neonColor(hex: string): THREE.Color {
  const color = new THREE.Color(hex)
  const hsl = color.getHSL({ h: 0, s: 0, l: 0 })
  if (hsl.l < 0.42) color.setHSL(hsl.h, Math.min(hsl.s, 0.85), hsl.s < 0.2 ? 0.82 : 0.58)
  return color
}

function makeMaterial(color: THREE.Color, halo: boolean, length: number) {
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uColor: { value: color },
      uTime: { value: 0 },
      uLength: { value: length },
      uSpacing: { value: 0.32 },
      uSpeed: { value: 0.42 },
      uHalo: { value: halo ? 1 : 0 },
      uOpacity: { value: halo ? 0.55 : 1 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: halo ? THREE.BackSide : THREE.FrontSide,
  })
}

export default function NeonCurrent3D({ curve, segments, radius, color }: { curve: THREE.Curve<THREE.Vector3>; segments: number; radius: number; color: string }) {
  const length = useMemo(() => curve.getLength(), [curve])
  const tint = useMemo(() => neonColor(color), [color])
  const core = useMemo(() => makeMaterial(tint, false, length), [tint, length])
  const halo = useMemo(() => makeMaterial(tint, true, length), [tint, length])
  useEffect(() => () => { core.dispose(); halo.dispose() }, [core, halo])
  useFrame(({ clock }) => {
    core.uniforms.uTime.value = clock.elapsedTime
    halo.uniforms.uTime.value = clock.elapsedTime
  })
  return <group userData={{ noSnapshot: true }}>
    <mesh renderOrder={21} raycast={() => null} material={core}>
      <tubeGeometry args={[curve, segments, radius * 1.12, 12, false]} />
    </mesh>
    <mesh renderOrder={22} raycast={() => null} material={halo}>
      <tubeGeometry args={[curve, segments, radius * 2.6, 12, false]} />
    </mesh>
  </group>
}
