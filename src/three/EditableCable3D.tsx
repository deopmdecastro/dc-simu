import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { ComponentType, ElectricalComponent } from '../types'
import { PANEL_UNITS_PER_MM } from './modelPaths'

const U = PANEL_UNITS_PER_MM

export type CableExitDirection = 'bottom' | 'top' | 'left' | 'right' | 'back'

export interface EditableCableConfig {
  enabled: boolean
  lengthMm: number
  diameterMm: number
  color: string
  exitDir: CableExitDirection
  bendXMm: number
  bendYMm: number
  bendZMm: number
  endXMm: number
  endYMm: number
  endZMm: number
  corrugated: boolean
}

export function isEditableCableDeviceType(type: ComponentType): boolean {
  return (
    type === 'floatSwitch' ||
    type === 'towerLight' ||
    type === 'proximitySensor' ||
    type === 'photoSensor' ||
    type === 'limitSwitch' ||
    type === 'thermostat' ||
    type === 'pressureSwitch' ||
    type === 'hydraulicFlowMeter' ||
    type === 'triProofLedBatten' ||
    type === 'lampLedE27' ||
    type === 'lampIncandescentE27' ||
    type === 'lampFluorescentE27' ||
    type === 'waterPump' ||
    type === 'pneumaticValve52'
  )
}

export function editableCableConfigOf(state: Record<string, unknown> | undefined, defaults?: Partial<EditableCableConfig>): EditableCableConfig {
  const s = state ?? {}
  const exitRaw = String(s.cableExitDir ?? defaults?.exitDir ?? 'bottom')
  const exitDir: CableExitDirection =
    exitRaw === 'top' || exitRaw === 'left' || exitRaw === 'right' || exitRaw === 'back' ? exitRaw : 'bottom'
  return {
    enabled: s.cableEnabled !== undefined ? Boolean(s.cableEnabled) : (defaults?.enabled ?? false),
    lengthMm: Math.max(150, Math.min(6000, Number(s.cableLengthMm ?? defaults?.lengthMm ?? 900))),
    diameterMm: Math.max(4, Math.min(22, Number(s.cableDiameterMm ?? defaults?.diameterMm ?? 8))),
    color: typeof s.cableColor === 'string' && s.cableColor ? s.cableColor : (defaults?.color ?? '#181c22'),
    exitDir,
    bendXMm: Math.max(-2000, Math.min(2000, Number(s.cableBendXMm ?? defaults?.bendXMm ?? 0))),
    bendYMm: Math.max(-2000, Math.min(2000, Number(s.cableBendYMm ?? defaults?.bendYMm ?? 0))),
    bendZMm: Math.max(-2000, Math.min(2000, Number(s.cableBendZMm ?? defaults?.bendZMm ?? 0))),
    endXMm: Math.max(-3500, Math.min(3500, Number(s.cableEndXMm ?? defaults?.endXMm ?? 0))),
    endYMm: Math.max(-3500, Math.min(3500, Number(s.cableEndYMm ?? defaults?.endYMm ?? 0))),
    endZMm: Math.max(-3500, Math.min(3500, Number(s.cableEndZMm ?? defaults?.endZMm ?? 0))),
    corrugated: Boolean(s.cableCorrugated ?? defaults?.corrugated ?? false),
  }
}

/**
 * Cabo de campo 3D totalmente editável para bóias, torres de sinalização, sensores, luminárias e contadores.
 * Permite editar comprimento, direção de saída, curva intermédia (X/Y/Z), ponto final (X/Y/Z),
 * cor da bainha, diâmetro e proteção em tubo corrugado flexível.
 */
