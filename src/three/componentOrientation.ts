import type { ComponentTerminalViewPositions, ComponentType, ComponentViewOrientation, ElectricalComponent } from '../types'

export const ZERO_COMPONENT_ORIENTATION: ComponentViewOrientation = Object.freeze({ x: 0, y: 0, z: 0 })
export const COMPONENT_VIEW_DEFAULTS_KEY = 'dc-simu:component-view-defaults:v1'
export const COMPONENT_TERMINAL_VIEW_DEFAULTS_KEY = 'dc-simu:component-terminal-view-defaults:v1'

export type ComponentViewPreset = 'isometric' | 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'original'

export const COMPONENT_VIEW_PRESETS: Record<ComponentViewPreset, ComponentViewOrientation> = {
  original: { x: 0, y: 0, z: 0 },
  front: { x: 0, y: 0, z: 0 },
  back: { x: 0, y: 180, z: 0 },
  left: { x: 0, y: -90, z: 0 },
  right: { x: 0, y: 90, z: 0 },
  top: { x: -90, y: 0, z: 0 },
  bottom: { x: 90, y: 0, z: 0 },
  isometric: { x: -35.264, y: 45, z: 0 },
}

const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0
const wrapDegrees = (value: number) => {
  const wrapped = ((value + 180) % 360 + 360) % 360 - 180
  return Math.abs(wrapped) < 0.0001 ? 0 : Math.round(wrapped * 1000) / 1000
}

export function normalizeComponentOrientation(value?: Partial<ComponentViewOrientation> | null): ComponentViewOrientation {
  return {
    x: wrapDegrees(finite(value?.x)),
    y: wrapDegrees(finite(value?.y)),
    z: wrapDegrees(finite(value?.z)),
  }
}

export function componentOrientationOf(component: ElectricalComponent): ComponentViewOrientation {
  return normalizeComponentOrientation(component.viewOrientation)
}

export function orientationRadians(value?: Partial<ComponentViewOrientation> | null): [number, number, number] {
  const orientation = normalizeComponentOrientation(value)
  const rad = Math.PI / 180
  return [orientation.x * rad, orientation.y * rad, orientation.z * rad]
}

export function isOriginalComponentOrientation(value?: Partial<ComponentViewOrientation> | null): boolean {
  const orientation = normalizeComponentOrientation(value)
  return orientation.x === 0 && orientation.y === 0 && orientation.z === 0
}

/** Chave persistente da vista. Presets têm nomes legíveis; rotações livres
 * usam os ângulos normalizados para não misturar ajustes de vistas diferentes. */
export function componentTerminalViewKey(value?: Partial<ComponentViewOrientation> | null): string {
  const orientation = normalizeComponentOrientation(value)
  const named = (Object.entries(COMPONENT_VIEW_PRESETS) as Array<[ComponentViewPreset, ComponentViewOrientation]>)
    .find(([id, preset]) => {
      if (id === 'original') return false
      const normalizedPreset = normalizeComponentOrientation(preset)
      return normalizedPreset.x === orientation.x && normalizedPreset.y === orientation.y && normalizedPreset.z === orientation.z
    })
  if (named) return named[0]
  if (isOriginalComponentOrientation(orientation)) return 'front'
  return `custom:${orientation.x}:${orientation.y}:${orientation.z}`
}

function readDefaults(): Partial<Record<ComponentType, ComponentViewOrientation>> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const parsed = JSON.parse(localStorage.getItem(COMPONENT_VIEW_DEFAULTS_KEY) ?? '{}') as Record<string, Partial<ComponentViewOrientation>>
    return Object.fromEntries(Object.entries(parsed).map(([type, orientation]) => [type, normalizeComponentOrientation(orientation)])) as Partial<Record<ComponentType, ComponentViewOrientation>>
  } catch {
    return {}
  }
}

export function getDefaultComponentOrientation(type: ComponentType): ComponentViewOrientation {
  return normalizeComponentOrientation(readDefaults()[type])
}

export function saveDefaultComponentOrientation(type: ComponentType, value: ComponentViewOrientation): void {
  if (typeof localStorage === 'undefined') return
  try {
    const current = readDefaults()
    current[type] = normalizeComponentOrientation(value)
    localStorage.setItem(COMPONENT_VIEW_DEFAULTS_KEY, JSON.stringify(current))
  } catch {
    // O projeto continua funcional mesmo se o armazenamento estiver bloqueado.
  }
}

function cleanTerminalViewPositions(value: unknown): ComponentTerminalViewPositions {
  if (!value || typeof value !== 'object') return {}
  const cleaned: ComponentTerminalViewPositions = {}
  for (const [view, positions] of Object.entries(value as Record<string, unknown>)) {
    if (!positions || typeof positions !== 'object') continue
    const entries = Object.entries(positions as Record<string, Partial<{ x: number; y: number }>>)
      .filter(([, position]) => Number.isFinite(position?.x) && Number.isFinite(position?.y))
      .map(([terminalId, position]) => [terminalId, { x: Number(position.x), y: Number(position.y) }])
    if (entries.length) cleaned[view] = Object.fromEntries(entries)
  }
  return cleaned
}

function readTerminalDefaults(): Partial<Record<ComponentType, ComponentTerminalViewPositions>> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const parsed = JSON.parse(localStorage.getItem(COMPONENT_TERMINAL_VIEW_DEFAULTS_KEY) ?? '{}') as Record<string, unknown>
    return Object.fromEntries(Object.entries(parsed).map(([type, positions]) => [type, cleanTerminalViewPositions(positions)])) as Partial<Record<ComponentType, ComponentTerminalViewPositions>>
  } catch {
    return {}
  }
}

export function getDefaultComponentTerminalViewPositions(type: ComponentType): ComponentTerminalViewPositions {
  return structuredClone(readTerminalDefaults()[type] ?? {})
}

export function saveDefaultComponentTerminalViewPositions(type: ComponentType, value: ComponentTerminalViewPositions): void {
  if (typeof localStorage === 'undefined') return
  try {
    const current = readTerminalDefaults()
    current[type] = cleanTerminalViewPositions(value)
    localStorage.setItem(COMPONENT_TERMINAL_VIEW_DEFAULTS_KEY, JSON.stringify(current))
  } catch {
    // O projeto continua funcional mesmo se o armazenamento estiver bloqueado.
  }
}
