import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { GLOW_SPECS, glowFrame, glowTexture, stepGlow, type GlowKind } from './glow'

interface GlowHaloProps {
  color: string
  on: boolean
  /** Raio da lente em unidades do painel; o halo é proporcional. */
  radius: number
  position?: [number, number, number]
  kind?: GlowKind
  blink?: boolean
  /** Tempos de subida/descida (s). */
  rise?: number
  fall?: number
  /** Luz projetada nos aparelhos vizinhos (só sinaleiros; LEDs pequenos não precisam). */
  castLight?: boolean
}

/**
 * Brilho real de um sinalizador: halo aditivo sempre virado para a câmara, com subida/descida suaves,
 * pisca e leve cintilação, mais uma luz de ponto cuja intensidade acompanha o brilho.
 * A luz existe sempre (intensidade 0 quando apagada) para não recompilar shaders ao acender.
 */
export function GlowHalo({ color, on, radius, position = [0, 0, 0], kind = 'lamp', blink = false, rise, fall, castLight }: GlowHaloProps) {
  const spec = GLOW_SPECS[kind]
  const level = useRef(on ? 1 : 0)
  const sprite = useRef<THREE.Sprite>(null)
  const light = useRef<THREE.PointLight>(null)
  const material = useMemo(() => new THREE.SpriteMaterial({
    map: glowTexture(THREE) ?? undefined, color, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
  }), [])
  useEffect(() => { material.color.set(color) }, [material, color])
  useEffect(() => () => material.dispose(), [material])
  const withLight = castLight ?? kind !== 'led'

  useFrame(({ clock }, delta) => {
    level.current = stepGlow(level.current, on, delta, rise ?? (kind === 'led' ? 0.04 : 0.09), fall ?? (kind === 'led' ? 0.1 : 0.28))
    const frame = glowFrame(spec, level.current, clock.elapsedTime, blink)
    material.opacity = Math.min(1, frame.haloOpacity)
    if (sprite.current) {
      const size = radius * frame.haloScale
      sprite.current.scale.set(size, size, 1)
      sprite.current.visible = frame.haloOpacity > 0.004
    }
    if (light.current) light.current.intensity = frame.light
  })

  return <group position={position} userData={{ noPick: true, noSnapshot: true }}>
    <sprite ref={sprite} material={material} renderOrder={40} raycast={() => null} visible={on} />
    {withLight && <pointLight ref={light} color={color} intensity={0} distance={radius * 22} decay={2} position={[0, 0, radius * 1.5]} />}
  </group>
}

export default GlowHalo
