// Réguas de bornes DIN (Phoenix Contact PTI 6, Borne PE e borne simples):
// - geração dinâmica de N pólos (bloco único multi-pólo PTI 6)
// - deteção e agrupamento automático de réguas (X1.0…X1.3, X1:1…X1:n, state.stripId)
// - plaquetas frontais ZB 8 / ZB 5, etiquetas de cabeçalho sem sobreposição e pontes FBS
// - presets industriais (3F+N+PE, L+N+PE, +24V/0V com FBS, Motor U·V·W+PE, Comando)
import type { ComponentType, ElectricalComponent } from '../types'
import type { TerminalTemplate } from './factory'
import { getComponentPhysicalSizeMm } from '../three/modelPaths'
import { REAL_TERMINALS } from './realInterfaces'

const KIND_COLOR_FALLBACK: Record<string, string> = { io: '#f59e0b', 'power-in': '#ef4444', 'power-out': '#f87171' }

export const PTI6_BASE_WIDTH_MM = 8.15
export const PE_BASE_WIDTH_MM = 5.15
export const PTI6_BASE_SCHEMATIC_W = 76
export const PTI6_BASE_SCHEMATIC_H = 118
export const PTI6_MIN_POLES = 1
export const PTI6_MAX_POLES = 48

/** Chaves de `component.state` geridas pelo painel «Régua de bornes» (ocultas da lista crua). */
export const TERMINAL_STRIP_STATE_KEYS = new Set([
  'poleCount',
  'stripId',
  'stripUngrouped',
  'jumperNext',
  'markerText',
  'bridged',
  'connection',
  'sectionMm2',
  'maxSectionMm2',
  'nominalA',
  'nominalV',
  'article',
])

/** Cores industriais normalizadas de bornes de calha DIN (Phoenix Contact CLIPLINE / IEC 60445). */
export const TERMINAL_BODY_COLORS = [
  { id: 'ut-grey', name: 'Cinzento padrão (UT/PTI)', value: '#cbd5e1' },
  { id: 'n-blue', name: 'Azul neutro (N)', value: '#2563eb' },
  { id: 'l1-brown', name: 'Castanho fase (L1)', value: '#8b4513' },
  { id: 'l2-black', name: 'Preto fase (L2)', value: '#1f2937' },
  { id: 'l3-grey', name: 'Cinzento escuro (L3)', value: '#525b66' },
  { id: 'dc-red', name: 'Vermelho (+24 V DC)', value: '#dc2626' },
  { id: 'dc-navy', name: 'Azul-escuro (0 V DC)', value: '#1e3a8a' },
  { id: 'cmd-orange', name: 'Laranja (comando/intertrav.)', value: '#ea580c' },
  { id: 'pe-green', name: 'Verde (terra PE)', value: '#16a34a' },
  { id: 'sig-yellow', name: 'Amarelo (medição/sinal)', value: '#eab308' },
] as const

export function isTerminalStripType(type: ComponentType | string): boolean {
  return type === 'terminalPhoenixPti6' || type === 'terminalPE' || type === 'terminalBlock'
}

export function canTerminalHaveJumper(type: ComponentType | string): boolean {
  return type === 'terminalPhoenixPti6' || type === 'terminalBlock'
}

export function clampPoleCount(n: unknown): number {
  const v = Math.floor(Number(n))
  if (!Number.isFinite(v)) return 1
  return Math.max(PTI6_MIN_POLES, Math.min(PTI6_MAX_POLES, v))
}

export function pti6PhysicalWidthMm(poleCount: number): number {
  return PTI6_BASE_WIDTH_MM * clampPoleCount(poleCount)
}

export function terminalMemberWidthMm(c: Pick<ElectricalComponent, 'type' | 'state'>): number {
  if (c.type === 'terminalPhoenixPti6') {
    const poles = clampPoleCount(c.state?.poleCount ?? 1)
    return PTI6_BASE_WIDTH_MM * poles
  }
  const base = getComponentPhysicalSizeMm(c.type)
  return base?.width ?? PTI6_BASE_WIDTH_MM
}

