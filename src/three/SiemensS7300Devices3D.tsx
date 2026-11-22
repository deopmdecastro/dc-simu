import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import type { ElectricalComponent } from '../types'
import { useSimStore } from '../store/useSimStore'
import { PANEL_UNITS_PER_MM } from './modelPaths'
import {
  applyS7300ModuleState,
  createS7300ModuleObject,
  disposeS7300ModuleObject,
  isS7300ModuleType,
  S7300_MODULE_DIMS,
  type S7300ModuleType,
} from './siemensS7300Model'

/** Módulo S7-300 procedural (CPU PN/DP, SM321, SM322, SM334) — escala mm → unidades de painel. */
export function SiemensS7300Module3D({
  c,
  position,
  interactive = true,
}: {
  c: ElectricalComponent
  position: [number, number, number]
  interactive?: boolean
}) {
  const type = c.type as S7300ModuleType
  if (!isS7300ModuleType(type)) throw new Error(`Tipo S7-300 inválido: ${c.type}`)
  const object = useMemo(() => createS7300ModuleObject(type), [type])
  const invalidate = useThree((s) => s.invalidate)
  const simTick = useSimStore((s) => s.simTick)

  useEffect(() => {
    applyS7300ModuleState(object, type, c.state)
    invalidate()
  }, [object, type, c.state, simTick, invalidate])

  useEffect(() => () => disposeS7300ModuleObject(object), [object])

  const onClick = () => {
    if (!interactive || c.locked) return
    // Clique no seletor de modo da CPU: alterna RUN ↔ STOP
    if (type !== 'plcSiemensS7300Cpu315PnDp') return
    const store = useSimStore.getState()
    if (store.tool !== 'select') return
    const mode = String(c.state.mode ?? 'STOP').toUpperCase() === 'RUN' ? 'STOP' : 'RUN'
    store.operateComponent(c.id, { mode, ledRUN: mode === 'RUN', ledSTOP: mode !== 'RUN' })
  }

  // Modelo construído em mm; escala para unidades de painel (1 mm = 0.01 u)
  return (
    <group position={position} scale={PANEL_UNITS_PER_MM} onClick={onClick}>
      <primitive object={object} />
    </group>
  )
}

export { isS7300ModuleType, S7300_MODULE_DIMS }
