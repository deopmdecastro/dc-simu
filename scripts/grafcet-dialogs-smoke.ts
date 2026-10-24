/**
 * Testes rápidos aos helpers dos diálogos GRAFCET (etapa / transição / ação) —
 * corre com `npx tsx scripts/grafcet-dialogs-smoke.ts`.
 */
import {
  actionsOnAddress,
  nextFreeStepNumber,
  sameActionAddress,
  stepIdentifierTakenBy,
  stepNumberOf,
  type GrafcetProgram,
  type GrafcetStep,
} from '../src/grafcet/engine'

let checks = 0
const ok = (label: string, condition: boolean) => {
  checks += 1
  if (!condition) { console.error(`[dialogs] ${label}`); process.exit(1) }
}
const step = (id: string, name: string, initial = false): GrafcetStep => ({ id, name, initial, action: '', condition: '' })

// nextFreeStepNumber
ok('sem etapas começa em 0', nextFreeStepNumber([]) === 0)
ok('três etapas sem nome sugerem 3', nextFreeStepNumber([step('a', ''), step('b', ''), step('c', '')]) === 3)
ok('0,1,2 sugerem 3', nextFreeStepNumber([step('a', '0'), step('b', '1'), step('c', '2')]) === 3)
ok('numeração fluida 10,20,30 sugere 31', nextFreeStepNumber([step('a', '10'), step('b', '20'), step('c', '30')]) === 31)
ok('sufixo de letra conta pelo número', nextFreeStepNumber([step('a', '10a'), step('b', '10b')]) === 11)
ok('nome de texto não numérico segue o índice', nextFreeStepNumber([step('a', 'Avanço do cilindro A'), step('b', '5')]) === 6)

// stepIdentifierTakenBy
const steps = [step('a', '0'), step('b', '1'), step('c', 'Avanço')]
ok('número repetido é detetado', stepIdentifierTakenBy('1', steps, 'a', 0)?.id === 'b')
ok('«Etapa 1» colide com «1»', stepIdentifierTakenBy('Etapa 1', steps, 'a', 0)?.id === 'b')
ok('a própria etapa não colide consigo', stepIdentifierTakenBy('1', steps, 'b', 1) === null)
ok('número livre não colide', stepIdentifierTakenBy('7', steps, 'a', 0) === null)
ok('nome de texto igual colide', stepIdentifierTakenBy('abri', [step('d', 'Abri')], 'x', 0)?.id === 'd')
ok('nome longo recai no índice — sem falso positivo entre índices diferentes', stepIdentifierTakenBy('Avanco', [step('d', 'AbrirTotal')], 'x', 1) === null)
ok('ignora maiúsculas', stepIdentifierTakenBy('ETAPA 1', steps, 'a', 0)?.id === 'b')
ok('etapas sem nome não colidem entre si pelo índice', stepIdentifierTakenBy('', [step('e', ''), step('f', '')], 'e', 0) === null)

// sameActionAddress
ok('«1» é a mesma saída que «Q1»', sameActionAddress('1', 'Q1'))
ok('maiúsculas não distinguem', sameActionAddress('q2', 'Q2'))
ok('saídas diferentes não colidem', !sameActionAddress('Q1', 'Q2'))

// actionsOnAddress
const program: GrafcetProgram = {
  steps: [
    { id: 's0', name: '0', initial: true, action: '', condition: '', actions: [{ id: 'a1', address: 'Q1', condition: '1', kind: 'N' }] },
    { id: 's1', name: '1', initial: false, action: '', condition: '', actions: [{ id: 'a2', address: 'q1', condition: '1', kind: 'R' }] },
    { id: 's2', name: '2', initial: false, action: 'Q5', condition: '', actions: [{ id: 'a3', address: 'Q9', condition: '1' }] },
  ],
  freeActions: [{ id: 'f1', address: 'Q1', condition: '1' }],
}
const peers = actionsOnAddress(program, '1', 'a1')
ok('duas ações pares sobre Q1 (outra etapa + livre), inclui legada e ignora a própria', peers.length === 2 && peers.every((peer) => peer.action.id !== 'a1') && peers.some((peer) => peer.stepIndex === 1) && peers.some((peer) => peer.stepIndex === null))
ok('a ação legada da etapa aparece em Q5', actionsOnAddress(program, 'Q5').some((peer) => peer.action.id === 'legacy-s2'))
ok('endereço sem pares fica vazio', actionsOnAddress(program, 'Q3').length === 0)
ok('endereço vazio não devolve nada', actionsOnAddress(program, '').length === 0)

console.log(`[dialogs] OK — ${checks} verificações`)