export function pti6SchematicFootprint(poleCount: number): { w: number; h: number } {
  const n = clampPoleCount(poleCount)
  return { w: PTI6_BASE_SCHEMATIC_W * n, h: PTI6_BASE_SCHEMATIC_H }
}

const KIND_TYPE_LOCAL: Record<string, string> = { io: 'spring', 'power-in': 'screw', 'power-out': 'screw' }
function T(label: string, kind: any, x: number, y: number, extra: Partial<TerminalTemplate> = {}): TerminalTemplate {
  return {
    label, kind, x, y,
    terminalType: (extra.terminalType as any) ?? (KIND_TYPE_LOCAL[kind] as any) ?? 'spring',
    color: (extra.color as any) ?? (KIND_COLOR_FALLBACK as any)[kind] ?? '#f59e0b',
    ...extra,
  } as TerminalTemplate
}

/** Gera 2*N bornes para N blocos PTI6. Rótulos 1..2N (1-2 = bloco1, 3-4 = bloco2…). */
export function pti6TerminalTemplates(poleCount: number): TerminalTemplate[] {
  const n = clampPoleCount(poleCount)
  const spots = REAL_TERMINALS['terminalPhoenixPti6']
  const topSpot = spots?.find((s) => s.label === '1')
  const botSpot = spots?.find((s) => s.label === '2')
  const list: TerminalTemplate[] = []
  for (let i = 0; i < n; i++) {
    const cx = (i + 0.5) / n
    const topLabel = String(i * 2 + 1)
    const botLabel = String(i * 2 + 2)
    const topX3d = topSpot ? (i + topSpot.x) / n : cx
    const botX3d = botSpot ? (i + botSpot.x) / n : cx
    const topY3d = topSpot ? 1 - topSpot.y : 0.88
    const botY3d = botSpot ? 1 - botSpot.y : 0.12
    const topPos3D = { x: topX3d, y: topY3d, z: 0.72 }
    const botPos3D = { x: botX3d, y: botY3d, z: 0.72 }
    const baseExtra = { terminalType: 'spring' as const, color: '#f59e0b' }
    list.push(T(topLabel, 'io', cx, 0, { ...baseExtra, position3D: topPos3D, diameter: topSpot?.diameterMm ?? 4.2 }))
    list.push(T(botLabel, 'io', cx, 1, { ...baseExtra, position3D: botPos3D, diameter: botSpot?.diameterMm ?? 4.2 }))
  }
  return list
}

/** Largura/altura física dinâmica para um componente PTI6 (ou conjunto). */
export function getPti6DynamicPhysicalSizeMm(type: string, poleCount?: number) {
  const base = getComponentPhysicalSizeMm(type as any)
  if (!base) return undefined
  if (type === 'terminalPhoenixPti6' && poleCount && poleCount > 1) {
    return { width: PTI6_BASE_WIDTH_MM * clampPoleCount(poleCount), height: base.height, depth: base.depth }
  }
  return base
}

/** Passo do pente no esquema: bornes hierárquicos encostam (como na calha); soltos deixam uma folga para a TAG. */
export const TERMINAL_STRIP_GAP_PX = { hierarchical: 0, loose: 4 } as const

export type StripNumberingMode = 'hier1' | 'hier0' | 'loose'

export interface ParsedTerminalRef {
  raw: string
  /** Prefixo da régua quando hierárquico (ex.: `X1` em `X1.3`, `X1:2`, `X1-PE`). */
  prefix: string
  /** Separador hierárquico usado (`.`, `:`, `-`) ou `''` quando simples. */
  sep: string
  /** Sufixo hierárquico (ex.: `3`, `0`, `PE`, `N`, `L1`). */
  suffix: string
  /** Índice numérico quando o sufixo é inteiro (ex.: `3`), senão `null`. */
  index: number | null
  /** Família alfabética base (ex.: `X` em `X1` ou `X1.3`, `PE` em `PE2`). */
  family: string
  /** Número da régua (ex.: `1` em `X1` ou `X1.3`). */
  stripNumber: number | null
  hierarchical: boolean
}

