import type { ControlDef, ControlMotion, Vec3 } from './types'

/**
 * Movimento de botões/interruptores (deslizar ou bascular sobre um pivô) e automação para configurar
 * rapidamente outros disjuntores. Módulo puro (sem Three.js nem DOM): testado por `npm run test:motion`.
 */

export const FEELS: Array<[ControlMotion['feel'], string]> = [
  ['snap', 'Clique com mola (disjuntor real)'],
  ['smooth', 'Suave'],
  ['instant', 'Instantâneo'],
]

/** Basculante simétrico (±) por omissão: não é preciso saber se a pose do modelo é ON ou OFF. */
export const DEFAULT_TILT: ControlMotion = {
  mode: 'tilt', angleOff: 9, angleOn: -9, pivotRel: [0.5, 0.5, 0.5], feel: 'snap', durationMs: 280,
}

export const SLIDE_MOTION: ControlMotion = { mode: 'slide', angleOff: 0, angleOn: 0, pivotRel: [0.5, 0.5, 0.5], feel: 'smooth', durationMs: 330 }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))

/** Movimento válido (valores dentro de limites seguros) a partir de dados incompletos ou antigos. */
export function normalizeMotion(motion?: Partial<ControlMotion> | null): ControlMotion {
  const base = motion?.mode === 'tilt' ? DEFAULT_TILT : SLIDE_MOTION
  const merged = { ...base, ...(motion ?? {}) }
  const rel = (merged.pivotRel ?? base.pivotRel).slice(0, 3) as number[]
  while (rel.length < 3) rel.push(0.5)
  return {
    mode: merged.mode === 'tilt' ? 'tilt' : 'slide',
    angleOff: clamp(merged.angleOff, -180, 180),
    angleOn: clamp(merged.angleOn, -180, 180),
    pivotRel: rel.map((value) => clamp(value, -0.5, 1.5)) as Vec3,
    feel: merged.feel === 'smooth' || merged.feel === 'instant' ? merged.feel : 'snap',
    durationMs: clamp(merged.durationMs, 40, 2000),
  }
}

export const isTilt = (control: Pick<ControlDef, 'kind' | 'motion'>) => control.kind !== 'selector' && control.motion?.mode === 'tilt'

/**
 * Ângulo (°) para um valor de animação: 0 = OFF, 1 = ON. O valor pode passar de [0, 1] durante o
 * ressalto da mola, por isso extrapola em vez de ficar preso aos limites.
 */
export function motionAngle(motion: ControlMotion, value: number): number {
  return motion.angleOff + (motion.angleOn - motion.angleOff) * value
}

/* ------------------------------------------------------------------------------ mola */

export interface SpringState { value: number; velocity: number }

/**
 * Avança a animação `dt` segundos em direção a `target`. Devolve `true` enquanto ainda se mexe.
 * - snap: oscilador amortecido (ζ ≈ 0,5) → ultrapassa ~16 % e assenta, como o manípulo de um disjuntor.
 * - smooth: aproximação exponencial (99 % no fim de `durationMs`).
 * - instant: salta para o alvo.
 */
export function stepSpring(state: SpringState, target: number, dt: number, feel: ControlMotion['feel'], durationMs: number, epsilon = 0.002): boolean {
  if (feel === 'instant') {
    const moved = state.value !== target
    state.value = target; state.velocity = 0
    return moved
  }
  if (feel === 'smooth') {
    const diff = target - state.value
    if (Math.abs(diff) <= epsilon) { const moved = diff !== 0; state.value = target; state.velocity = 0; return moved }
    state.value += diff * (1 - Math.exp(-dt * (4.6 / Math.max(0.04, durationMs / 1000))))
    state.velocity = 0
    return true
  }
  const zeta = 0.5
  const omega = (2 * Math.PI) / Math.max(0.08, (durationMs / 1000) * 0.9) // período ≈ duração
  const sub = 4
  const h = Math.min(dt, 0.1) / sub
  for (let i = 0; i < sub; i += 1) {
    const accel = omega * omega * (target - state.value) - 2 * zeta * omega * state.velocity
    state.velocity += accel * h
    state.value += state.velocity * h
  }
  if (Math.abs(target - state.value) <= epsilon && Math.abs(state.velocity) <= epsilon * 8) {
    const moved = state.value !== target || state.velocity !== 0
    state.value = target; state.velocity = 0
    return moved
  }
  return true
}

/* ------------------------------------------------------------------------------ pivô */

/** Ponto do pivô (mm) a partir da caixa dos objetos e do pivô relativo. */
export function pivotFromBox(min: Vec3, max: Vec3, rel: Vec3): Vec3 {
  return [0, 1, 2].map((i) => min[i] + (max[i] - min[i]) * rel[i]) as Vec3
}

/** Pivô relativo (0–1) de um ponto absoluto; eixos sem espessura ficam a meio. */
export function relFromPoint(min: Vec3, max: Vec3, point: Vec3): Vec3 {
  return [0, 1, 2].map((i) => {
    const size = max[i] - min[i]
    return size < 1e-6 ? 0.5 : Math.round(clamp((point[i] - min[i]) / size, -0.5, 1.5) * 1000) / 1000
  }) as Vec3
}

