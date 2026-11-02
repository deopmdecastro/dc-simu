import type { ComponentType, SimRunState } from '../types'
import { PANEL_UNITS_PER_MM, getComponentModelSpec } from './modelPaths'
import type { ElectricalComponent } from '../types'

/**
 * Lâmpadas e visores dos PLC Siemens S7, no sítio onde o CAD os desenha.
 *
 * As posições abaixo saíram das peças do modelo já na pose de montagem
 * (`Rx(−90)` no S7-1500, sem rotação no S7-300), em frações da caixa **contadas do
 * topo**: x 0 = esquerda, 1 = direita · y 0 = topo, 1 = base.
 *
 * Antes disto, os LEDs eram três círculos genéricos a 24 % da largura e 64 % da
 * altura, à frente da caixa. Nos S7-1500 caíam fora do painel frontal (o módulo
 * tem 47–85 mm de largura) e na CPU 315 tapavam a tampa em vez das lâmpadas.
 *
 * Nota: os CAD não trazem as lâmpadas em cor nem emissivas — são peças cinzentas.
 * O estado (verde/vermelho/âmbar) é posto aqui, por cima do sítio medido.
 */

export interface PlcLampState {
  runState: SimRunState
  /** Módulo alimentado (L+/M com tensão). */
  powered: boolean
  /** Diagnóstico de erro ativo no projeto. */
  error: boolean
}

export interface PlcLamp {
  /** Nome impresso no aparelho («RUN/STOP», «SF»…). */
  name: string
  /** Cor acesa. */
  color: string
  /** Posição normalizada na caixa do modelo. */
  at: { x: number; y: number }
  /** Diâmetro na escala do modelo (mm). */
  sizeMm: number
  /** Acesa neste ciclo. */
  on: boolean
}

const running = (s: PlcLampState) => s.runState === 'running'
const stopped = (s: PlcLampState) => s.runState !== 'running'

/**
 * S7-1500 (DI 32 e CPU 1511C): a coluna das lâmpadas fica no canto inferior
 * esquerdo da frente, entre o teclado e o conector X10 — RUN/STOP a verde,
 * ERROR a vermelho e MAINT a âmbar, alinhadas na vertical.
 */
const S71500_LAMPS: Array<{ name: string; at: { x: number; y: number }; color: string; kind: 'run' | 'error' | 'maint' }> = [
  { name: 'RUN/STOP', at: { x: 0.118, y: 0.565 }, color: '#22c55e', kind: 'run' },
  { name: 'ERROR', at: { x: 0.118, y: 0.610 }, color: '#ef4444', kind: 'error' },
  { name: 'MAINT', at: { x: 0.118, y: 0.655 }, color: '#f59e0b', kind: 'maint' },
]

/**
 * CPU 315-2 DP: duas colunas de três lâmpadas na metade superior da frente —
 * SF, BATF e DC5V à esquerda; FRCE, RUN e STOP à direita, como no aparelho.
 * As colunas estão encostadas às bordas para não taparem a tampa central.
 */
const S7300_LAMPS: Array<{ name: string; at: { x: number; y: number }; color: string; kind: 'sf' | 'batf' | 'dc5v' | 'frce' | 'run' | 'stop' }> = [
  { name: 'SF', at: { x: 0.135, y: 0.115 }, color: '#ef4444', kind: 'sf' },
  { name: 'BATF', at: { x: 0.135, y: 0.205 }, color: '#f59e0b', kind: 'batf' },
  { name: 'DC5V', at: { x: 0.135, y: 0.295 }, color: '#22c55e', kind: 'dc5v' },
  { name: 'FRCE', at: { x: 0.865, y: 0.115 }, color: '#3b82f6', kind: 'frce' },
  { name: 'RUN', at: { x: 0.865, y: 0.205 }, color: '#22c55e', kind: 'run' },
  { name: 'STOP', at: { x: 0.865, y: 0.295 }, color: '#f97316', kind: 'stop' },
]

/** Lâmpadas de um PLC Siemens S7 (lista vazia nos restantes componentes). */
export function plcLamps(type: ComponentType, state: PlcLampState): PlcLamp[] {
  if (type === 'plcSiemensS71500Di32' || type === 'plcSiemensS71500Cpu1511c') {
    return S71500_LAMPS.map((lamp) => ({
      name: lamp.name,
      color: lamp.color,
      at: lamp.at,
      sizeMm: 3.2,
      on: lamp.kind === 'run' ? running(state) && state.powered && !state.error
        : lamp.kind === 'error' ? state.error
          : state.powered && !running(state) && !state.error,
    }))
  }
  if (type === 'plcSiemensS7300Cpu315') {
    return S7300_LAMPS.map((lamp) => ({
      name: lamp.name,
      color: lamp.color,
      at: lamp.at,
      sizeMm: 3.4,
      on: lamp.kind === 'sf' ? state.error
        : lamp.kind === 'batf' ? false
          : lamp.kind === 'dc5v' ? state.powered
            : lamp.kind === 'frce' ? false
              : lamp.kind === 'run' ? running(state) && state.powered
                : stopped(state) && state.powered,
    }))
  }
  return []
}

/** O aparelho tem lâmpadas próprias no CAD? (só estes três, por agora) */
export const hasPlcLamps = (type: ComponentType): boolean =>
  type === 'plcSiemensS71500Di32' || type === 'plcSiemensS71500Cpu1511c' || type === 'plcSiemensS7300Cpu315'

/**
 * Posição de um ponto normalizado da frente do modelo, no referencial do grupo do
 * componente (`CadComponentReal3D`): a caixa é centrada em X e Z, e o apoio
 * depende de assentar na calha (base) ou ficar solto (centro).
 */
export function lampScenePosition(c: ElectricalComponent, at: { x: number; y: number }, anchor: 'center' | 'bottom'): [number, number, number] {
  const physical = getComponentModelSpec(c.type)?.physicalSizeMm
  const width = (physical?.width ?? 60) * PANEL_UNITS_PER_MM
  const height = (physical?.height ?? 90) * PANEL_UNITS_PER_MM
  const depth = (physical?.depth ?? 60) * PANEL_UNITS_PER_MM
  return [
    (at.x - 0.5) * width,
    anchor === 'bottom' ? (1 - at.y) * height : (0.5 - at.y) * height,
    depth / 2 + 0.006,
  ]
}
