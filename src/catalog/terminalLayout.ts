import type { TerminalDef, Vec3 } from './types'
import { FACE_NORMAL, type Face, type TerminalSpec } from './terminalProfiles'

export interface BoundsMm { min: Vec3; max: Vec3 }

/**
 * Coloca os bornes de um perfil na superfície das faces do modelo.
 * Cada face recebe os bornes por linhas (spec.row), distribuídos uniformemente.
 * Eixos por face — topo/base: X (colunas) × Z (linhas); frente/trás: X × Y; esquerda/direita: Z × Y.
 */
export function layoutSpecs(specs: TerminalSpec[], bounds: BoundsMm): Array<{ position: Vec3; normal: Vec3 }> {
  const { min, max } = bounds
  const result = new Array<{ position: Vec3; normal: Vec3 }>(specs.length)
  const byFace = new Map<Face, number[]>()
  specs.forEach((item, index) => byFace.set(item.face, [...(byFace.get(item.face) ?? []), index]))
  for (const [face, indices] of byFace) {
    const rows: string[] = []
    indices.forEach((index) => { const row = specs[index].row ?? 'r'; if (!rows.includes(row)) rows.push(row) })
    rows.forEach((row, rowIndex) => {
      const members = indices.filter((index) => (specs[index].row ?? 'r') === row)
      const v = (rowIndex + 1) / (rows.length + 1)
      members.forEach((index, column) => {
        const u = (column + 1) / (members.length + 1)
        const x = min[0] + u * (max[0] - min[0]), z = min[2] + u * (max[2] - min[2])
        let position: Vec3
        if (face === 'top') position = [x, max[1], max[2] - v * (max[2] - min[2])]
        else if (face === 'bottom') position = [x, min[1], max[2] - v * (max[2] - min[2])]
        else if (face === 'front') position = [x, max[1] - v * (max[1] - min[1]), max[2]]
        else if (face === 'back') position = [max[0] - u * (max[0] - min[0]), max[1] - v * (max[1] - min[1]), min[2]]
        else if (face === 'right') position = [max[0], max[1] - v * (max[1] - min[1]), max[2] - u * (max[2] - min[2])]
        else position = [min[0], max[1] - v * (max[1] - min[1]), z]
        result[index] = { position: position.map((value) => Math.round(value * 10) / 10) as Vec3, normal: FACE_NORMAL[face] }
      })
    })
  }
  return result
}

/** Etiqueta única dentro do componente (acrescenta ′ se já existir). */
export function uniqueLabel(label: string, used: Set<string>): string {
  let next = label
  while (used.has(next)) next = `${next}′`
  used.add(next)
  return next
}

/** Converte especificações em bornes do componente (já posicionados). */
export function specsToTerminals(specs: TerminalSpec[], bounds: BoundsMm, existing: TerminalDef[], makeId: () => string, profileId?: string): TerminalDef[] {
  const used = new Set(existing.map((terminal) => terminal.label))
  const places = layoutSpecs(specs, bounds)
  return specs.map((item, index) => ({
    id: makeId(), label: uniqueLabel(item.label, used), name: item.name, position: places[index].position, normal: places[index].normal,
    kind: item.kind, terminalType: item.terminalType, polarity: item.polarity, electricalClass: item.electricalClass, direction: item.direction,
    accepts: '', color: item.color, fn: item.fn, contact: item.contact, group: item.group, profileId,
  }))
}

/** Um único borne (chip da biblioteca) numa posição/normal. */
export function specToTerminal(item: TerminalSpec, position: Vec3, normal: Vec3, existing: TerminalDef[], makeId: () => string): TerminalDef {
  const used = new Set(existing.map((terminal) => terminal.label))
  return {
    id: makeId(), label: uniqueLabel(item.label, used), name: item.name, position: position.map((value) => Math.round(value * 10) / 10) as Vec3, normal,
    kind: item.kind, terminalType: item.terminalType, polarity: item.polarity, electricalClass: item.electricalClass, direction: item.direction,
    accepts: '', color: item.color, fn: item.fn, contact: item.contact, group: item.group,
  }
}
