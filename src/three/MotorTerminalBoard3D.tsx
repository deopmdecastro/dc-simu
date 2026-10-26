import type { ElectricalComponent } from '../types'
import { useSimStore } from '../store/useSimStore'
import { PANEL_UNITS_PER_MM } from './modelPaths'
import { MOTOR_BOARD, MOTOR_BOARD_TOP, MOTOR_STUD, motorBridges, motorCadToCentered } from './motorTerminalLayout'

/**
 * Pontes de latão Y/Δ da caixa de bornes do motor (a placa, os pernos e a
 * marcação fazem parte da geometria do modelo — `motorTerminalBox.ts`).
 *
 * Desenha no referencial do componente: centrado em X/Z, base em Y = 0, em
 * unidades de cena (`unitsPerMm`). Clicar na placa troca Y → Δ → sem pontes.
 */
export default function MotorTerminalBoard3D({ c, interactive = true, unitsPerMm = PANEL_UNITS_PER_MM }: { c: ElectricalComponent; interactive?: boolean; unitsPerMm?: number }) {
  const connection = (String(c.state.motorConnection ?? 'star') as 'star' | 'delta' | 'none')
  const next = connection === 'none' ? 'star' : connection === 'star' ? 'delta' : 'none'
  const u = unitsPerMm
  const board = motorCadToCentered([MOTOR_BOARD.cx, MOTOR_BOARD_TOP + 4, MOTOR_BOARD.cz]).map((v) => v * u) as [number, number, number]
  return <group onClick={(event) => { if (!interactive) return; event.stopPropagation(); useSimStore.getState().setComponentState(c.id, { motorConnection: next }) }}>
    {/* alvo de clique invisível sobre a placa */}
    <mesh position={board}><boxGeometry args={[MOTOR_BOARD.w * u, 8 * u, MOTOR_BOARD.d * u]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
    {motorBridges(connection).map((bridge) => {
      const center = motorCadToCentered(bridge.center).map((v) => v * u) as [number, number, number]
      const size: [number, number, number] = bridge.along === 'x' ? [bridge.length * u, (MOTOR_STUD.washer + .2) * u, 7 * u] : [7 * u, (MOTOR_STUD.washer + .2) * u, bridge.length * u]
      return <mesh key={bridge.key} position={center} castShadow>
        <boxGeometry args={size} /><meshStandardMaterial color="#d2a33a" metalness={0.9} roughness={0.25} />
      </mesh>
    })}
  </group>
}
