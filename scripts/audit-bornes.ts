/**
 * AUDITORIA DOS BORNES: compara, para cada componente com modelo 3D, a face em
 * que o borne assentava ANTES (convenção de altura invertida, com a normal
 * adivinhada pela coordenada mais encostada à caixa) com a face DEPOIS (a face
 * real do encaixe, declarada pelo aparelho) e com a face medida no GLB.
 *
 * O defeito que esta auditoria persegue é o borne a sair pela FRENTE quando o
 * encaixe está no topo ou na base.
 *
 * Corre sem navegador: `npm run audit:bornes`.
 */
import { TEMPLATES } from '../src/electrical/factory'
import { getComponentModelSpec } from '../src/three/modelPaths'
import { REAL_TERMINALS } from '../src/electrical/realInterfaces'
import type { ComponentType } from '../src/types'

type Face = 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right'
const FACES: Face[] = ['top', 'bottom', 'front', 'back', 'left', 'right']

/** Face mais próxima de um ponto (a heurística antiga, sem face declarada). */
function nearestFace(p: { x: number; y: number; z: number }): Face {
  const distances: Array<[Face, number]> = [
    ['top', 1 - p.y], ['bottom', p.y],
    ['back', p.z], ['front', 1 - p.z],
    ['left', p.x], ['right', 1 - p.x],
  ]
  return distances.sort((a, b) => a[1] - b[1])[0][0]
}

const measured = new Map<string, Face>()
for (const [type, spots] of Object.entries(REAL_TERMINALS)) {
  for (const spot of spots ?? []) measured.set(`${type}:${spot.label.toUpperCase()}`, spot.face as Face)
}

let frontBefore = 0
let frontAfter = 0
let mismatches = 0
let total = 0
const report: string[] = []

for (const [type, tpl] of Object.entries(TEMPLATES) as Array<[ComponentType, (typeof TEMPLATES)[ComponentType]]>) {
  const spec = getComponentModelSpec(type)
  if (!spec || !tpl.terminals.length) continue
  const lines: string[] = []
  for (const terminal of tpl.terminals) {
    const after = terminal.position3D
    if (!after) continue
    total += 1
    // ANTES: a altura estava invertida (y medido de cima para baixo) e a face
    // era a coordenada mais encostada à caixa.
    const beforePoint = { x: after.x, y: 1 - after.y, z: after.z }
    const before = nearestFace(beforePoint)
    const declared = (terminal as { position3DFace?: Face }).position3DFace
    const now = declared ?? nearestFace(after)
    const real = measured.get(`${type}:${terminal.label.toUpperCase()}`)
    const ok = real ? now === real : now !== 'front'
    if (before === 'front') frontBefore += 1
    if (now === 'front') frontAfter += 1
    if (!ok) mismatches += 1
    const flag = ok ? '  ' : '!!'
    lines.push(`   ${flag} ${terminal.label.padEnd(7)} antes=${before.padEnd(6)} depois=${now.padEnd(6)} real=${(real ?? '—').padEnd(6)} ${ok ? 'ok' : 'DIVERGE'}`)
  }
  report.push(`\n== ${tpl.paletteName}  (${type})  ${tpl.terminals.length} bornes`, ...lines)
}

console.log(report.join('\n'))
console.log('\n' + '='.repeat(76))
console.log(`bornes auditados: ${total}`)
console.log(`bornes a sair pela FRENTE antes da correção: ${frontBefore}`)
console.log(`bornes a sair pela FRENTE depois da correção: ${frontAfter}`)
console.log(`bornes em face diferente da real: ${mismatches}`)
if (mismatches) {
  console.log('\nDIVERGÊNCIAS:')
  for (const line of report.join('\n').split('\n')) if (line.includes('DIVERGE')) console.log(line)
  process.exitCode = 1
} else {
  console.log('\nTodos os bornes assentam na face real do encaixe.')
}
