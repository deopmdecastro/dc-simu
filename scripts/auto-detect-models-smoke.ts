import assert from 'node:assert/strict'
import * as THREE from 'three'
import { loadModelMm } from './detect-interfaces'
import { listGlbNodes } from '../src/catalog/componentRig'
import { suggestFromNodes, type Suggestion } from '../src/catalog/interactables'
import type { ComponentType } from '../src/types'

// Deteção automática sobre os GLB reais do projeto (nomes + forma + tipo de equipamento).
async function scan(type: ComponentType): Promise<Suggestion[]> {
  const model = await loadModelMm(type)
  assert.ok(model, `${type}: GLB em falta`)
  const centre = model.box.getCenter(new THREE.Vector3()), size = model.box.getSize(new THREE.Vector3())
  return suggestFromNodes(listGlbNodes(model.root), { bounds: { centre: centre.toArray() as never, size: size.toArray() as never }, category: type }).suggestions
}
const count = (list: Suggestion[], kind: Suggestion['kind']) => list.filter((item) => item.kind === kind).length

const dm20 = await scan('multimeterDm20')
assert.ok(dm20.some((item) => item.kind === 'display' && item.node.includes('Cube002')), 'DM20: LCD (Cube002) não detetado')
assert.ok(count(dm20, 'button') >= 3, 'DM20: botões de função não detetados')
assert.ok(dm20.filter((item) => item.kind === 'button').every((item) => item.returnMode === 'spring'), 'DM20: botões deviam ter mola')
assert.ok(count(dm20, 'selector') >= 1, 'DM20: seletor rotativo não detetado')
assert.ok(!dm20.some((item) => /Text/.test(item.node)), 'DM20: serigrafia confundida com ecrã')
console.log(`PASS — DM20: ${count(dm20, 'display')} ecrã(s), ${count(dm20, 'button')} botões com mola, ${count(dm20, 'selector')} seletor(es)`)

const pkzm = await scan('motorBreakerPkzmC10')
assert.equal(count(pkzm, 'terminal'), 6, 'PKZM: devia detetar 6 bornes pelo nome')
assert.ok(pkzm.filter((item) => item.kind === 'toggle').every((item) => item.returnMode === 'latch' && item.tilt), 'PKZM: manípulos deviam ter retenção a bascular')
assert.ok(pkzm.some((item) => item.kind === 'button' && /test/.test(item.node) && item.returnMode === 'spring'), 'PKZM: botão TEST devia ter mola')
assert.ok(!pkzm.some((item) => /screw/.test(item.node)), 'PKZM: parafuso confundido com botão')
assert.ok(pkzm.filter((item) => item.kind === 'terminal').every((item) => item.point && item.normal), 'PKZM: bornes sem ponto/normal')
console.log(`PASS — PKZM: ${count(pkzm, 'terminal')} bornes, ${count(pkzm, 'toggle')} manípulos com retenção, botão TEST com mola`)

for (const type of ['breaker1p', 'breakerSteckSdC25'] as ComponentType[]) {
  const list = await scan(type)
  assert.ok(count(list, 'toggle') >= 1 && list.filter((item) => item.kind === 'toggle').every((item) => item.returnMode === 'latch'), `${type}: manípulo com retenção não detetado`)
  console.log(`PASS — ${type}: ${count(list, 'toggle')} manípulo(s) com retenção`)
}
console.log('PASS — deteção automática nos modelos reais')
