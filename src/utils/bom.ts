// ============================================================================
// Lista de materiais (BOM) — agrupa os componentes do esquema por tipo e
// resume os cabos (quantidade e metragem total), para exportação em CSV.
// Um dos "próximos passos naturais" do README, agora implementado.
// ============================================================================

import type { ElectricalComponent, Wire } from '../types'
import { TEMPLATES } from '../electrical/factory'

export interface BomRow {
  type: string
  paletteName: string
  group: string
  qty: number
  refs: string[]
}

export function buildBOM(components: ElectricalComponent[]): BomRow[] {
  const map = new Map<string, BomRow>()
  for (const c of components) {
    const tpl = TEMPLATES[c.type]
    const row = map.get(c.type) ?? {
      type: c.type,
      paletteName: tpl?.paletteName ?? c.type,
      group: tpl?.group ?? '—',
      qty: 0,
      refs: [],
    }
    row.qty += 1
    row.refs.push(c.ref)
    map.set(c.type, row)
  }
  return [...map.values()].sort((a, b) => a.group.localeCompare(b.group) || a.paletteName.localeCompare(b.paletteName))
}

function csvCell(v: string | number): string {
  const s = String(v)
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Gera o CSV completo: lista de componentes + resumo de cabos/metragem. */
export function bomToCSV(rows: BomRow[], wires: Wire[]): string {
  const lines: string[] = []
  lines.push(['Grupo', 'Tipo', 'Descrição', 'Quantidade', 'TAGs'].map(csvCell).join(';'))
  for (const r of rows) {
    lines.push([r.group, r.type, r.paletteName, r.qty, r.refs.join(', ')].map(csvCell).join(';'))
  }
  lines.push('')
  lines.push(['Cabos', '', '', '', ''].map(csvCell).join(';'))
  lines.push(['—', 'wire', 'Total de cabos no esquema', wires.length, ''].map(csvCell).join(';'))
  const totalLength = wires.reduce((a, w) => a + (w.lengthMm ?? 0), 0)
  lines.push(['—', 'wire', 'Metragem total de cabo (mm)', totalLength, ''].map(csvCell).join(';'))
  const byGauge = new Map<string, number>()
  for (const w of wires) byGauge.set(w.gauge, (byGauge.get(w.gauge) ?? 0) + 1)
  for (const [gauge, n] of [...byGauge.entries()].sort()) {
    lines.push(['—', 'wire', `Cabos ${gauge}`, n, ''].map(csvCell).join(';'))
  }
  return lines.join('\n')
}
