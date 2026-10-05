/**
 * VARREDURA dos bornes de todos os componentes: onde cada borne assenta de
 * facto (face do volume 3D), comparado com a face declarada na interface real
 * do modelo. Aponta os bornes que ficaram na frente (o defeito clássico) ou
 * dentro do corpo, onde nenhum cabo consegue entrar.
 *
 * Corre sem navegador: `npx tsx scripts/audit-terminal-faces.ts`.
 */
import { TEMPLATES } from '../src/electrical/factory'
import { getComponentModelSpec } from '../src/three/modelPaths'
import { REAL_TERMINALS } from '../src/electrical/realInterfaces'
import type { ComponentType } from '../src/types'

type Face = 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right' | 'CORPO'

const TOL = 0.12

function faceOf(p: { x: number; y: number; z: number }): { face: Face; dist: number } {
  // Convenção do componente: y = 1 é o TOPO (a base é y = 0).
  const candidates: Array<[Face, number]> = [
    ['top', 1 - p.y], ['bottom', p.y],
    ['back', p.z], ['front', 1 - p.z],
    ['left', p.x], ['right', 1 - p.x],
  ]
  candidates.sort((a, b) => a[1] - b[1])
  const [face, dist] = candidates[0]
  return dist <= TOL ? { face, dist } : { face: 'CORPO', dist }
}

const declared = new Map<string, string>()
for (const [type, spots] of Object.entries(REAL_TERMINALS)) {
  for (const spot of spots ?? []) declared.set(`${type}:${spot.label.toUpperCase()}`, spot.face)
}

const offenders: string[] = []
const lines: string[] = []

for (const [type, tpl] of Object.entries(TEMPLATES) as Array<[ComponentType, (typeof TEMPLATES)[ComponentType]]>) {
  const spec = getComponentModelSpec(type)
  const rows: string[] = []
  for (const terminal of tpl.terminals) {
    const p = terminal.position3D
    if (!p) { rows.push(`    ${terminal.label.padEnd(7)} ${terminal.kind.padEnd(11)} SEM position3D`); continue }
    const { face, dist } = faceOf(p)
    const dec = declared.get(`${type}:${terminal.label.toUpperCase()}`) ?? '—'
    const bad = face === 'front' || face === 'CORPO' || (dec !== '—' && dec !== face)
    const rounded = `(${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)})`
    rows.push(`    ${bad ? '!!' : '  '} ${terminal.label.padEnd(7)} ${terminal.kind.padEnd(11)} ${rounded.padEnd(24)} face=${face.padEnd(6)} (d=${dist.toFixed(3)}) declarada=${dec}`)
    if (bad) offenders.push(`${type} · ${terminal.label} → face=${face} (declarada=${dec})`)
  }
  lines.push(`\n== ${type}${spec ? '' : '  [sem modelo 3D]'}  bornes=${tpl.terminals.length}`)
  lines.push(...rows)
}

console.log(lines.join('\n'))
console.log('\n' + '='.repeat(78))
console.log(`BORNES A REVER (frente, dentro do corpo, ou face diferente da real): ${offenders.length}`)
for (const o of offenders) console.log('  · ' + o)
