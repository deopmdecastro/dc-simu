import { useMemo } from 'react'
import * as THREE from 'three'
import type { ElectricalComponent } from '../types'
import { useSimStore } from '../store/useSimStore'
import { PANEL_UNITS_PER_MM } from './modelPaths'
import { cctLightPalette } from './lightingModel'
import { EditableFieldCable3D } from './EditableCable3D'

const U = PANEL_UNITS_PER_MM

export type TriProofWattage = 18 | 30 | 40 | 50 | 60
export type TriProofCct = 3000 | 4000 | 5000 | 6500

export function triProofDimsOf(state: Record<string, unknown> | undefined) {
  const s = state ?? {}
  const wRaw = Number(s.wattage ?? 40)
  const wattage: TriProofWattage =
    wRaw <= 22 ? 18 : wRaw <= 35 ? 30 : wRaw <= 45 ? 40 : wRaw <= 55 ? 50 : 60
  const cctRaw = Number(s.cctK ?? s.cct ?? 4000)
  const cct: TriProofCct =
    cctRaw <= 3400 ? 3000 : cctRaw <= 4500 ? 4000 : cctRaw <= 5700 ? 5000 : 6500
  const lengthMm = wattage === 18 ? 600 : wattage === 30 ? 900 : wattage === 40 ? 1200 : 1500
  const widthMm = 78
  const heightMm = 68
  const linkable = s.linkable !== false
  const lumens = Math.round(wattage * 130)
  return { wattage, cct, lengthMm, widthMm, heightMm, linkable, lumens }
}

/**
 * Luminária Linear Estanque IP65 Tri-Proof LED Batten — Potência & CCT Ajustáveis, Linkable
 * (Fiel à imagem de referência image-60.png: difusor prismático fosco em policarbonato,
 *  corpo cinza-claro ABS com tampas arredondadas, 2 clips em aço inox e prensa-cabos PG13.5).
 */
