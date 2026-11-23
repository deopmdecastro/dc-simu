import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Passagem de corrente / fluido no cabo ou tubo 3D.
 *
 * Variantes:
 * - electric: impulsos direcionais nítidos (efeito existente)
 * - air: fluxo de ar — impulsos mais espaçados, rápidos e claros (seco)
 * - water: fluxo de água — impulsos mais densos e lentos, tom azul-água
 */

export type NeonFlowVariant = 'electric' | 'air' | 'water'

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
  uniform float uOpacity;
  uniform float uSoftness;
  uniform float uBubble;
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  void main() {
    float along = vUv.x * uLength;
    float behind = fract((uTime * uSpeed - along) / uSpacing);
    // Impulso com cabeça e cauda; uSoftness alarga a cauda (água) ou mantém curta (ar/elétrico).
    float tail = pow(max(0.0, 1.0 - behind * (1.6 + uSoftness * 1.2)), 2.8 + uSoftness * 1.4);
    float head = (0.45 + 0.2 * (1.0 - uSoftness)) * smoothstep(0.94, 1.0, 1.0 - behind);
    float pulse = clamp(tail + head, 0.0, 1.0);
    // Bolhas suaves só na variante água (padrão periódico ao longo do tubo).
    float bubbles = 0.0;
    if (uBubble > 0.01) {
      float b = fract(along * 7.3 + uTime * 0.55);
      bubbles = uBubble * smoothstep(0.72, 0.88, b) * smoothstep(1.0, 0.92, b);
    }
    float facing = clamp(abs(dot(normalize(vNormalView), normalize(vViewDir))), 0.0, 1.0);
    float centerMask = pow(facing, 1.35 + uSoftness * 0.4);
    float alpha = (0.02 + pulse * 0.78 + bubbles * 0.35) * centerMask * uOpacity;
    vec3 color = mix(uColor, vec3(1.0), clamp(pulse * (0.38 - uSoftness * 0.12) + bubbles * 0.25, 0.0, 0.55));
    gl_FragColor = vec4(color, alpha);
  }
`

/** Cabos escuros (preto, castanho) recebem um traço claro técnico para que o impulso seja legível. */
export function neonColor(hex: string, variant: NeonFlowVariant = 'electric'): THREE.Color {
  if (variant === 'air') return new THREE.Color('#e0f2fe')
  if (variant === 'water') return new THREE.Color('#38bdf8')
  const color = new THREE.Color(hex)
  const hsl = color.getHSL({ h: 0, s: 0, l: 0 })
  if (hsl.s < 0.16 && hsl.l < 0.35) return new THREE.Color('#7dd3fc')
  if (hsl.l < 0.42) color.setHSL(hsl.h, Math.min(hsl.s + 0.12, 0.88), 0.62)
  return color
}

function paramsForVariant(variant: NeonFlowVariant, length: number) {
  if (variant === 'air') {
    return { spacing: 0.92, speed: 0.72, opacity: 0.55, softness: 0.15, bubble: 0.0, length }
  }
  if (variant === 'water') {
    return { spacing: 0.38, speed: 0.28, opacity: 0.72, softness: 0.85, bubble: 0.55, length }
  }
  return { spacing: 0.58, speed: 0.44, opacity: 0.78, softness: 0.0, bubble: 0.0, length }
}

function makeMaterial(color: THREE.Color, length: number, variant: NeonFlowVariant) {
  const p = paramsForVariant(variant, length)
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uColor: { value: color },
      uTime: { value: 0 },
      uLength: { value: Math.max(0.05, p.length) },
      uSpacing: { value: p.spacing },
      uSpeed: { value: p.speed },
      uOpacity: { value: p.opacity },
      uSoftness: { value: p.softness },
      uBubble: { value: p.bubble },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.FrontSide,
  })
}

export default function NeonCurrent3D({
  curve,
  segments,
  radius,
  color,
  variant = 'electric',
}: {
  curve: THREE.Curve<THREE.Vector3>
  segments: number
  radius: number
  color: string
  variant?: NeonFlowVariant
}) {
  const length = useMemo(() => curve.getLength(), [curve])
  const tint = useMemo(() => neonColor(color, variant), [color, variant])
  const core = useMemo(() => makeMaterial(tint, length, variant), [tint, length, variant])
  useEffect(() => () => { core.dispose() }, [core])
  useFrame(({ clock }) => {
    core.uniforms.uTime.value = clock.elapsedTime
  })
  // Ar: tubo um pouco mais largo e suave; água: intermédio; elétrico: rente ao isolamento
  const radiusScale = variant === 'air' ? 1.12 : variant === 'water' ? 1.08 : 1.06
  return (
    <group userData={{ noSnapshot: true }}>
      <mesh renderOrder={21} raycast={() => null} material={core}>
        <tubeGeometry args={[curve, Math.max(12, Math.round(segments * 0.75)), radius * radiusScale, 10, false]} />
      </mesh>
    </group>
  )
}
