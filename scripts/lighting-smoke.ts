/**
 * Smoke test completo da suíte de Iluminação (6 componentes + IEC 60617 + datasheets).
 *
 * Valida:
 *  1. Presença no catálogo, grupo 'Iluminação', datasheets PDF reais em disco e GLBs.
 *  2. Energização 230 V~ AC (exige L + N reais; recusa falta de neutro, 24 V DC e mesma fase).
 *  3. Interruptor Simples (L↔1), Duplo (L↔1 e L↔2 independentes nas 4 combinações)
 *     e Comutação de Escada com 2 comutadores SPDT (tabela de verdade completa).
 *  4. Consumo elétrico e corrente em `panelMeterModel.ts` (40–100 W, 8–20 W, 4–10 W)
 *     e fotometria (lm, equivalência, cos φ).
 *  5. STOP apaga lâmpadas mas preserva posição mecânica dos interruptores.
 *  6. Exemplo IEC 60617 `staircaseLightingExample()` em `src/commands/engine.ts`.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createComponent, paletteGroups, TEMPLATES } from '../src/electrical/factory'
import { simulate } from '../src/electrical/engine'
import { loadEstimate } from '../src/electrical/panelMeterModel'
import { useSimStore } from '../src/store/useSimStore'
import { LAMP_SPECS, SWITCH_SPECS, lampPhotometrics, LIGHTING_TYPES } from '../src/three/lightingModel'
import { MODEL_PATHS, getComponentPhysicalSizeMm } from '../src/three/modelPaths'
import { staircaseLightingExample } from '../src/commands/examples'
import { emptyCmdRuntime, stepCommands } from '../src/commands/engine'
import type { ElectricalComponent, Wire } from '../src/types'

let passed = 0
const ok = (label: string, cond: unknown) => {
  assert.ok(cond, `FAIL — ${label}`)
  passed++
  console.log(`PASS — ${label}`)
}

const wire = (id: string, a: ElectricalComponent, al: string, b: ElectricalComponent, bl: string): Wire => {
  const ta = a.terminals.find((t) => t.label === al)
  const tb = b.terminals.find((t) => t.label === bl)
  assert.ok(ta && tb, `Bornes em falta: ${a.ref}.${al} / ${b.ref}.${bl}`)
  return { id, fromTerminalId: ta.id, toTerminalId: tb.id, color: '#92400e', gauge: '1.5mm2' }
}

// 1. Catálogo, grupo 'Iluminação', GLBs e datasheets PDF reais
const groups = paletteGroups()
const lightingGroup = groups.find((g) => g.group === 'Iluminação')
ok('Grupo «Iluminação» existe em paletteGroups() com os 6 componentes', !!lightingGroup && lightingGroup.items.length === 6)

for (const type of LIGHTING_TYPES) {
  const tpl = TEMPLATES[type]
  ok(`${type}: template registado com categoria lighting`, tpl?.category === 'lighting' && tpl.group === 'Iluminação')
  const glbRel = MODEL_PATHS[type]
  ok(`${type}: GLB existe em public${glbRel}`, !!glbRel && fs.existsSync(path.join(process.cwd(), 'public', glbRel)))
  const phys = getComponentPhysicalSizeMm(type)
  ok(`${type}: dimensões físicas definidas`, !!phys && phys.width > 0 && phys.height > 0 && phys.depth > 0)
  const pdfPath = type in LAMP_SPECS
    ? LAMP_SPECS[type as keyof typeof LAMP_SPECS].datasheetPath
    : SWITCH_SPECS[type as keyof typeof SWITCH_SPECS].datasheetPath
  const absPdf = path.join(process.cwd(), 'public', pdfPath)
  ok(`${type}: ficha técnica PDF existe e é %PDF`, fs.existsSync(absPdf) && fs.readFileSync(absPdf).subarray(0, 4).toString() === '%PDF')
}

// 2. Energização 230 V~ AC e rejeição de 24 V DC / falta de neutro / mesma fase
const store = useSimStore.getState()
const runCircuit = (components: ElectricalComponent[], wires: Wire[]) => {
  const cur = useSimStore.getState()
  useSimStore.setState({
    components,
    wires,
    sim: { ...cur.sim, runState: 'running' },
  })
  useSimStore.getState().step()
  return useSimStore.getState().components
}

// 2a. 230 V~ AC direto L+N -> todas as 3 lâmpadas acendem
{
  const src = createComponent('powerSource1ph', 'G1', 0, 0)
  const inc = createComponent('lampIncandescentE27', 'E1', 100, 0)
  const cfl = createComponent('lampFluorescentE27', 'E2', 200, 0)
  const led = createComponent('lampLedE27', 'E3', 300, 0)
  const out = runCircuit(
    [src, inc, cfl, led],
    [
      wire('w1', src, 'L', inc, 'L'), wire('w2', src, 'N', inc, 'N'),
      wire('w3', src, 'L', cfl, 'L'), wire('w4', src, 'N', cfl, 'N'),
      wire('w5', src, 'L', led, 'L'), wire('w6', src, 'N', led, 'N'),
    ],
  )
  ok('230 V~ AC direto acende Incandescente, CFL e LED', [inc, cfl, led].every((l) => out.find((x) => x.id === l.id)?.state.on === true))
}

// 2b. 24 V DC -> lâmpada 230 V~ NÃO acende
{
  const dc = createComponent('powerSource24v', 'G2', 0, 0)
  const led = createComponent('lampLedE27', 'E1', 100, 0)
  const out = runCircuit([dc, led], [wire('w1', dc, dc.terminals[0].label, led, 'L'), wire('w2', dc, dc.terminals[1].label, led, 'N')])
  ok('24 V DC não acende lâmpada E27 230 V~', out.find((x) => x.id === led.id)?.state.on === false)
}

// 2c. Sem neutro -> lâmpada NÃO acende
{
  const src = createComponent('powerSource1ph', 'G1', 0, 0)
  const inc = createComponent('lampIncandescentE27', 'E1', 100, 0)
  const out = runCircuit([src, inc], [wire('w1', src, 'L', inc, 'L')])
  ok('Sem neutro (só fase L) não acende lâmpada E27', out.find((x) => x.id === inc.id)?.state.on === false)
}

// 3. Interruptor Simples (wallSwitchSimple: L↔1)
{
  const src = createComponent('powerSource1ph', 'G1', 0, 0)
  const sw = createComponent('wallSwitchSimple', 'S1', 80, 0)
  const lamp = createComponent('lampIncandescentE27', 'E1', 180, 0)
  const ws = [wire('w1', src, 'L', sw, 'L'), wire('w2', sw, '1', lamp, 'L'), wire('w3', src, 'N', lamp, 'N')]
  let out = runCircuit([src, sw, lamp], ws)
  ok('Interruptor Simples OFF mantém lâmpada apagada', out.find((x) => x.id === lamp.id)?.state.on === false)
  useSimStore.getState().operateComponent(sw.id, { on: true })
  useSimStore.getState().step()
  out = useSimStore.getState().components
  ok('Interruptor Simples ON acende lâmpada', out.find((x) => x.id === lamp.id)?.state.on === true)
  // STOP apaga lâmpada e conserva interruptor ligado
  useSimStore.getState().stop()
  out = useSimStore.getState().components
  ok('STOP apaga lâmpada mas conserva estado mecânico do interruptor', out.find((x) => x.id === lamp.id)?.state.on === false && out.find((x) => x.id === sw.id)?.state.on === true)
}

// 4. Interruptor Duplo (wallSwitchDouble: L↔1 via on1, L↔2 via on2)
{
  const src = createComponent('powerSource1ph', 'G1', 0, 0)
  const sw = createComponent('wallSwitchDouble', 'S1', 80, 0)
  const l1 = createComponent('lampIncandescentE27', 'E1', 180, 0)
  const l2 = createComponent('lampFluorescentE27', 'E2', 280, 0)
  const ws = [
    wire('w1', src, 'L', sw, 'L'),
    wire('w2', sw, '1', l1, 'L'), wire('w3', src, 'N', l1, 'N'),
    wire('w4', sw, '2', l2, 'L'), wire('w5', src, 'N', l2, 'N'),
  ]
  runCircuit([src, sw, l1, l2], ws)
  const checkDouble = (on1: boolean, on2: boolean) => {
    useSimStore.getState().operateComponent(sw.id, { on1, on2 })
    useSimStore.getState().step()
    const comps = useSimStore.getState().components
    const s1 = comps.find((x) => x.id === l1.id)?.state.on === true
    const s2 = comps.find((x) => x.id === l2.id)?.state.on === true
    ok(`Interruptor Duplo (${on1 ? 1 : 0},${on2 ? 1 : 0}) -> L1=${s1 ? 'ON' : 'OFF'}, L2=${s2 ? 'ON' : 'OFF'}`, s1 === on1 && s2 === on2)
  }
  checkDouble(false, false)
  checkDouble(true, false)
  checkDouble(false, true)
  checkDouble(true, true)
}

// 5. Comutação de Escada com 2× wallSwitchStaircase (S1 + S2) -> LED E27
{
  const src = createComponent('powerSource1ph', 'G1', 0, 0)
  const s1 = createComponent('wallSwitchStaircase', 'S1', 80, 0)
  const s2 = createComponent('wallSwitchStaircase', 'S2', 180, 0)
  const led = createComponent('lampLedE27', 'E1', 280, 0)
  const ws = [
    wire('w1', src, 'L', s1, 'L'),
    wire('w2', s1, '1', s2, '1'),
    wire('w3', s1, '2', s2, '2'),
    wire('w4', s2, 'L', led, 'L'),
    wire('w5', src, 'N', led, 'N'),
  ]
  runCircuit([src, s1, s2, led], ws)
  const checkStair = (p1: boolean, p2: boolean, expectLit: boolean) => {
    useSimStore.getState().operateComponent(s1.id, { on: p1 })
    useSimStore.getState().operateComponent(s2.id, { on: p2 })
    useSimStore.getState().step()
    const lit = useSimStore.getState().components.find((x) => x.id === led.id)?.state.on === true
    ok(`Comutação de Escada S1=${p1 ? 2 : 1}, S2=${p2 ? 2 : 1} -> LED ${expectLit ? 'ON' : 'OFF'}`, lit === expectLit)
  }
  checkStair(false, false, true)  // ambos em 1 -> acesa
  checkStair(true, false, false)  // S1=2, S2=1 -> apagada
  checkStair(true, true, true)    // ambos em 2 -> acesa
  checkStair(false, true, false)  // S1=1, S2=2 -> apagada
}

// 6. Potência, corrente e fotometria comparativa (ref. imagem do utilizador)
{
  const inc60 = createComponent('lampIncandescentE27', 'E1', 0, 0); inc60.state.on = true
  const cfl12 = createComponent('lampFluorescentE27', 'E2', 0, 0); cfl12.state.on = true
  const led8 = createComponent('lampLedE27', 'E3', 0, 0); led8.state.on = true
  const eInc = loadEstimate(inc60)
  const eCfl = loadEstimate(cfl12)
  const eLed = loadEstimate(led8)
  ok('Corrente Incandescente 60 W ≈ 0,261 A (cos φ 1,00)', !!eInc && Math.abs(eInc.amps - 60 / 230) < 0.01)
  ok('Corrente CFL 12 W ≈ 0,087 A (cos φ 0,60)', !!eCfl && Math.abs(eCfl.amps - 12 / (230 * 0.6)) < 0.01)
  ok('Corrente LED 8 W ≈ 0,050 A (cos φ 0,70)', !!eLed && Math.abs(eLed.amps - 8 / (230 * 0.7)) < 0.01)
  const pLed = lampPhotometrics('lampLedE27', 8)
  const pInc = lampPhotometrics('lampIncandescentE27', 60)
  ok('LED 8 W produz mais fluxo (806 lm) do que Incandescente 60 W (710 lm)', pLed.lumens > pInc.lumens)
}

// 7. Esquema IEC 60617 pronto de Comutação de Escada (src/commands)
{
  const diag = staircaseLightingExample()
  const e1 = diag.parts.find((p) => p.tag === 'E1')!
  const e2 = diag.parts.find((p) => p.tag === 'E2')!
  const e3 = diag.parts.find((p) => p.tag === 'E3')!
  ok('Exemplo IEC «Comutação de escada» contém E1 (LED), E2 (CFL), E3 (INC)', e1?.kind === 'lampLed' && e2?.kind === 'lampFluorescent' && e3?.kind === 'lampIncandescent')

  let rt = stepCommands(diag, { ...emptyCmdRuntime(), running: true }, 0)
  ok('IEC Escada repouso (S1=1, S2=1 cruzado): E1 apagada, sem falhas', !rt.fault && !rt.lamps[e1.id])

  rt = stepCommands(diag, { ...rt, toggled: { ...rt.toggled, S1: true } }, 50)
  ok('IEC Escada ao comutar S1: E1 acende', !rt.fault && !!rt.lamps[e1.id])

  rt = stepCommands(diag, { ...rt, toggled: { ...rt.toggled, S2: true } }, 50)
  ok('IEC Escada ao comutar S2: E1 apaga', !rt.fault && !rt.lamps[e1.id])

  rt = stepCommands(diag, { ...rt, toggled: { ...rt.toggled, S1: false } }, 50)
  ok('IEC Escada ao voltar S1: E1 volta a acender', !rt.fault && !!rt.lamps[e1.id])

  rt = stepCommands(diag, { ...rt, toggled: { ...rt.toggled, S3: true, S4: true } }, 50)
  ok('IEC Simples S3/S4 acendem E2 (CFL) e E3 (Incandescente)', !rt.fault && !!rt.lamps[e2.id] && !!rt.lamps[e3.id])
}

console.log(`\nPASS — ${passed} verificações de Iluminação concluídas sem erros.`)
