import { evalWhen, type Vars } from './behavior'
import type { LightGlowDef, LightState, LightZoneDef } from './types'

/** Aspeto resolvido de uma zona luminosa num instante: módulo puro, testado por `npm run test:glow`. */
export interface LightLook { on: boolean; blink: boolean; color: string; intensity: number; rule?: string }

const HEX = /^#[0-9a-f]{6}$/i
export const isHexColor = (value: unknown): value is string => typeof value === 'string' && HEX.test(value)

/** Cor escolhida pelo utilizador (paleta da zona) ou a cor base. */
export function chosenColor(light: LightZoneDef, vars: Vars): string {
  const selected = vars[`color.${light.id}`]
  return typeof selected === 'string' && light.userPalette?.some((color) => color.toLowerCase() === selected.toLowerCase()) ? selected : light.color
}

/**
 * Cor do vidro/lente para a cor escolhida: o par da paleta, o vidro da cor base, ou — paletas antigas sem
 * vidro definido — a própria cor do brilho. `undefined` = não pintar (fica o material do modelo).
 */
export function chosenGlass(light: LightZoneDef, vars: Vars): string | undefined {
  if (light.tintMaterial === false) return undefined
  const glow = chosenColor(light, vars)
  const mapped = light.glassColors?.[glow.toLowerCase()]
  if (isHexColor(mapped)) return mapped
  if (glow.toLowerCase() === light.color.toLowerCase() && isHexColor(light.glassColor)) return light.glassColor
  if (light.userPalette?.length) return glow
  return undefined
}

/**
 * Prioridade: 1) o estado do componente (cor/intensidade próprias do estado) · 2) a primeira regra de cor cuja
 * condição se verifica · 3) a condição simples `when` · 4) apagada. Uma regra com cor inválida usa a cor base.
 */
export function resolveLightLook(light: LightZoneDef, state: LightState | undefined, vars: Vars): LightLook {
  const base = chosenColor(light, vars)
  // Teste do editor («Ver acesa»): acende a zona com a cor escolhida, sem depender de estados/variáveis.
  if (vars[`$test.${light.id}`] === true) return { on: true, blink: false, color: base, intensity: light.intensity }
  if (state?.on) return { on: true, blink: !!state.blink, color: isHexColor(state.color) ? state.color : base, intensity: state.intensity ?? light.intensity }
  const rule = light.colorRules?.find((item) => evalWhen(item.when, vars))
  if (rule) return { on: true, blink: !!rule.blink || !!state?.blink, color: isHexColor(rule.color) ? rule.color : base, intensity: light.intensity, rule: rule.id }
  const byVar = !!light.when && evalWhen(light.when, vars)
  return { on: byVar, blink: (byVar && !!light.blink) || (!!state?.blink && byVar), color: base, intensity: light.intensity }
}

export interface GlowSettings { enabled: boolean; size: number; riseMs: number; fallMs: number }

/** Parâmetros de brilho com valores seguros e predefinições por tipo. */
export function glowSettings(light: Pick<LightZoneDef, 'kind' | 'glow'>): GlowSettings {
  const lamp = light.kind === 'lamp'
  const glow: LightGlowDef = light.glow ?? {}
  const clamp = (value: number | undefined, fallback: number, min: number, max: number) => (typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback)
  return {
    enabled: glow.enabled !== false,
    size: clamp(glow.size, 1, 0.2, 3),
    riseMs: clamp(glow.riseMs, lamp ? 90 : 40, 0, 3000),
    fallMs: clamp(glow.fallMs, lamp ? 280 : 100, 0, 5000),
  }
}

/** Cores que a zona pode mostrar (base + regras + paleta do utilizador), sem repetições — para o editor e a legenda. */
/** Vidro associado a uma cor de brilho da zona (para mostrar o par na paleta). */
export function glassFor(light: LightZoneDef, glow: string): string | undefined {
  const mapped = light.glassColors?.[glow.toLowerCase()]
  if (isHexColor(mapped)) return mapped
  if (glow.toLowerCase() === light.color.toLowerCase() && isHexColor(light.glassColor)) return light.glassColor
  return undefined
}

export function lightColors(light: LightZoneDef): string[] {
  const all = [light.color, ...(light.colorRules ?? []).map((rule) => rule.color), ...(light.userPalette ?? [])].filter(isHexColor)
  return [...new Set(all.map((color) => color.toLowerCase()))]
}
