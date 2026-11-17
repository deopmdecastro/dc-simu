/**
 * Smoke test de réguas de bornes (duplicação, auto-agrupamento, kits IEC, pontes FBS,
 * seccionamento, plaquetas ZB) e funcionamento real dos controlos do Inspetor (DM-20,
 * fontes configuráveis, encravamento de contactores, seletores, chave, PLC RUN/STOP,
 * condensador e numeração automática de cabos).
 */
import assert from 'node:assert/strict'
import { useSimStore } from '../src/store/useSimStore'
import { computeContinuity } from '../src/electrical/engine'
import { computePhaseLabels } from '../src/electrical/phases'
import { meterInputFor } from '../src/electrical/meterModel'
import { resolveTerminalStrips, terminalFrontBadge, terminalStripFor } from '../src/electrical/pti6Strip'
import { importedActuationPatch } from '../src/electrical/importedComponents'
import { triggerControl } from '../src/catalog/runtimeControls'
import { DM20_CONTROLS, DM20_DEFINITION } from '../src/three/MultimeterDm20Panel'
import { groupOf } from '../src/ui/selectionGroups'
import { nativeEstrelaKs1Content } from '../src/project/nativeEstrelaKs1'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`PASS — ${name}`)
}

function reset() {
  useSimStore.getState().newProject()
}

// 1. Duplicar 1 borne numa calha DIN encosta à direita (8,15 mm), promove para X1.1/X1.2 e agrupa automaticamente
check('Ctrl+D num borne em calha DIN cria régua encostada e auto-agrupada', () => {
  reset()
  const s = useSimStore.getState()
  const railId = s.addComponent('dinRail15x55', 100, 200)
  const b1 = s.addComponent('terminalPhoenixPti6', 140, 180)
  useSimStore.setState((st) => ({
    components: st.components.map((c) => (c.id === b1 ? { ...c, ref: 'X1', railId, railOffsetMm: 40 } : c)),
  }))
  useSimStore.getState().duplicateComponents([b1])
  const after1 = useSimStore.getState()
  const strip1 = terminalStripFor(after1.components, b1)
  assert.ok(strip1 && strip1.members.length === 2, 'deve formar régua de 2 bornes')
  assert.equal(strip1.headerTag, 'X1')
  assert.deepEqual(strip1.members.map((m) => m.ref), ['X1.1', 'X1.2'])
  assert.ok(Math.abs((strip1.members[1].railOffsetMm ?? 0) - 48.15) < 0.2, 'offset encostado a 8,15 mm')
  const grp = groupOf(after1.selectionGroups, 'schematic', b1)
  assert.ok(grp && strip1.members.every((m) => grp.members.includes(m.id)), 'auto-agrupado em selectionGroups')
})

// 2. Duplicar régua completa cria X2.1…X2.N na mesma calha preservando cores, plaquetas e pontes FBS
check('Duplicar régua completa clona X1 → X2 preservando cores, plaquetas ZB e pontes FBS', () => {
  reset()
  const s = useSimStore.getState()
  const railId = s.addComponent('dinRail15x55', 100, 200)
  const b1 = s.addComponent('terminalPhoenixPti6', 140, 180)
  useSimStore.setState((st) => ({
    components: st.components.map((c) => (c.id === b1 ? { ...c, ref: 'X1', railId, railOffsetMm: 20 } : c)),
  }))
  useSimStore.getState().applyTerminalStripPreset(b1, '3p-n-pe')
  const st1 = terminalStripFor(useSimStore.getState().components, b1)!
  assert.equal(st1.members.length, 5)
  assert.equal(st1.headerTag, 'X1')
  assert.equal(st1.members[4].type, 'terminalPE')
  assert.equal(terminalFrontBadge(st1.members[0], true), 'L1')
  assert.equal(terminalFrontBadge(st1.members[3], true), 'N')
  assert.equal(terminalFrontBadge(st1.members[4], true), 'PE')

  useSimStore.getState().toggleTerminalJumper(st1.members[0].id, true)
  useSimStore.getState().duplicateComponents(st1.members.map((m) => m.id))

  const allStrips = resolveTerminalStrips(useSimStore.getState().components)
  assert.equal(allStrips.length, 2, 'devem existir réguas X1 e X2')
  const x2 = allStrips.find((x) => x.headerTag === 'X2')
  assert.ok(x2 && x2.members.length === 5, 'X2 tem 5 bornes')
  assert.equal(x2.members[0].state.jumperNext, true, 'ponte FBS preservada em X2')
  assert.equal(x2.members[3].bodyColor, '#2563eb', 'cor azul do neutro preservada em X2')
  assert.equal(x2.members[4].type, 'terminalPE', 'borne PE preservado em X2')
  assert.notEqual(x2.explicitStripId, st1.explicitStripId, 'stripId independente de X1')
})

