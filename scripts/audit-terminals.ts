import fs from 'node:fs'
import { TEMPLATES } from '../src/electrical/factory'
import { getComponentModelSpec } from '../src/three/modelPaths'
import { REAL_TERMINALS } from '../src/electrical/realInterfaces'
import type { ComponentType } from '../src/types'

const nearSurface = (p: { x: number; y: number; z: number }) => [p.x, p.y, p.z].some((value) => value <= 0.001 || value >= 0.999)

export function auditTerminals() {
  return (Object.entries(TEMPLATES) as Array<[ComponentType, (typeof TEMPLATES)[ComponentType]]>)
    .filter(([type]) => !!getComponentModelSpec(type))
    .map(([type, template]) => {
      const duplicateLabels = template.terminals.filter((terminal, index, list) => list.findIndex((item) => item.label.toLocaleUpperCase() === terminal.label.toLocaleUpperCase()) !== index).map((terminal) => terminal.label)
      // Tipos com interface real medida no GLB (ou tirada da ficha do
      // fabricante) não são projetados para a superfície: o encaixe do cabo
      // está mesmo recuado dentro do aparelho (caixa de bornes, cavidade).
      const measured = !!REAL_TERMINALS[type]?.length
      const dedicatedGeometry = measured || ['plcSiemensLogo1224RC', 'powerSupplyProauto24A', 'multimeterDm20'].includes(type)
      const interior = dedicatedGeometry ? [] : template.terminals.filter((terminal) => !terminal.position3D || !nearSurface(terminal.position3D)).map((terminal) => terminal.label)
      const missingType = template.terminals.filter((terminal) => !terminal.terminalType).map((terminal) => terminal.label)
      return { type, name: template.paletteName, terminals: template.terminals.length, duplicateLabels, interior, missingType, measured, ok: duplicateLabels.length === 0 && interior.length === 0 }
    })
}

export function terminalAuditMarkdown() {
  const rows = auditTerminals()
  const lines = ['# Auditoria de bornes dos modelos GLB', '', 'Gerado por `npm run audit:terminals`. Posições manuais são preservadas; bornes sem calibração são projetados para a superfície coerente com a sua vista elétrica.', '', '| Componente | Bornes | Superfície | Tipologia explícita | Estado |', '|---|---:|---|---|---|']
  for (const row of rows) lines.push(`| ${row.name} (\`${row.type}\`) | ${row.terminals} | ${row.interior.length ? `rever: ${row.interior.join(', ')}` : row.measured ? 'medido no GLB' : 'OK'} | ${row.missingType.length ? `padrão: ${row.missingType.join(', ')}` : 'OK'} | ${row.ok ? '✅' : '⚠️'} |`)
  lines.push('', `**${rows.length} modelos GLB auditados · ${rows.reduce((sum, row) => sum + row.terminals, 0)} bornes.**`, '')
  return lines.join('\n')
}

if (process.argv[1]?.endsWith('audit-terminals.ts')) {
  const markdown = terminalAuditMarkdown()
  fs.mkdirSync('docs', { recursive: true })
  fs.writeFileSync('docs/TERMINAL_AUDIT.md', markdown)
  console.log(markdown)
}
