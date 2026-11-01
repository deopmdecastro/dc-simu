import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { EDITOR_GRID_MIN_PITCH, EDITOR_GRID_STEP, editorGridPitch } from '../src/ui/editorTheme'

// A grelha tem uma única regra de passo no ecrã, partilhada por todos os canvas e dispositivos.
let checks = 0
const check = (condition: boolean, message: string) => { assert.ok(condition, message); checks += 1; console.log('PASS — ' + message) }
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

check(editorGridPitch(1) === EDITOR_GRID_STEP, 'zoom 100 %: passo de 20 px')
check(editorGridPitch(2) === 40 && editorGridPitch(5) === 100, 'ao ampliar o passo acompanha o zoom (o ponto fica sobre o íman)')
for (const scale of [0.05, 0.1, 0.2, 0.33, 0.5, 0.75, 1, 1.5, 3, 5]) {
  const pitch = editorGridPitch(scale)
  check(pitch >= EDITOR_GRID_MIN_PITCH, `zoom ${scale}: passo de ${pitch.toFixed(1)} px ≥ ${EDITOR_GRID_MIN_PITCH} px (nunca comprimido)`)
  const ratio = pitch / (EDITOR_GRID_STEP * scale)
  check(Number.isInteger(Math.log2(ratio)), `zoom ${scale}: cada ponto coincide com um ponto do íman (múltiplo de 2^n)`)
}
check(editorGridPitch(0) === EDITOR_GRID_STEP && editorGridPitch(Number.NaN) === EDITOR_GRID_STEP, 'zoom inválido cai no passo padrão')

const grafcet = read('src/grafcet/GrafcetEditor.tsx')
const commands = read('src/commands/CommandsEditor.tsx')
const schematic = read('src/schematic/SchematicView.tsx')
check(/editorGridPitch\(scale, GRID\)/.test(grafcet), 'GRAFCET usa editorGridPitch')
check(/editorGridPitch\(view\.scale, CMD_GRID\)/.test(commands), 'Esquema IEC usa editorGridPitch')
check(/editorGridPitch\(zoom, grid\.size\)/.test(schematic), 'Esquema usa editorGridPitch')
check(/<rect width="100%" height="100%" fill=\{grid\.style === 'dots'/.test(schematic) && !/<g transform=\{`translate\(\$\{panX\},\$\{panY\}\) scale\(\$\{zoom\}\)`\}>\s*\{grid\.enabled/.test(schematic),
  'a grelha do Esquema é desenhada em píxeis do ecrã (fora do grupo escalado): o ponto mede sempre 1 px')
console.log(`\n${checks} verificações OK`)