/** Interpreta referências IEC de bornes: `X1.0`, `X1.12`, `X1:3`, `X1-PE`, `X1`, `PE1`. */
export function parseTerminalRef(rawRef: string): ParsedTerminalRef {
  const raw = (rawRef ?? '').trim()
  const hier = raw.match(/^([A-Za-z]+\d*)([.:-])([A-Za-z0-9+]+)$/)
  if (hier) {
    const [, prefix, sep, suffix] = hier
    const fam = prefix.match(/^([A-Za-z]+)(\d*)$/)
    const idx = /^\d+$/.test(suffix) ? Number(suffix) : null
    return {
      raw,
      prefix,
      sep,
      suffix,
      index: idx,
      family: fam?.[1] || 'X',
      stripNumber: fam?.[2] ? Number(fam[2]) : null,
      hierarchical: true,
    }
  }
  const simple = raw.match(/^([A-Za-z]+)(\d*)$/)
  return {
    raw,
    prefix: raw || 'X1',
    sep: '',
    suffix: '',
    index: null,
    family: simple?.[1] || 'X',
    stripNumber: simple?.[2] ? Number(simple[2]) : null,
    hierarchical: false,
  }
}

/** Texto curto para a plaqueta frontal ZB 8 / ZB 5 de um borne (cabe em 8,15 mm sem sobrepor). */
export function terminalFrontBadge(
  c: Pick<ElectricalComponent, 'type' | 'ref' | 'state'>,
  inStrip = false,
): string {
  const custom = typeof c.state?.markerText === 'string' ? c.state.markerText.trim() : ''
  if (custom) return custom.slice(0, 5)
  const parsed = parseTerminalRef(c.ref)
  if (c.type === 'terminalPE') {
    if (parsed.hierarchical && parsed.suffix) return parsed.suffix.toUpperCase() === 'PE' ? 'PE' : parsed.suffix.slice(0, 4)
    return 'PE'
  }
  if (parsed.hierarchical && parsed.suffix) return parsed.suffix.slice(0, 4)
  if (inStrip && parsed.stripNumber !== null) return String(parsed.stripNumber)
  return parsed.raw.slice(0, 4)
}

export interface TerminalStripPlan {
  /** TAG do borne de origem depois de gerar a régua (X1 → X1.0 quando hierárquico e livre). */
  baseRef: string
  /** TAGs dos clones, por ordem (count − 1 entradas). */
  refs: string[]
}

/**
 * Planeia as TAGs de uma régua de `count` bornes a partir de `baseRef`.
 * Hierárquico: prefixo.N consecutivo, a continuar a série se o borne já é X1.3 e a saltar índices ocupados
 * (nunca gera «X1.1_1»). Solto: o próximo número livre da família (X1, X2 → X3…).
 * `startIndex`: 0 (padrão X1.0, X1.1…) ou 1 (IEC X1.1, X1.2…).
 */
export function planTerminalStripRefs(
  otherRefs: Iterable<string>,
  baseRef: string,
  count: number,
  hierarchical: boolean,
  startIndex: 0 | 1 = 0,
): TerminalStripPlan {
  const used = new Set(otherRefs)
  const total = Math.max(1, Math.floor(count))
  const refs: string[] = []
  if (hierarchical) {
    const m = baseRef.match(/^(.*?)([.:])(\d+)$/)
    const sep = m ? m[2] : '.'
    const named = !m ? baseRef.match(/^([A-Za-z]+\d*)([.:])([A-Za-z0-9+]+)$/) : null
    const prefix = m ? m[1] : named ? named[1] : baseRef
    const effSep = m ? sep : named ? named[2] : '.'
    let idx = m ? Number(m[3]) + 1 : startIndex === 1 ? 2 : 1
    let outBase = baseRef
    const wantBase = `${prefix}${effSep}${startIndex}`
    if (!m && !named && !used.has(wantBase)) {
      outBase = wantBase
      idx = startIndex + 1
    } else if (!m) {
      // Se já existem membros X1.k, continua após o maior k.
      const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp(`^${escaped}[.:](\\d+)$`)
      let maxK = startIndex - 1
      for (const r of used) {
        const hm = re.exec(r)
        if (hm) maxK = Math.max(maxK, Number(hm[1]))
      }
      idx = Math.max(startIndex, maxK + 1)
    }
    while (refs.length < total - 1) {
      const r = `${prefix}${effSep}${idx++}`
      if (!used.has(r) && r !== outBase) refs.push(r)
    }
    return { baseRef: outBase, refs }
  }
  const tag = baseRef.replace(/[.:-][A-Za-z0-9+]+$/, '').replace(/\d+$/, '') || 'X'
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`^${escaped}(\\d+)$`)
  let max = 0
  for (const r of [...used, baseRef]) {
    const mm = re.exec(r)
    if (mm) max = Math.max(max, Number(mm[1]))
  }
  while (refs.length < total - 1) refs.push(`${tag}${++max}`)
  return { baseRef, refs }
}

