import type { ComponentCategory, TerminalElectricalClass, TerminalKind, TerminalType } from '../types'

/**
 * Catálogo oficial de componentes criados no Editor 3D do Admin.
 *
 * Arquitetura (resumo):
 *  - `CatalogEntry`  — o componente oficial: metadados + rascunho editável + versões publicadas.
 *  - `ComponentDefinition` — conteúdo (peças, materiais, bornes, luzes, estados, interações).
 *  - Cada versão publicada é imutável e gera um GLB "assado" (geometria + materiais) que alimenta
 *    todo o resto da aplicação (Esquema 2D, vistas, editor de bornes) como qualquer outro modelo CAD.
 *  - Uma instância num projeto usa o tipo `cat:<id>:v<n>` — fica fixa nessa versão até o utilizador atualizar.
 */

export type Vec3 = [number, number, number]
export type PartKind = 'group' | 'box' | 'cylinder' | 'sphere' | 'cone' | 'torus' | 'glb'
export type EasingName = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'

export interface MaterialDef {
  id: string
  name: string
  color: string
  roughness: number
  metalness: number
  opacity: number
  emissive: string
  emissiveIntensity: number
  /** id em `assets` (imagem). */
  map?: string
  normalMap?: string
}

export interface PartDef {
  id: string
  name: string
  kind: PartKind
  parentId: string | null
  /** mm, relativo ao pai (origem do componente: centro X/Z, base em Y=0). */
  position: Vec3
  /** graus */
  rotation: Vec3
  scale: Vec3
  /** mm: caixa = L×A×P, cilindro/cone = Ø×A×Ø, esfera = Ø, toro = Ø×Ø×espessura. */
  size: Vec3
  materialId: string | null
  visible: boolean
  locked: boolean
  /** id em `assets` quando `kind === 'glb'`. */
  asset?: string
  clickable?: boolean
}

export type TerminalPolarity = 'none' | 'positive' | 'negative' | 'ac' | 'neutral' | 'earth'
export type TerminalDirection = 'in' | 'out' | 'io'

export interface TerminalDef {
  /** Identidade estável entre versões (liga cabos antigos aos bornes novos). */
  id: string
  /** Rótulo impresso: "1", "A1", "13"… (único dentro do componente). */
  label: string
  name: string
  /** mm, no espaço do componente. */
  position: Vec3
  /** Normal exterior (direção de saída do cabo). */
  normal: Vec3
  kind: TerminalKind
  terminalType: TerminalType
  polarity: TerminalPolarity
  electricalClass: TerminalElectricalClass
  direction: TerminalDirection
  /** Etiquetas de compatibilidade aceites ("fio-1.5, ponteira"); vazio = tudo. */
  accepts: string
  color: string
  /** Função do borne no circuito (L1, N, PE, +24V, A1, I0.0…). Opcional: componentes antigos não a têm. */
  fn?: string
  /** Contacto: NA (NO), NF (NC) ou comum (COM). */
  contact?: 'NO' | 'NC' | 'COM'
  /** Grupo funcional (potência, bobina, aux, entradas…). */
  group?: string
  /** Perfil da biblioteca de bornes que o criou. */
  profileId?: string
}

export interface LightZoneDef {
  id: string
  name: string
  partId: string
  color: string
  intensity: number
}

export interface StateOverride {
  position?: Vec3
  rotation?: Vec3
  scale?: Vec3
  visible?: boolean
  materialId?: string
}

export interface LightState { on: boolean; color?: string; intensity?: number; blink?: boolean }

export interface StateDef {
  id: string
  name: string
  parts: Record<string, StateOverride>
  lights: Record<string, LightState>
  durationMs: number
  easing: EasingName
}

export type ActionDef =
  | { type: 'setState'; state: string }
  | { type: 'toggleState'; a: string; b: string }
  | { type: 'cycleStates'; states: string[] }
  | { type: 'delayedState'; state: string; afterMs: number }

export type TriggerName = 'click' | 'pressDown' | 'pressUp' | 'doubleClick'

export interface InteractionDef {
  id: string
  name: string
  /** '' = qualquer parte do componente. */
  partId: string
  trigger: TriggerName
  actions: ActionDef[]
}

export interface AssetDef { name: string; mime: string; data: string }

export interface ComponentDefinition {
  schemaVersion: 1
  mount: 'din-rail' | 'panel-front' | 'machine'
  parts: PartDef[]
  materials: MaterialDef[]
  terminals: TerminalDef[]
  lights: LightZoneDef[]
  states: StateDef[]
  initialState: string
  interactions: InteractionDef[]
  assets: Record<string, AssetDef>
}

export interface CatalogMeta {
  name: string
  description: string
  category: ComponentCategory
  group: string
  manufacturer: string
  reference: string
  internalCode: string
  tag: string
  tags: string[]
  thumbnail?: string
  /** "O que é" (tipo escolhido ao criar, ex.: Disjuntor). */
  kind?: string
  /** Ficha técnica: link e/ou PDF (o PDF vai em `assets.datasheet` do rascunho e não segue nas versões publicadas). */
  datasheet?: { status: 'have' | 'none'; url?: string; fileName?: string }
  properties: Array<{ key: string; value: string }>
}

export type RuntimeTerminal = TerminalDef & { position3D: { x: number; y: number; z: number }; x: number; y: number }
export interface RuntimeSpec {
  widthMm: number; heightMm: number; depthMm: number
  /** Centro horizontal e base do volume no espaço do GLB (mm): o renderizador recentra o modelo com isto. */
  originMm?: Vec3
  terminals: RuntimeTerminal[]
}

export interface CatalogVersion {
  version: number
  publishedAt: string
  publishedBy?: string
  note: string
  changes: string[]
  /** Definição sem `assets` (os GLB importados já vão no GLB assado). */
  definition: ComponentDefinition
  /** Dimensões e bornes normalizados, calculados no editor (inclui peças GLB). */
  runtime: RuntimeSpec
}

export interface CatalogEntry {
  id: string
  meta: CatalogMeta
  status: 'draft' | 'published'
  latestVersion: number
  archived: boolean
  updatedAt: string
  updatedBy?: string
  versions: CatalogVersion[]
  /** Só no endpoint do administrador. */
  draft?: ComponentDefinition
}

/** Ligação de uma instância ao catálogo oficial. */
export interface CatalogLink {
  id: string
  version: number
  /** official: recebe avisos de atualização · copy: independente do original. */
  source: 'official' | 'copy'
  /** Versão para a qual o utilizador escolheu "Ignorar". */
  ignoredVersion?: number
  copiedFrom?: { id: string; version: number; at: string }
}

export const catalogType = (id: string, version: number) => `cat:${id}:v${version}` as const
export function parseCatalogType(type: string): { id: string; version: number } | null {
  const match = /^cat:([A-Za-z0-9_-]+):v(\d+)$/.exec(type)
  return match ? { id: match[1], version: Number(match[2]) } : null
}
export const isCatalogType = (type: string) => type.startsWith('cat:')
