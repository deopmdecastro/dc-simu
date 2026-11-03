/**
 * Diagnóstico do projeto nativo «Partida direta» — tem de estar limpo, e as regras
 * têm de continuar a apanhar erros verdadeiros.
 *
 * Contexto: o exemplo nativo abria com 5 erros e 3 avisos. Eram quatro causas distintas:
 *  · a bobina AC do contactor pendurada no 0 V DC da fonte (erro elétrico real);
 *  · os cabos de proteção gravados como «força»/«comando» em vez de «terra»;
 *  · a identidade de fase não atravessava um contactor aberto (falso aviso no motor);
 *  · a regra das fontes exigia cabo nos contactos secos RDY (falso aviso).
 *
 * Este teste fixa as duas coisas ao mesmo tempo: o exemplo limpo e as regras vivas.
 */
import assert from 'node:assert/strict'
import { buildNativePartidaDireta } from '../src/project/nativeProjects'
import { detectDiagnostics } from '../src/utils/errorDetection'
import { computePhaseLabels } from '../src/electrical/phases'
import type { ElectricalComponent, Wire } from '../src/types'

const build = () => {
  const built = buildNativePartidaDireta()
  return {
    components: JSON.parse(JSON.stringify(built.components)) as ElectricalComponent[],
    wires: JSON.parse(JSON.stringify(built.wires)) as Wire[],
  }
}
const diag = (components: ElectricalComponent[], wires: Wire[]) => detectDiagnostics(components, wires, new Set())
const level = (list: ReturnType<typeof diag>, l: 'error' | 'warning') => list.filter((d) => d.level === l)
const messages = (list: ReturnType<typeof diag>) => list.map((d) => d.message).join(' · ')

// 1. O exemplo publicado tem de abrir sem um único diagnóstico.
{
  const { components, wires } = build()
  const list = diag(components, wires)
  assert.equal(level(list, 'error').length, 0, `erros no exemplo nativo: ${messages(list)}`)
  assert.equal(level(list, 'warning').length, 0, `avisos no exemplo nativo: ${messages(list)}`)
}

// 2. Cabo de proteção é `earth`, nunca `power`/`control`.
{
  const { wires } = build()
  const pe = wires.filter((w) => w.color === 'green-yellow')
  assert.ok(pe.length >= 2, 'o exemplo tem de ter cabos de proteção')
  assert.ok(pe.every((w) => w.kind === 'earth'), `cabos PE com kind errado: ${pe.map((w) => `${w.number}:${w.kind}`).join(', ')}`)
}

// 3. A bobina do contactor é AC e é comutada pela fase do comando, não pelo 0 V DC.
{
  const { components, wires } = build()
  const km = components.find((c) => c.ref === 'KM1')!
  const a2 = km.terminals.find((t) => t.label === 'A2')!
  // Com o relé térmico F1 encaixado no contactor, o A2 do KM1 fica tapado e liga-se pela passagem A2 do F1.
  const f1 = components.find((c) => c.ref === 'F1')
  const coilReturn = [a2.id, f1?.terminals.find((t) => t.label === 'A2')?.id].filter((id): id is string => !!id)
  const w = wires.find((x) => coilReturn.includes(x.fromTerminalId) || coilReturn.includes(x.toTerminalId))
  assert.ok(w, 'A2 do KM1 tem de ter retorno (direto ou pela passagem A2 do F1)')
  const other = coilReturn.includes(w.fromTerminalId) ? w.toTerminalId : w.fromTerminalId
  const psu = components.find((c) => c.ref === 'PS1')!
  assert.ok(!psu.terminals.some((t) => t.id === other), 'A2 do KM1 não pode regressar ao 0 V DC da fonte')
}