// 3. Auto-agrupamento ao renomear TAG (X9 → X1.4) + desagrupar/reagrupar
check('Renomear TAG para X1.N auto-agrupa com régua X1 e Desagrupar/Agrupar funcionam', () => {
  reset()
  const s = useSimStore.getState()
  const b1 = s.addComponent('terminalPhoenixPti6', 100, 200)
  useSimStore.getState().createTerminalStrip(b1, 3, { hierarchical: true, startIndex: 1 })
  const loose = useSimStore.getState().addComponent('terminalPhoenixPti6', 360, 200)
  useSimStore.getState().updateComponent(loose, { ref: 'X1.4' })
  const st = terminalStripFor(useSimStore.getState().components, b1)!
  assert.equal(st.members.length, 4, 'X1.4 juntou-se automaticamente à régua X1')
  const g1 = groupOf(useSimStore.getState().selectionGroups, 'schematic', loose)
  assert.ok(g1 && g1.members.length === 4, 'grupo contém os 4 bornes')

  useSimStore.getState().setTerminalStripGrouped(b1, false)
  assert.equal(groupOf(useSimStore.getState().selectionGroups, 'schematic', b1), null, 'desagrupado')

  useSimStore.getState().setTerminalStripGrouped(b1, true)
  const g2 = groupOf(useSimStore.getState().selectionGroups, 'schematic', b1)
  assert.ok(g2 && g2.members.length === 4, 'reagrupado')
})

// 4. Continuidade real: ponte FBS propaga fase/tensão, PE recusa ponte, faca bridged=false secciona, multi-pólo isola/penteia
check('Pontes FBS, seccionamento bridged=false e multi-pólo combJumper funcionam no motor elétrico', () => {
  reset()
  const s = useSimStore.getState()
  const srcId = s.addComponent('powerSource1ph', 40, 80)
  const b1 = s.addComponent('terminalPhoenixPti6', 160, 200)
  s.appendToTerminalStrip(b1, [
    { type: 'terminalPhoenixPti6', label: 'Borne 2' },
    { type: 'terminalPE', label: 'Borne PE', suffix: 'PE' },
  ], { numbering: 'hier1' })

  const strip = terminalStripFor(useSimStore.getState().components, b1)!
  const [m1, m2, mPe] = strip.members
  const src = useSimStore.getState().components.find((c) => c.id === srcId)!
  const lTerm = src.terminals.find((t) => t.label === 'L')!
  s.addWire(lTerm.id, m1.terminals[0].id)

  // Sem ponte FBS: m1 conduz para m1[1], mas NÃO para m2
  let cont = computeContinuity(useSimStore.getState().components, useSimStore.getState().wires, [lTerm.id])
  assert.equal(cont.energizedTerminals.has(m1.terminals[1].id), true)
  assert.equal(cont.energizedTerminals.has(m2.terminals[1].id), false)

  // Liga ponte FBS m1 ═ m2: m2 recebe tensão e fase L1!
  s.toggleTerminalJumper(m1.id, true)
  cont = computeContinuity(useSimStore.getState().components, useSimStore.getState().wires, [lTerm.id])
  assert.equal(cont.energizedTerminals.has(m2.terminals[1].id), true, 'ponte FBS conduz para X1.2')
  const phases = computePhaseLabels(useSimStore.getState().components, useSimStore.getState().wires)
  assert.ok(phases.get(m2.terminals[1].id), 'ponte FBS propaga etiqueta de fase')

  // Tentar pontear m2 → PE é bloqueado (segurança IEC)
  s.toggleTerminalJumper(m2.id, true)
  cont = computeContinuity(useSimStore.getState().components, useSimStore.getState().wires, [lTerm.id])
  assert.equal(cont.energizedTerminals.has(mPe.terminals[0].id), false, 'PE nunca recebe ponte FBS')

  // Abrir faca de seccionamento de m2 corta saída de m2[1]
  s.setComponentState(m2.id, { bridged: false })
  cont = computeContinuity(useSimStore.getState().components, useSimStore.getState().wires, [lTerm.id])
  assert.equal(cont.energizedTerminals.has(m2.terminals[1].id), false, 'faca aberta secciona saída de m2')

  // Bloco multi-pólo: pólos isolados por omissão; combJumper=true une-os
  const mpId = s.addComponent('terminalPhoenixPti6', 500, 200)
  s.setTerminalPoleCount(mpId, 3)
  const mp = useSimStore.getState().components.find((c) => c.id === mpId)!
  s.addWire(lTerm.id, mp.terminals[0].id) // pólo 1 topo
  cont = computeContinuity(useSimStore.getState().components, useSimStore.getState().wires, [lTerm.id])
  assert.equal(cont.energizedTerminals.has(mp.terminals[1].id), true, 'pólo 1 conduz topo→base')
  assert.equal(cont.energizedTerminals.has(mp.terminals[2].id), false, 'pólo 2 isolado sem pente')
  s.setComponentState(mpId, { combJumper: true })
  cont = computeContinuity(useSimStore.getState().components, useSimStore.getState().wires, [lTerm.id])
  assert.equal(cont.energizedTerminals.has(mp.terminals[5].id), true, 'pente FBS conduz até pólo 3')
})