/** Gera a próxima TAG livre ao acrescentar um borne especial (`PE`, `N`, `L1` ou numérico) a uma régua. */
export function nextStripMemberRef(
  existingRefs: Iterable<string>,
  prefix: string,
  sep = '.',
  preferredSuffix?: string,
  startIndex: 0 | 1 = 1,
): string {
  const used = new Set(existingRefs)
  if (preferredSuffix) {
    const direct = `${prefix}${sep}${preferredSuffix}`
    if (!used.has(direct)) return direct
    let k = 2
    while (used.has(`${prefix}${sep}${preferredSuffix}${k}`)) k++
    return `${prefix}${sep}${preferredSuffix}${k}`
  }
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`^${escaped}[.:-](\\d+)$`)
  let max = startIndex - 1
  for (const r of used) {
    const m = re.exec(r)
    if (m) max = Math.max(max, Number(m[1]))
  }
  let candidate = max + 1
  while (used.has(`${prefix}${sep}${candidate}`)) candidate++
  return `${prefix}${sep}${candidate}`
}

/** Próximo prefixo de régua livre (ex.: se existem `X1.*` e `X2.*`, devolve `X3`). */
export function nextFreeStripPrefix(existingRefs: Iterable<string>, family = 'X'): string {
  const cleanFam = family.replace(/[^A-Za-z]/g, '') || 'X'
  const esc = cleanFam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`^${esc}(\\d+)(?:[.:-].*)?$`)
  let max = 0
  for (const r of existingRefs) {
    const m = re.exec(r.trim())
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${cleanFam}${max + 1}`
}

/** Pré-visualização das TAGs para o inspetor (primeiras/últimas, com reticências). */
export function describeTerminalStripRefs(plan: TerminalStripPlan, max = 5): string {
  const all = [plan.baseRef, ...plan.refs]
  return all.length <= max ? all.join(', ') : `${all.slice(0, max - 2).join(', ')} … ${all[all.length - 1]}`
}

export interface ResolvedTerminalStrip {
  /** Identificador estável da régua (state.stripId explícito ou chave automática por prefixo/calha). */
  key: string
  /** `stripId` explícito se gravado nos componentes, senão `null` (agrupamento automático por TAG/calha). */
  explicitStripId: string | null
  /** Prefixo comum da régua (ex.: `X1`, `X2`, `PE`). */
  prefix: string
  /** Separador predominante (`.` ou `:`). */
  sep: string
  /** Etiqueta limpa centrada sobre a régua no 3D e 2D (ex.: `X1` ou `X1–X4`). */
  headerTag: string
  /** Resumo dos índices para o Inspetor (ex.: `0…3`, `1…7`, `L1·L2·L3·N·PE`). */
  rangeSummary: string
  /** Bornes da régua ordenados da esquerda para a direita. */
  members: ElectricalComponent[]
  /** Largura física total na calha DIN (mm). */
  totalWidthMm: number
  /** `true` quando todos partilham um prefixo hierárquico (ex.: `X1.*`). */
  hierarchical: boolean
}

function compareStripOrder(a: ElectricalComponent, b: ElectricalComponent): number {
  if (a.railId && a.railId === b.railId && typeof a.railOffsetMm === 'number' && typeof b.railOffsetMm === 'number') {
    const diff = a.railOffsetMm - b.railOffsetMm
    if (Math.abs(diff) > 0.05) return diff
  }
  if (Math.abs(a.schematicX - b.schematicX) > 0.5) return a.schematicX - b.schematicX
  const pa = parseTerminalRef(a.ref)
  const pb = parseTerminalRef(b.ref)
  if (pa.index !== null && pb.index !== null && pa.index !== pb.index) return pa.index - pb.index
  return a.ref.localeCompare(b.ref, 'pt')
}

function buildResolvedStrip(key: string, explicitStripId: string | null, rawMembers: ElectricalComponent[]): ResolvedTerminalStrip {
  const members = [...rawMembers].sort(compareStripOrder)
  const parsed = members.map((m) => parseTerminalRef(m.ref))
  const hierMembers = parsed.filter((p) => p.hierarchical)
  const firstHier = hierMembers[0]
  const allSamePrefix =
    !!firstHier &&
    parsed.every((p, idx) =>
      (p.hierarchical && p.prefix.toUpperCase() === firstHier.prefix.toUpperCase()) ||
      (!p.hierarchical && p.raw.toUpperCase() === firstHier.prefix.toUpperCase()) ||
      (members[idx].type === 'terminalPE' && !!explicitStripId),
    )

  let headerTag: string
  let prefix: string
  let sep = firstHier?.sep || '.'
  if (allSamePrefix && firstHier) {
    prefix = firstHier.prefix
    headerTag = firstHier.prefix
  } else if (members.length === 1) {
    prefix = parsed[0].hierarchical ? parsed[0].prefix : parsed[0].raw
    sep = parsed[0].sep || '.'
    headerTag = members[0].ref
  } else {
    prefix = parsed[0].hierarchical ? parsed[0].prefix : parsed[0].raw
    const first = members[0].ref
    const last = members[members.length - 1].ref
    headerTag = first === last ? first : `${first}–${last}`
  }

  const badges = members.map((m) => terminalFrontBadge(m, members.length > 1))
  const allNumeric = badges.every((b) => /^\d+$/.test(b))
  const rangeSummary =
    badges.length <= 1
      ? badges[0] ?? ''
      : allNumeric
        ? `${badges[0]}…${badges[badges.length - 1]}`
        : badges.length <= 5
          ? badges.join('·')
          : `${badges.slice(0, 3).join('·')}…${badges[badges.length - 1]}`

  const totalWidthMm = Math.round(members.reduce((acc, m) => acc + terminalMemberWidthMm(m), 0) * 100) / 100
  return {
    key,
    explicitStripId,
    prefix,
    sep,
    headerTag,
    rangeSummary,
    members,
    totalWidthMm,
    hierarchical: allSamePrefix,
  }
}

/**
 * Resolve todas as réguas de bornes (≥ 2 membros) do projeto:
 * 1) `state.stripId` explícito (desde que não tenha `stripUngrouped: true`);
 * 2) Agrupamento automático de bornes com o mesmo prefixo hierárquico (`X1.0…X1.3`, `X2.1…X2.7`, `X1:1…`)
 *    na mesma folha e calha DIN (ou mesma linha horizontal ±28 px se soltos);
 * 3) Bornes soltos encostados na mesma calha DIN (folga física ≤ 3 mm) para evitar sobreposição de TAGs.
 */
export function resolveTerminalStrips(components: ElectricalComponent[]): ResolvedTerminalStrip[] {
  const terminals = components.filter(
    (c) => isTerminalStripType(c.type) && !c.panelMount && Number(c.state?.poleCount ?? 1) <= 1,
  )
  if (terminals.length < 2) return []

  const claimed = new Set<string>()
  const result: ResolvedTerminalStrip[] = []

  // 1) Grupos com `state.stripId` explícito (junta também bornes da mesma calha/folha com o mesmo prefixo hierárquico!)
  const byExplicit = new Map<string, ElectricalComponent[]>()
  for (const c of terminals) {
    if (c.state?.stripUngrouped) continue
    const sid = typeof c.state?.stripId === 'string' && c.state.stripId ? c.state.stripId : null
    if (!sid) continue
    const list = byExplicit.get(sid) ?? []
    list.push(c)
    byExplicit.set(sid, list)
  }
  for (const [sid, list] of byExplicit.entries()) {
    // Absorve bornes órfãos do mesmo prefixo hierárquico na mesma folha + calha/linha
    const prefixes = new Set(
      list.map((m) => parseTerminalRef(m.ref)).filter((p) => p.hierarchical).map((p) => p.prefix.toUpperCase()),
    )
    if (prefixes.size === 1) {
      const targetPrefix = [...prefixes][0]
      const sample = list[0]
      for (const cand of terminals) {
        if (cand.state?.stripUngrouped || list.includes(cand)) continue
        if (typeof cand.state?.stripId === 'string' && cand.state.stripId && cand.state.stripId !== sid) continue
        if ((cand.sheet ?? '') !== (sample.sheet ?? '')) continue
        if (sample.railId ? cand.railId !== sample.railId : (!!cand.railId || Math.abs(cand.schematicY - sample.schematicY) > 28)) continue
        const p = parseTerminalRef(cand.ref)
        if ((p.hierarchical && p.prefix.toUpperCase() === targetPrefix) || (!p.hierarchical && p.raw.toUpperCase() === targetPrefix)) {
          list.push(cand)
        }
      }
    }
    if (list.length >= 2) {
      for (const m of list) claimed.add(m.id)
      result.push(buildResolvedStrip(`strip:${sid}`, sid, list))
    }
  }

  // 2) Agrupamento automático por prefixo hierárquico (`X1.0…X1.3`, `X2.1…X2.7`, `X1` + `X1.1`)
  const byAutoPrefix = new Map<string, ElectricalComponent[]>()
  for (const c of terminals) {
    if (claimed.has(c.id) || c.state?.stripUngrouped) continue
    const p = parseTerminalRef(c.ref)
    if (!p.hierarchical) continue
    const rowBucket = c.railId ? `rail:${c.railId}` : `row:${Math.round(c.schematicY / 28)}`
    const key = `auto:${c.sheet ?? ''}:${rowBucket}:${p.prefix.toUpperCase()}`
    const list = byAutoPrefix.get(key) ?? []
    list.push(c)
    byAutoPrefix.set(key, list)
  }
  // Também junta um eventual borne-mãe `X1` na mesma calha/linha aos seus `X1.1, X1.2…`
  for (const c of terminals) {
    if (claimed.has(c.id) || c.state?.stripUngrouped) continue
    const p = parseTerminalRef(c.ref)
    if (p.hierarchical) continue
    const rowBucket = c.railId ? `rail:${c.railId}` : `row:${Math.round(c.schematicY / 28)}`
    const key = `auto:${c.sheet ?? ''}:${rowBucket}:${p.raw.toUpperCase()}`
    const existing = byAutoPrefix.get(key)
    if (existing?.length) existing.push(c)
  }
  for (const [key, list] of byAutoPrefix.entries()) {
    if (list.length < 2) continue
    for (const m of list) claimed.add(m.id)
    result.push(buildResolvedStrip(key, null, list))
  }

  return result
}

/**
 * Agrupa também bornes soltos encostados fisicamente na mesma calha DIN (folga ≤ 4 mm)
 * para que no Painel 3D nunca haja TAGs coladas/sobrepostas como «X1X2X3».
 */
export function resolveAdjacentLooseTerminalClusters(
  components: ElectricalComponent[],
  alreadyClaimed: Set<string>,
): ResolvedTerminalStrip[] {
  const byRail = new Map<string, ElectricalComponent[]>()
  for (const c of components) {
    if (alreadyClaimed.has(c.id)) continue
    if (!isTerminalStripType(c.type) || c.panelMount || !c.railId) continue
    if (Number(c.state?.poleCount ?? 1) > 1) continue
    if (typeof c.railOffsetMm !== 'number') continue
    const list = byRail.get(c.railId) ?? []
    list.push(c)
    byRail.set(c.railId, list)
  }
  const clusters: ResolvedTerminalStrip[] = []
  for (const [railId, list] of byRail.entries()) {
    if (list.length < 2) continue
    list.sort(compareStripOrder)
    let run: ElectricalComponent[] = [list[0]]
    for (let i = 1; i < list.length; i++) {
      const prev = run[run.length - 1]
      const cur = list[i]
      const prevEnd = (prev.railOffsetMm ?? 0) + terminalMemberWidthMm(prev)
      const gapMm = (cur.railOffsetMm ?? 0) - prevEnd
      if (gapMm <= 5) {
        run.push(cur)
      } else {
        if (run.length >= 2) clusters.push(buildResolvedStrip(`adj:${railId}:${run[0].id}`, null, run))
        run = [cur]
      }
    }
    if (run.length >= 2) clusters.push(buildResolvedStrip(`adj:${railId}:${run[0].id}`, null, run))
  }
  return clusters
}

/** Devolve a régua a que `componentId` pertence (ou uma régua unitária com o próprio borne). */
export function terminalStripFor(components: ElectricalComponent[], componentId: string): ResolvedTerminalStrip | null {
  const target = components.find((c) => c.id === componentId)
  if (!target || !isTerminalStripType(target.type)) return null
  const strips = resolveTerminalStrips(components)
  const hit = strips.find((s) => s.members.some((m) => m.id === componentId))
  if (hit) return hit
  return buildResolvedStrip(`single:${target.id}`, typeof target.state?.stripId === 'string' ? target.state.stripId : null, [target])
}

/**
 * Pontes elétricas FBS entre bornes adjacentes da mesma régua (`state.jumperNext === true`).
 * Por segurança normativa IEC 60204-1, nunca estabelece ponte para borne de terra `terminalPE`
 * nem para bornes com passagem interna aberta (`bridged === false`).
 */
export function terminalStripJumperPairs(components: ElectricalComponent[]): Array<[string, string]> {
  const strips = resolveTerminalStrips(components)
  const claimed = new Set(strips.flatMap((s) => s.members.map((m) => m.id)))
  const allStrips = [...strips, ...resolveAdjacentLooseTerminalClusters(components, claimed)]
  const pairs: Array<[string, string]> = []
  for (const strip of allStrips) {
    for (let i = 0; i < strip.members.length - 1; i++) {
      const a = strip.members[i]
      const b = strip.members[i + 1]
      if (!a.state?.jumperNext) continue
      if (!canTerminalHaveJumper(a.type) || !canTerminalHaveJumper(b.type)) continue
      const ta = a.terminals[0]?.id
      const tb = b.terminals[0]?.id
      if (ta && tb) pairs.push([ta, tb])
    }
  }
  return pairs
}

export interface TerminalStripMemberSpec {
  type: 'terminalPhoenixPti6' | 'terminalPE'
  /** Sufixo hierárquico opcional (ex.: `L1`, `N`, `PE`); vazio = número sequencial. */
  suffix?: string
  /** Plaqueta frontal ZB 8 (ex.: `L1`, `+24`, `0V`, `PE`). */
  markerText?: string
  /** Descrição no Inspetor. */
  label: string
  /** Cor do corpo isolante PA66 (vazio = padrão do modelo). */
  bodyColor?: string
  /** Liga ponte vermelha FBS ao borne seguinte da régua. */
  jumperNext?: boolean
}

export interface TerminalStripPreset {
  id: '3p-n-pe' | '1p-n-pe' | 'dc24-fbs' | 'motor-uvw' | 'cmd-4' | 'cmd-8'
  title: string
  hint: string
  members: TerminalStripMemberSpec[]
}

export const TERMINAL_STRIP_PRESETS: readonly TerminalStripPreset[] = [
  {
    id: '3p-n-pe',
    title: '3F+N+PE',
    hint: 'Entrada/saída trifásica: L1 (castanho), L2 (preto), L3 (cinzento), N (azul) e PE (verde/amarelo)',
    members: [
      { type: 'terminalPhoenixPti6', suffix: '1', markerText: 'L1', label: 'Fase L1', bodyColor: '#8b4513' },
      { type: 'terminalPhoenixPti6', suffix: '2', markerText: 'L2', label: 'Fase L2', bodyColor: '#1f2937' },
      { type: 'terminalPhoenixPti6', suffix: '3', markerText: 'L3', label: 'Fase L3', bodyColor: '#525b66' },
      { type: 'terminalPhoenixPti6', suffix: 'N', markerText: 'N', label: 'Neutro N', bodyColor: '#2563eb' },
      { type: 'terminalPE', suffix: 'PE', markerText: 'PE', label: 'Terra de proteção PE' },
    ],
  },
  {
    id: '1p-n-pe',
    title: 'L+N+PE',
    hint: 'Alimentação monofásica 230 V: L (castanho), N (azul) e PE (verde/amarelo)',
    members: [
      { type: 'terminalPhoenixPti6', suffix: '1', markerText: 'L', label: 'Fase L', bodyColor: '#8b4513' },
      { type: 'terminalPhoenixPti6', suffix: 'N', markerText: 'N', label: 'Neutro N', bodyColor: '#2563eb' },
      { type: 'terminalPE', suffix: 'PE', markerText: 'PE', label: 'Terra de proteção PE' },
    ],
  },
  {
    id: 'dc24-fbs',
    title: '+24V / 0V (FBS)',
    hint: 'Distribuição 24 V DC: 2 bornes +24 V interligados por ponte FBS + 2 bornes 0 V interligados por ponte FBS',
    members: [
      { type: 'terminalPhoenixPti6', suffix: '1', markerText: '+24', label: 'Distribuição +24 V DC', bodyColor: '#dc2626', jumperNext: true },
      { type: 'terminalPhoenixPti6', suffix: '2', markerText: '+24', label: 'Distribuição +24 V DC', bodyColor: '#dc2626' },
      { type: 'terminalPhoenixPti6', suffix: '3', markerText: '0V', label: 'Comum 0 V DC', bodyColor: '#1e3a8a', jumperNext: true },
      { type: 'terminalPhoenixPti6', suffix: '4', markerText: '0V', label: 'Comum 0 V DC', bodyColor: '#1e3a8a' },
    ],
  },
  {
    id: 'motor-uvw',
    title: 'Motor U·V·W+PE',
    hint: 'Saída para motor trifásico: U1, V1, W1 + borne de terra PE',
    members: [
      { type: 'terminalPhoenixPti6', suffix: '1', markerText: 'U1', label: 'Saída motor U1', bodyColor: '#8b4513' },
      { type: 'terminalPhoenixPti6', suffix: '2', markerText: 'V1', label: 'Saída motor V1', bodyColor: '#1f2937' },
      { type: 'terminalPhoenixPti6', suffix: '3', markerText: 'W1', label: 'Saída motor W1', bodyColor: '#525b66' },
      { type: 'terminalPE', suffix: 'PE', markerText: 'PE', label: 'Terra motor PE' },
    ],
  },
  {
    id: 'cmd-4',
    title: '4× Comando',
    hint: 'Régua de 4 bornes de passagem numerados sequencialmente (1…4)',
    members: Array.from({ length: 4 }, (_, i) => ({
      type: 'terminalPhoenixPti6' as const,
      suffix: String(i + 1),
      label: `Borne de comando ${i + 1}`,
    })),
  },
  {
    id: 'cmd-8',
    title: '8× Comando',
    hint: 'Régua de 8 bornes de passagem numerados sequencialmente (1…8)',
    members: Array.from({ length: 8 }, (_, i) => ({
      type: 'terminalPhoenixPti6' as const,
      suffix: String(i + 1),
      label: `Borne de comando ${i + 1}`,
    })),
  },
]