export function EditableFieldCable3D({
  component,
  anchor = [0, 0, 0],
  defaultConfig,
  conductorColors = ['#92400e', '#111827', '#2563eb'],
}: {
  component: ElectricalComponent
  anchor?: [number, number, number]
  defaultConfig?: Partial<EditableCableConfig>
  conductorColors?: string[]
}) {
  const cfg = editableCableConfigOf(component.state, defaultConfig)

  const built = useMemo(() => {
    if (!cfg.enabled) return null
    const L = cfg.lengthMm * U
    const R = Math.max(0.016, (cfg.diameterMm * 0.5) * U)
    const dirVec =
      cfg.exitDir === 'top'
        ? new THREE.Vector3(0, 1, 0)
        : cfg.exitDir === 'left'
          ? new THREE.Vector3(-1, 0, 0)
          : cfg.exitDir === 'right'
            ? new THREE.Vector3(1, 0, 0)
            : cfg.exitDir === 'back'
              ? new THREE.Vector3(0, 0, -1)
              : new THREE.Vector3(0, -1, 0)

    const p0 = new THREE.Vector3(anchor[0], anchor[1], anchor[2])
    const p1 = p0.clone().addScaledVector(dirVec, Math.min(L * 0.25, 0.42))
    const defaultEnd = p0.clone().addScaledVector(dirVec, L * 0.72).add(new THREE.Vector3(dirVec.x === 0 ? L * 0.24 : 0, dirVec.y === 0 ? -L * 0.22 : 0, 0))
    const pEnd = new THREE.Vector3(
      defaultEnd.x + cfg.endXMm * U,
      defaultEnd.y + cfg.endYMm * U,
      defaultEnd.z + cfg.endZMm * U,
    )
    const pMid = p0.clone().lerp(pEnd, 0.52).add(new THREE.Vector3(
      cfg.bendXMm * U,
      cfg.bendYMm * U - (cfg.exitDir === 'left' || cfg.exitDir === 'right' ? 0.14 : 0),
      cfg.bendZMm * U + 0.08,
    ))

    const curve = new THREE.CatmullRomCurve3([p0, p1, pMid, pEnd])
    const tube = new THREE.TubeGeometry(curve, 36, R, 12, false)

    // Anéis corrugados opcionais se o utilizador ativar proteção corrugada no cabo
    const ringMatrices: THREE.Matrix4[] = []
    if (cfg.corrugated) {
      const steps = Math.max(12, Math.min(90, Math.round(curve.getLength() / Math.max(0.032, R * 1.15))))
      const up = new THREE.Vector3(0, 1, 0)
      const q = new THREE.Quaternion()
      const s = new THREE.Vector3(1, 1, 1)
      for (let i = 1; i < steps; i++) {
        const t = i / steps
        const pt = curve.getPointAt(t)
        const tan = curve.getTangentAt(t).normalize()
        q.setFromUnitVectors(up, tan)
        ringMatrices.push(new THREE.Matrix4().compose(pt, q, s))
      }
    }

    const endTan = curve.getTangentAt(1).normalize()
    const endQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), endTan)

    return { tube, R, p0, pEnd, endQuat, ringMatrices, dirVec }
  }, [
    cfg.enabled,
    cfg.lengthMm,
    cfg.diameterMm,
    cfg.exitDir,
    cfg.bendXMm,
    cfg.bendYMm,
    cfg.bendZMm,
    cfg.endXMm,
    cfg.endYMm,
    cfg.endZMm,
    cfg.corrugated,
    anchor[0],
    anchor[1],
    anchor[2],
  ])

  useEffect(() => () => { built?.tube.dispose() }, [built])

  if (!built) return null

  const { tube, R, p0, pEnd, endQuat, ringMatrices, dirVec } = built
  const glandQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirVec)

  return (
    <group name={`editable-field-cable-${component.id}`}>
      {/* Prensa-cabo PG na saída do equipamento */}
      <group position={p0} quaternion={glandQuat}>
        <mesh position={[0, R * 1.1, 0]} castShadow>
          <cylinderGeometry args={[R * 1.45, R * 1.65, R * 2.2, 6]} />
          <meshStandardMaterial color="#475569" roughness={0.44} metalness={0.35} />
        </mesh>
        <mesh position={[0, R * 2.35, 0]} castShadow>
          <cylinderGeometry args={[R * 1.18, R * 1.38, R * 1.1, 12]} />
          <meshStandardMaterial color="#1e293b" roughness={0.68} />
        </mesh>
      </group>

      {/* Bainha principal do cabo */}
      <mesh geometry={tube} castShadow receiveShadow>
        <meshStandardMaterial color={cfg.color} roughness={0.55} metalness={0.06} />
      </mesh>

      {/* Anéis de tubo corrugado de proteção (se ativo) */}
      {cfg.corrugated && ringMatrices.map((m, idx) => {
        const pos = new THREE.Vector3()
        const quat = new THREE.Quaternion()
        const scl = new THREE.Vector3()
        m.decompose(pos, quat, scl)
        return (
          <mesh key={idx} position={pos} quaternion={quat} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <torusGeometry args={[R * 1.18, R * 0.24, 6, 12]} />
            <meshStandardMaterial color="#1c2026" roughness={0.58} metalness={0.12} />
          </mesh>
        )
      })}

      {/* Pontas descarnadas coloridas + ponteiras metálicas prontas para ligação */}
      <group position={pEnd} quaternion={endQuat}>
        {conductorColors.map((col, idx) => {
          const offset = (idx - (conductorColors.length - 1) / 2) * R * 1.05
          return (
            <group key={idx} position={[offset, 0, 0]}>
              <mesh position={[0, -R * 2.4, 0]} castShadow>
                <cylinderGeometry args={[R * 0.34, R * 0.34, R * 4.8, 8]} />
                <meshStandardMaterial color={col} roughness={0.45} />
              </mesh>
              <mesh position={[0, -R * 5.2, 0]}>
                <cylinderGeometry args={[R * 0.22, R * 0.22, R * 1.6, 8]} />
                <meshStandardMaterial color="#e2e8f0" metalness={0.9} roughness={0.2} />
              </mesh>
            </group>
          )
        })}
      </group>
    </group>
  )
}
