import type { Face, TerminalSpec } from '../catalog/terminalProfiles'

/**
 * Distribui os bornes de um perfil pela superfície de cada face, em coordenadas
 * da vista da face (u: da esquerda para a direita · v: de cima para baixo, como
 * o utilizador a vê no editor de bornes por vista).
 * Bornes com a mesma `row` ficam alinhados; as linhas repartem a altura.
 */
export function layoutSpecsUV(specs: TerminalSpec[]): Array<{ face: Face; u: number; v: number }> {
  const result = new Array<{ face: Face; u: number; v: number }>(specs.length)
  const byFace = new Map<Face, number[]>()
  specs.forEach((spec, index) => byFace.set(spec.face, [...(byFace.get(spec.face) ?? []), index]))
  for (const [face, indices] of byFace) {
    const rows: string[] = []
    indices.forEach((index) => { const row = specs[index].row ?? 'r'; if (!rows.includes(row)) rows.push(row) })
    rows.forEach((row, rowIndex) => {
      const members = indices.filter((index) => (specs[index].row ?? 'r') === row)
      members.forEach((index, column) => {
        result[index] = { face, u: (column + 1) / (members.length + 1), v: (rowIndex + 1) / (rows.length + 1) }
      })
    })
  }
  return result
}