// 4. Fase do motor identificada mesmo com o contactor aberto (é topologia, não estado).
{
  const { components, wires } = build()
  const km = components.find((c) => c.ref === 'KM1')!
  km.state.energized = false
  const m1 = components.find((c) => c.ref === 'M1')!
  const labels = computePhaseLabels(components, wires)
  const seq = ['U1', 'V1', 'W1'].map((l) => labels.get(m1.terminals.find((t) => t.label === l)!.id))
  assert.deepEqual(seq, ['L1', 'L2', 'L3'], `fases do motor com KM1 aberto: ${seq.join('-')}`)

  // Trocar os dois condutores que chegam ao motor (V1↔W1): a sequência de fases tem de
  // acompanhar a cablagem — é isso que dá o sentido de rotação invertido. Procura-se pelos
  // bornes do motor (não pelo número do cabo, que muda quando o circuito é reorganizado).
  const motorEnd = (label: string) => {
    const id = m1.terminals.find((t) => t.label === label)!.id
    return { id, wire: wires.find((w) => w.fromTerminalId === id || w.toTerminalId === id) }
  }
  const v1 = motorEnd('V1')
  const w1 = motorEnd('W1')
  assert.ok(v1.wire && w1.wire, 'cabos de potência do motor esperados (V1 e W1)')
  const moveEnd = (wire: Wire, from: string, to: string) => { if (wire.fromTerminalId === from) wire.fromTerminalId = to; else wire.toTerminalId = to }
  moveEnd(v1.wire, v1.id, w1.id)
  moveEnd(w1.wire, w1.id, v1.id)
  const swapped = computePhaseLabels(components, wires)
  const seq2 = ['U1', 'V1', 'W1'].map((l) => swapped.get(m1.terminals.find((t) => t.label === l)!.id))
  assert.deepEqual(seq2, ['L1', 'L3', 'L2'], `fases com L2/L3 trocados: ${seq2.join('-')}`)
}

// 5. Controlo positivo: a regra AC↔DC continua a disparar.
{
  const { components, wires } = build()
  const psu = components.find((c) => c.ref === 'PS1')!
  const minus = psu.terminals.find((t) => t.label === '-V2')!
  const km = components.find((c) => c.ref === 'KM1')!
  const a2 = km.terminals.find((t) => t.label === 'A2')!
  // Retorno da bobina: direto no KM1 ou pela passagem A2 do F1 encaixado.
  const f1 = components.find((c) => c.ref === 'F1')
  const coilReturn = [a2.id, f1?.terminals.find((t) => t.label === 'A2')?.id].filter((id): id is string => !!id)
  const back = wires.find((w) => coilReturn.includes(w.fromTerminalId) || coilReturn.includes(w.toTerminalId))!
  if (coilReturn.includes(back.fromTerminalId)) back.toTerminalId = minus.id
  else back.fromTerminalId = minus.id
  const list = diag(components, wires)
  assert.ok(level(list, 'error').some((d) => /classes incompatíveis/.test(d.message)), `esperava erro AC↔DC, veio: ${messages(list)}`)
}

// 6. Controlo positivo: cor verde-amarela manda sobre um `kind` antigo, mas um cabo de fase
//    (preto) num borne PE continua a ser erro.
{
  const { components, wires } = build()
  const pe = wires.find((w) => w.toTerminalId === 'native-m1-PE')!
  pe.kind = 'power' // projeto antigo: kind errado, cor certa → não deve acusar
  assert.equal(level(diag(components, wires), 'error').length, 0, 'verde-amarelo com kind antigo não pode gerar erro')

  pe.color = 'black' // agora é mesmo um condutor de fase num borne PE
  const list = diag(components, wires)
  assert.ok(level(list, 'error').some((d) => /ligado ao borne PE de M1/.test(d.message)), `esperava erro de fase no PE, veio: ${messages(list)}`)
}

// 7. Controlo positivo: falta de cabo num borne de alimentação continua a avisar — e os
//    contactos secos RDY continuam fora dessa exigência.
{
  const { components, wires } = build()
  const psu = components.find((c) => c.ref === 'PS1')!
  const plus = psu.terminals.find((t) => t.label === '+V1')!
  const cut = wires.filter((w) => w.fromTerminalId === plus.id || w.toTerminalId === plus.id)
  assert.ok(cut.length, '+V1 tem de ter cabo no exemplo')
  const remaining = wires.filter((w) => !cut.includes(w))
  const list = diag(components, remaining)
  assert.ok(level(list, 'warning').some((d) => /PS1:\+V1 sem cabo/.test(d.message)), `esperava aviso em +V1, veio: ${messages(list)}`)
  assert.ok(!level(list, 'warning').some((d) => /RDY/.test(d.message)), 'RDY é contacto seco: não se exige cabo')
}

console.log('PASS — diagnóstico do exemplo nativo: 0 erros, 0 avisos, e as regras continuam a apanhar os erros verdadeiros')