export function TriProofLedBatten3D({
  component,
  position = [0, 0, 0],
  externalCableTarget = null,
}: {
  component: ElectricalComponent
  position?: [number, number, number]
  externalCableTarget?: [number, number, number] | null
}) {
  const simActive = useSimStore((s) => s.sim.runState !== 'stopped')
  const { wattage, cct, lengthMm, widthMm, heightMm, linkable } = triProofDimsOf(component.state)
  const lit = Boolean(component.state.on || component.state.lit || component.state.testOn || component.state.manualTest)
  void simActive
  const palette = cctLightPalette(cct)

  const L = lengthMm * U
  const W = widthMm * U
  const H = heightMm * U
  const endCapL = 44 * U
  const bodyL = Math.max(0.4, L - endCapL * 2)

  // Perfil extrudado arredondado fiel ao corpo + difusor prismático de image-60.png
  const diffuserGeom = useMemo(() => {
    const shape = new THREE.Shape()
    const hw = W * 0.47
    const hh = H * 0.42
    shape.moveTo(-hw, 0)
    shape.lineTo(-hw, -hh * 0.45)
    shape.quadraticCurveTo(-hw, -hh, -hw * 0.42, -hh)
    shape.lineTo(hw * 0.42, -hh)
    shape.quadraticCurveTo(hw, -hh, hw, -hh * 0.45)
    shape.lineTo(hw, 0)
    shape.closePath()
    const g = new THREE.ExtrudeGeometry(shape, { depth: bodyL, bevelEnabled: false })
    g.translate(0, 0, -bodyL / 2)
    g.rotateY(Math.PI / 2)
    return g
  }, [W, H, bodyL])

  const litIntensity = lit ? Math.min(0.92, 0.42 + (wattage / 60) * 0.45) : 0

  return (
    <group position={position} name={`triproof-led-batten-${component.id}`}>
      {/* Base superior cinza-claro ABS IP65 (RAL 7035) */}
      <mesh position={[0, H * 0.20, 0]} castShadow receiveShadow>
        <boxGeometry args={[bodyL + 8 * U, H * 0.42, W * 0.94]} />
        <meshStandardMaterial color="#cfd5dc" roughness={0.38} metalness={0.08} />
      </mesh>
      {/* Canal lateral de encaixe da junta de estanquidade */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[bodyL + 4 * U, 5 * U, W * 0.97]} />
        <meshStandardMaterial color="#adb6c0" roughness={0.48} />
      </mesh>

      {/* Difusor prismático fosco em policarbonato (ilumina na temperatura CCT exata quando ligado!) */}
      <mesh geometry={diffuserGeom} castShadow receiveShadow>
        <meshPhysicalMaterial
          color={lit ? palette.bulbTintHex : '#eef2f6'}
          emissive={lit ? palette.emissiveHex : '#000000'}
          emissiveIntensity={litIntensity}
          roughness={lit ? 0.16 : 0.28}
          metalness={0.02}
          clearcoat={0.65}
          clearcoatRoughness={0.18}
          toneMapped={true}
        />
      </mesh>

      {/* Tampas laterais moldadas IP65 + patilhas de fecho (esquerda e direita) */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * (bodyL / 2 + endCapL * 0.46), 0, 0]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[endCapL, H * 0.94, W * 1.02]} />
            <meshStandardMaterial color="#d2d8df" roughness={0.36} metalness={0.06} />
          </mesh>
          {/* Recorte/patilha lateral de fecho estanque (detalhe exato de image-60.png) */}
          {[-1, 1].map((zSide) => (
            <mesh key={zSide} position={[-side * endCapL * 0.22, H * 0.06, zSide * W * 0.515]}>
              <boxGeometry args={[endCapL * 0.44, H * 0.34, 4 * U]} />
              <meshStandardMaterial color="#b4bec9" roughness={0.44} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Prensa-cabo estanque PG13.5 na entrada (direita) + prensa-cabo linkable (esquerda) */}
      {[1, ...(linkable ? [-1] : [])].map((side) => (
        <group key={side} position={[side * (L / 2 + 8 * U), H * 0.12, 0]} rotation={[0, 0, -side * Math.PI / 2]}>
          {/* Base hexagonal fixa */}
          <mesh position={[0, 4 * U, 0]} castShadow>
            <cylinderGeometry args={[14 * U, 15 * U, 10 * U, 6]} />
            <meshStandardMaterial color="#b7c0ca" roughness={0.42} metalness={0.06} />
          </mesh>
          {/* Corpo roscado + porca de aperto estanque */}
          <mesh position={[0, 15 * U, 0]} castShadow>
            <cylinderGeometry args={[11 * U, 13 * U, 14 * U, 16]} />
            <meshStandardMaterial color="#c4ccd6" roughness={0.38} />
          </mesh>
          {/* Anel de borracha EPDM preto */}
          <mesh position={[0, 23 * U, 0]}>
            <cylinderGeometry args={[7 * U, 9 * U, 4 * U, 14]} />
            <meshStandardMaterial color="#272d36" roughness={0.78} />
          </mesh>
        </group>
      ))}

      {/* 2 Clips metálicos de fixação em aço inoxidável no topo (fiel a image-60.png) */}
      {[-L * 0.28, L * 0.28].map((cx, i) => (
        <group key={i} position={[cx, H * 0.44, 0]}>
          <mesh castShadow>
            <boxGeometry args={[26 * U, 5 * U, W * 0.96]} />
            <meshStandardMaterial color="#dce3ec" metalness={0.92} roughness={0.18} />
          </mesh>
          {[-1, 1].map((zS) => (
            <mesh key={zS} position={[0, -9 * U, zS * W * 0.49]} castShadow>
              <boxGeometry args={[22 * U, 16 * U, 3.5 * U]} />
              <meshStandardMaterial color="#cbd5e1" metalness={0.92} roughness={0.2} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Luz pontual suave e equilibrada quando ligada (sem halo gigante que ofusca o canvas) */}
      {lit && (
        <pointLight position={[0, -H * 0.85, 0]} color={palette.bulbTintHex} intensity={0.42 + (wattage / 60) * 0.48} distance={6.5} decay={2} />
      )}

      {/* Cabo editável opcional alinhado exatamente com o prensa-cabo PG13.5 escolhido */}
      {(() => {
        const exitDir = String(component.state.cableExitDir ?? 'right')
        const anchor: [number, number, number] =
          exitDir === 'left'
            ? [-(L / 2 + 24 * U), H * 0.12, 0]
            : exitDir === 'top'
              ? [0, H * 0.44, 0]
              : exitDir === 'bottom'
                ? [0, -H * 0.44, 0]
                : exitDir === 'back'
                  ? [0, H * 0.12, -W * 0.48]
                  : [L / 2 + 24 * U, H * 0.12, 0]
        return (
          <EditableFieldCable3D
            component={component}
            anchor={anchor}
            externalTarget={externalCableTarget}
            defaultConfig={{ exitDir: 'right', lengthMm: 650, diameterMm: 9, color: '#181c22' }}
            conductorColors={['#92400e', '#2563eb', '#16a34a']}
          />
        )
      })()}
    </group>
  )
}
