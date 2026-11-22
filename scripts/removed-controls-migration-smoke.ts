import './node-env'
import assert from 'node:assert/strict'
import { createComponent, TEMPLATES } from '../src/electrical/factory'
import { probe } from '../src/electrical/engine'
import { hiddenCatalogTypes } from '../src/catalog/hidden'
import { buildDirectStartScenario } from '../src/simulation/scenarios'
import { useSimStore } from '../src/store/useSimStore'
import type { ElectricalComponent } from '../src/types'

/**
 * Botão NA/NF e Seletor 2/3 posições genéricos (sem capa/3D) foram APAGADOS do código. Projetos gravados
 * com eles abrem com o aparelho real equivalente: KEOLEA KL-XB2 verde NA (13/14 → 3/4), vermelho NF
 * (21/22 → 1/2) e Schneider XA2ED33 (13/14, 23/24). Os bornes correspondentes mantêm o id: os cabos
 * continuam ligados e o circuito continua a funcionar.
 */
let passed = 0
const check = (name: string, fn: () => void) => { fn(); passed += 1; console.log(`  PASS: ${name}`) }
const REMOVED = ['buttonNO', 'buttonNC', 'selector2', 'selector3']

check('1. Os 4 tipos deixaram de existir (biblioteca, modelos e lista de ocultos)', () => {
  for (const type of REMOVED) {
    assert.equal(type in TEMPLATES, false, type)
    assert.equal(hiddenCatalogTypes.has(type), false, type)
    assert.throws(() => createComponent(type as never, 'X', '', 0, 0, 0))
  }
})

/** Projeto «antigo»: o exemplo de partida direta com STOP/START genéricos e dois seletores genéricos. */
function legacyProject() {
  const { components, wires } = buildDirectStartScenario()
  const asLegacy = (c: ElectricalComponent, type: string, labels: Record<string, string>) => ({
    ...c, type, state: { ...c.state, pressed: false },
    terminals: c.terminals.map((t) => ({ ...t, label: labels[t.label] ?? t.label })),
  })
  const legacy = components.map((c) => c.ref === 'S1' ? asLegacy(c, 'buttonNC', { 1: '21', 2: '22' })
    : c.ref === 'S2' ? asLegacy(c, 'buttonNO', { 3: '13', 4: '14' }) : c) as unknown as ElectricalComponent[]
  const sel = createComponent('selectorSchneiderXa2ed33', 'S7', 'MAN/AUTO', 40, 900, 300)
  const sel2 = { ...sel, type: 'selector2', state: { pressed: true, position: 1, maintain: true }, terminals: sel.terminals.filter((t) => t.label === '13' || t.label === '14') }
  const sel3b = createComponent('selectorSchneiderXa2ed33', 'S8', '', 41, 1000, 300)
  const sel3 = { ...sel3b, type: 'selector3', state: { pressed: false, position: 2, maintain: true } }
  return { components: [...legacy, sel2, sel3], wires }
}

const before = legacyProject()
const ids = Object.fromEntries(before.components.filter((c) => ['S1', 'S2', 'S7', 'S8'].includes(c.ref)).map((c) => [c.ref, c.terminals.map((t) => `${t.label}=${t.id}`)]))
useSimStore.getState().loadJSON(JSON.stringify({ version: 1, components: before.components, wires: before.wires }))
const st = () => useSimStore.getState()
const byRef = (ref: string) => st().components.find((c) => c.ref === ref)!

check('2. Abrir o projeto antigo converte para os aparelhos reais', () => {
  assert.equal(byRef('S1').type, 'pushButtonXb2Nc')
  assert.equal(byRef('S2').type, 'pushButtonXb2No')
  assert.equal(byRef('S7').type, 'selectorSchneiderXa2ed33')
  assert.equal(byRef('S8').type, 'selectorSchneiderXa2ed33')
  assert.ok(!st().components.some((c) => REMOVED.includes(c.type as string)))
})

check('3. Bornes renomeados mantêm o id (21→1, 22→2, 13→3, 14→4; seletor 13/14)', () => {
  const id = (ref: string, label: string) => byRef(ref).terminals.find((t) => t.label === label)!.id
  assert.ok(ids.S1.includes(`21=${id('S1', '1')}`) && ids.S1.includes(`22=${id('S1', '2')}`), JSON.stringify(ids.S1))
  assert.ok(ids.S2.includes(`13=${id('S2', '3')}`) && ids.S2.includes(`14=${id('S2', '4')}`), JSON.stringify(ids.S2))
  assert.ok(ids.S7.includes(`13=${id('S7', '13')}`) && ids.S7.includes(`14=${id('S7', '14')}`))
  assert.deepEqual(byRef('S7').terminals.map((t) => t.label).sort(), ['13', '14', '23', '24'])
})

check('4. Nenhum cabo fica com a ponta solta', () => {
  const all = new Set(st().components.flatMap((c) => c.terminals.map((t) => t.id)))
  const loose = st().wires.filter((w) => !all.has(w.fromTerminalId) || !all.has(w.toTerminalId))
  assert.equal(loose.length, 0, loose.map((w) => w.id).join(', '))
  assert.equal(st().wires.length, before.wires.length)
})

check('5. Contactos: STOP NF fechado em repouso, START NA fecha ao premir', () => {
  const t = (ref: string, label: string) => byRef(ref).terminals.find((x) => x.label === label)!.id
  const comps = st().components, wires = st().wires
  assert.equal(probe(comps, wires, t('S1', '1'), t('S1', '2'), new Set()).connected, true, 'STOP em repouso')
  assert.equal(probe(comps, wires, t('S2', '3'), t('S2', '4'), new Set()).connected, false, 'START em repouso')
  const pressed = comps.map((c) => c.ref === 'S2' ? { ...c, state: { ...c.state, pressed: true } } : c)
  assert.equal(probe(pressed, wires, t('S2', '3'), t('S2', '4'), new Set()).connected, true, 'START premido')
})

check('6. Seletor «acionado» → posição esquerda (13–14 fechado); em repouso → centro (aberto)', () => {
  const t = (ref: string, label: string) => byRef(ref).terminals.find((x) => x.label === label)!.id
  const comps = st().components, wires = st().wires
  assert.equal(byRef('S7').state.position, -1)
  assert.equal(probe(comps, wires, t('S7', '13'), t('S7', '14'), new Set()).connected, true)
  assert.equal(byRef('S8').state.position, 0)
  assert.equal(probe(comps, wires, t('S8', '13'), t('S8', '14'), new Set()).connected, false)
  assert.equal(probe(comps, wires, t('S8', '23'), t('S8', '24'), new Set()).connected, false)
})

console.log(`\n✅ ${passed} verificações da migração dos comandos genéricos apagados passaram`)
