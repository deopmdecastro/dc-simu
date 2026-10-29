import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Passagem de corrente no cabo 3D: bainha fina e nítida rente ao isolamento,
 * sem halo largo que polua feixes de cabos paralelos nas calhas.
 *
 * Impulsos direcionais bem espaçados percorrem o comprimento físico do condutor
 * ao mesmo passo em mm, preservando a cor IEC original do cabo entre impulsos.
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
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  void main() {
    float along = vUv.x * uLength;
    float behind = fract((uTime * uSpeed - along) / uSpacing);
    // Impulso curto com cabeça definida e cauda curta, deixando o cabo limpo entre impulsos.
    float tail = pow(max(0.0, 1.0 - behind * 2.1), 3.6);
    float head = 0.55 * smoothstep(0.955, 1.0, 1.0 - behind);
    float pulse = clamp(tail + head, 0.0, 1.0);
    float facing = clamp(abs(dot(normalize(vNormalView), normalize(vViewDir))), 0.0, 1.0);
    float centerMask = pow(facing, 1.55);
    float alpha = (0.025 + pulse * 0.82) * centerMask * uOpacity;
    vec3 color = mix(uColor, vec3(1.0), clamp(pulse * 0.42, 0.0, 0.55));
    gl_FragColor = vec4(color, alpha);
  }
`

/** Cabos escuros (preto, castanho) recebem um traço claro técnico para que o impulso seja legível. */
export function neonColor(hex: string): THREE.Color {
  const color = new THREE.Color(hex)
  const hsl = color.getHSL({ h: 0, s: 0, l: 0 })
  if (hsl.s < 0.16 && hsl.l < 0.35) return new THREE.Color('#7dd3fc')
  if (hsl.l < 0.42) color.setHSL(hsl.h, Math.min(hsl.s + 0.12, 0.88), 0.62)
  return color
}

function makeMaterial(color: THREE.Color, length: number) {
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uColor: { value: color },
      uTime: { value: 0 },
      uLength: { value: Math.max(0.05, length) },
      uSpacing: { value: 0.58 },
      uSpeed: { value: 0.44 },
      uOpacity: { value: 0.78 },
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
}: {
  curve: THREE.Curve<THREE.Vector3>
  segments: number
  radius: number
  color: string
}) {
  const length = useMemo(() => curve.getLength(), [curve])
  const tint = useMemo(() => neonColor(color), [color])
  const core = useMemo(() => makeMaterial(tint, length), [tint, length])
  useEffect(() => () => { core.dispose() }, [core])
  useFrame(({ clock }) => {
    core.uniforms.uTime.value = clock.elapsedTime
  })
  return (
    <group userData={{ noSnapshot: true }}>
      <mesh renderOrder={21} raycast={() => null} material={core}>
        <tubeGeometry args={[curve, Math.max(12, Math.round(segments * 0.75)), radius * 1.06, 10, false]} />
      </mesh>
    </group>
  )
}