// 5. Projeto nativo Estrela-Triângulo: X1 e X2 auto-agrupados sem marcar dirty
check('importProject auto-agrupa X1 e X2 do projeto nativo sem marcar dirty', () => {
  const proj = nativeEstrelaKs1Content()
  useSimStore.getState().loadJSON(JSON.stringify(proj))
  const s = useSimStore.getState()
  assert.equal(s.dirty, false, 'importação mantém dirty=false')
  const strips = resolveTerminalStrips(s.components)
  const x1 = strips.find((st) => st.headerTag === 'X1')
  const x2 = strips.find((st) => st.headerTag === 'X2')
  assert.ok(x1 && x1.members.length === 4, 'X1 agrupada com 4 bornes')
  assert.ok(x2 && x2.members.length === 7, 'X2 agrupada com 7 bornes')
  assert.ok(groupOf(s.selectionGroups, 'schematic', x1.members[0].id), 'X1 em selectionGroups')
  assert.ok(groupOf(s.selectionGroups, 'schematic', x2.members[0].id), 'X2 em selectionGroups')
})

// 6. Multímetro DM-20 + fontes AC/DC com tensão nominal configurável
check('Multímetro DM-20 atua em STOP e mede nominalV personalizado em AC e DC', () => {
  reset()
  const s = useSimStore.getState()
  const dcId = s.addComponent('powerSource24v', 60, 80)
  const acId = s.addComponent('powerSource1ph', 220, 80)
  const mmId = s.addComponent('multimeterDm20', 140, 260)
  s.setComponentState(dcId, { nominalV: 48 })
  s.setComponentState(acId, { nominalV: 127 })

  // Atuar seletor e teclas mesmo em STOP
  triggerControl(DM20_DEFINITION, mmId, DM20_CONTROLS.selector, { select: 'dcv' }, { allowStopped: true })
  triggerControl(DM20_DEFINITION, mmId, DM20_CONTROLS.hold, 'press', { allowStopped: true })
  triggerControl(DM20_DEFINITION, mmId, DM20_CONTROLS.light, 'press', { allowStopped: true })
  const mm1 = useSimStore.getState().components.find((c) => c.id === mmId)!
  assert.equal(mm1.state.selector, 'dcv')
  assert.equal(mm1.state.hold, true)
  assert.equal(mm1.state.backlight, true)

  // Medição DC 48 V
  const dc = useSimStore.getState().components.find((c) => c.id === dcId)!
  const com = mm1.terminals.find((t) => t.label === 'COM')!
  const vJack = mm1.terminals.find((t) => t.label.includes('V') || t.label.includes('Ω'))!
  s.addWire(dc.terminals.find((t) => t.label === '+24V')!.id, vJack.id)
  s.addWire(dc.terminals.find((t) => t.label === '0V')!.id, com.id)
  s.step()
  const live1 = useSimStore.getState()
  const liveMm1 = live1.components.find((c) => c.id === mmId)!
  const inputDc = meterInputFor(DM20_DEFINITION, liveMm1, live1.components, live1.wires, live1.runtime.energizedTerminals, { dial: 'dcv' })
  assert.ok(Math.abs(inputDc.vdc - 48) < 0.5, `esperado 48 V DC, obtido ${inputDc.vdc}`)

  // Medição AC 127 V
  useSimStore.setState((st) => ({ wires: [], components: st.components }))
  const ac = useSimStore.getState().components.find((c) => c.id === acId)!
  s.addWire(ac.terminals.find((t) => t.label === 'L')!.id, vJack.id)
  s.addWire(ac.terminals.find((t) => t.label === 'N')!.id, com.id)
  s.step()
  const live2 = useSimStore.getState()
  const liveMm2 = live2.components.find((c) => c.id === mmId)!
  const inputAc = meterInputFor(DM20_DEFINITION, liveMm2, live2.components, live2.wires, live2.runtime.energizedTerminals, { dial: 'acv' })
  assert.ok(Math.abs(inputAc.vac - 127) < 1, `esperado 127 V AC, obtido ${inputAc.vac}`)
})