/** Pivôs rápidos ao longo de um eixo (a «base» é o lado negativo e o «topo» o positivo). */
export function pivotPreset(rel: Vec3, axis: 0 | 1 | 2, where: 'min' | 'center' | 'max'): Vec3 {
  const next = [...rel] as Vec3
  next[axis] = where === 'min' ? 0 : where === 'max' ? 1 : 0.5
  return next
}

/* ------------------------------------------------------------------------ automação */

const UNIT: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
export const axisIndex = (axis: Vec3): 0 | 1 | 2 =>
  (Math.abs(axis[0]) >= Math.abs(axis[1]) && Math.abs(axis[0]) >= Math.abs(axis[2]) ? 0 : Math.abs(axis[1]) >= Math.abs(axis[2]) ? 1 : 2)

export interface BreakerAxes {
  /** Eixo ao longo do qual se alinham os polos (é à volta dele que o manípulo bascula). */
  pole: Vec3
  /** Eixo vertical do aparelho: entradas num extremo, saídas no outro (direção do curso do manípulo). */
  throw: Vec3
  /** Eixo da profundidade (frente–trás). */
  depth: Vec3
  confidence: 'high' | 'low'
  reason: string
}

/**
 * Descobre os eixos de um disjuntor pelos bornes: o eixo com maior afastamento entre bornes é o
 * vertical (entradas ↔ saídas), o segundo é o dos polos, o menor é a profundidade. Serve de ponto de
 * partida automático para qualquer disjuntor, seja qual for a orientação em que o GLB foi exportado.
 */
export function inferBreakerAxes(positions: Vec3[]): BreakerAxes | null {
  if (positions.length < 2) return null
  const spread = [0, 1, 2].map((i) => {
    const values = positions.map((p) => p[i])
    return Math.max(...values) - Math.min(...values)
  })
  const order = [0, 1, 2].sort((a, b) => spread[b] - spread[a])
  const [top, second, third] = order
  if (spread[top] < 1) return null
  const confidence = spread[second] > spread[top] * 0.25 && spread[second] > spread[third] * 1.5 ? 'high' : 'low'
  return {
    pole: UNIT[second], throw: UNIT[top], depth: UNIT[third], confidence,
    reason: confidence === 'high'
      ? `bornes afastados ${spread[top].toFixed(0)} mm no eixo ${'XYZ'[top]} (vertical) e ${spread[second].toFixed(0)} mm no ${'XYZ'[second]} (polos)`
      : `poucos polos visíveis (${positions.length} bornes); assumido o eixo ${'XYZ'[second]} — confirme no teste`,
  }
}

/** Interruptor basculante pronto: eixo de rotação nos polos, pivô ao centro, mola. */
export function tiltControlPatch(axes: BreakerAxes | null, fallbackAxis: Vec3 = [0, 0, 1]): Pick<ControlDef, 'axis' | 'motion'> {
  return { axis: axes?.pole ?? fallbackAxis, motion: { ...DEFAULT_TILT } }
}

/** Para comparar/guardar: só o que define o *movimento* (não o objeto nem as ações). */
export interface MotionPreset {
  id: string
  name: string
  kind: ControlDef['kind']
  axis: Vec3
  travelMm: number
  motion: ControlMotion
}

export function presetFromControl(control: ControlDef, id: string, name: string): MotionPreset {
  return { id, name, kind: control.kind, axis: [...control.axis] as Vec3, travelMm: control.travelMm, motion: normalizeMotion(control.motion) }
}

/** Aplica um preset a um controlo (mantém objetos, peça, nome e ações; o pivô relativo adapta-se ao tamanho). */
export function applyPreset(control: ControlDef, preset: MotionPreset, axes?: BreakerAxes | null): ControlDef {
  // o preset guarda o eixo do modelo onde foi criado; noutro GLB os eixos podem estar trocados, por isso
  // sempre que os bornes dão uma resposta fiável, o eixo de rotação vem deles.
  const axis = preset.motion.mode === 'tilt' && axes && axes.confidence === 'high' ? axes.pole : preset.axis
  return { ...control, axis: [...axis] as Vec3, travelMm: preset.travelMm, motion: normalizeMotion(preset.motion) }
}

export const BUILTIN_PRESETS: MotionPreset[] = [
  { id: 'builtin-breaker-rocker', name: 'Disjuntor modular · basculante com mola', kind: 'toggle', axis: [0, 0, 1], travelMm: 0, motion: { ...DEFAULT_TILT } },
  { id: 'builtin-breaker-slow', name: 'Disjuntor · basculante suave (±14°)', kind: 'toggle', axis: [0, 0, 1], travelMm: 0, motion: { ...DEFAULT_TILT, angleOff: 14, angleOn: -14, feel: 'smooth', durationMs: 360 } },
  { id: 'builtin-slide', name: 'Interruptor · desliza (curso 8 mm)', kind: 'toggle', axis: [1, 0, 0], travelMm: 8, motion: { ...SLIDE_MOTION } },
]