// 7. Encravamento de contactores, seletor com mola, chave retentiva, condensador avariado e autoNumberWire
check('Encravamento KM1↔KM2, XA2ED33 com mola, EAO 61 retentiva, condensador e autoNumberWire', () => {
  reset()
  const s = useSimStore.getState()
  const km1 = s.addComponent('contactorWegCWC09', 100, 100)
  const km2 = s.addComponent('contactorWegCWC09', 240, 100)
  s.setContactorInterlock(km1, km2)
  assert.equal(useSimStore.getState().components.find((c) => c.id === km1)!.state.interlockWith, km2)
  assert.equal(useSimStore.getState().components.find((c) => c.id === km2)!.state.interlockWith, km1)
  s.setContactorInterlock(km1, null)
  assert.equal(useSimStore.getState().components.find((c) => c.id === km2)!.state.interlockWith, null)

  // XA2ED33 com retorno à mola (maintain: false)
  const selId = s.addComponent('selectorSchneiderXa2ed33', 100, 260)
  s.setComponentState(selId, { position: 1, maintain: false })
  const sel = useSimStore.getState().components.find((c) => c.id === selId)!
  assert.deepEqual(importedActuationPatch(sel, false), { position: 0 })

  // Chave EAO 61 retentiva (momentary: false)
  const keyId = s.addComponent('keyActuatorEao61', 220, 260)
  s.setComponentState(keyId, { momentary: false, pressed: false })
  const key = useSimStore.getState().components.find((c) => c.id === keyId)!
  assert.deepEqual(importedActuationPatch(key, true), { pressed: true })
  assert.equal(importedActuationPatch(key, false), null)

  // Condensador CBB65 avariado corta continuidade 1–2
  const capId = s.addComponent('capacitorRun60uF', 340, 260)
  const cap0 = useSimStore.getState().components.find((c) => c.id === capId)!
  assert.equal(computeContinuity(useSimStore.getState().components, [], [cap0.terminals[0].id]).energizedTerminals.has(cap0.terminals[1].id), true)
  s.setComponentState(capId, { failed: true })
  assert.equal(computeContinuity(useSimStore.getState().components, [], [cap0.terminals[0].id]).energizedTerminals.has(cap0.terminals[1].id), false)

  // Numeração automática de cabos
  const c1 = useSimStore.getState().components.find((c) => c.id === km1)!
  const c2 = useSimStore.getState().components.find((c) => c.id === km2)!
  s.addWire(c1.terminals[0].id, c2.terminals[0].id)
  s.addWire(c1.terminals[1].id, c2.terminals[1].id)
  const [wireA, wireB] = useSimStore.getState().wires
  useSimStore.setState({ wires: useSimStore.getState().wires.map((w) => ({ ...w, number: '' })) })
  s.autoNumberWire(wireA.id)
  s.autoNumberWire(wireB.id)
  const ws = useSimStore.getState().wires
  assert.equal(ws.find((w) => w.id === wireA.id)!.number, 'W1')
  assert.equal(ws.find((w) => w.id === wireB.id)!.number, 'W2')
})

console.log(`\n✅ ${passed} verificações de réguas de bornes e Inspetor passaram!`)
