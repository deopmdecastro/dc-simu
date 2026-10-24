/**
 * Simulação INTEGRADA estilo TIA Portal — o cenário dos ecrãs do utilizador:
 *   OB100 «RESTART COMPLETO» (obStartup): MW0==0 → MOVE 1→MW0         (1ª passagem)
 *   Main [OB1]: CALL «Controlo» + CALL «Saída» (rung vazio = sempre energizado)
 *   Controlo (FC): N1 MW0==1 · I1 · /I2 → MOVE 2→MW0;  N2 MW0==2 · I2 → MOVE 1→MW0
 *   Saída   (FC): MW0==2 → (Q1)
 *
 * Valida:
 *  - os OBs de arranque correm UMA vez por RUN e ANTES do 1.º scan do Main (como no TIA);
 *  - a comunicação entre pastas/blocos: CALL executa as networks do FC (callableBlocks);
 *  - MOVE escreve palavras MWn; comparadores leem MWn; bobinas escrevem Qn;
 *  - idempotência: o OB100 não volta a correr nos scans seguintes.
 *
 * Corre com `npx tsx scripts/ladder-integration-smoke.ts`.
 */
import { useSimStore } from '../src/store/useSimStore'
import type { LadderRung } from '../src/types'
import type { ProjectFile } from '../src/ladder/projectFiles'

let checks = 0
const ok = (label: string, condition: boolean) => {
  checks += 1
  if (!condition) { console.error(`[ladder-integration] ${label}`); process.exit(1) }
}
const store = () => useSimStore.getState()

const cmp = (id: string, address: string, value: string) => ({
  id, address, contactType: 'CMP' as const, compareOp: '==' as const, compareType: 'Int' as const, compareValue: value,
})
const rung = (id: string, name: string, contacts: Record<string, unknown>[], patch: Partial<LadderRung> = {}): LadderRung => ({
  id, name, branches: [{ id: `${id}-b`, elements: contacts as never }], coils: [], enabled: true, collapsed: false, ...patch,
})
const callRung = (id: string, targetId: string): LadderRung =>
  ({ id, name: '', branches: [{ id: `${id}-b`, elements: [] }], coils: [], enabled: true, collapsed: false, call: { targetId } })

const file = (id: string, name: string, rungs: LadderRung[], exec?: 'obStartup' | 'obCyclic'): ProjectFile => ({
  id, folder: 'programBlocks', name, content: '', rungs, exec, createdAt: '2026-01-01T00:00:00.000Z',
})

store().newProject()
store().loadJSON(JSON.stringify({
  app: 'dc-simu', version: 6, components: [], wires: [],
  ladder: { rungs: [callRung('ma1', 'fcControl'), callRung('ma2', 'fcOut')] },
  ladderLegacy: [],
  projectFiles: {
    _general: [
      file('ob100', 'RESTART COMPLETO [OB 100]', [
        rung('ob1', 'Inicio — restart', [cmp('c0', 'MW0', '0')], { move: { source: '1', target: 'MW0' } }),
        // MW3 conta execuções do arranque — prova direta de "só corre UMA vez por RUN".
        rung('ob2', 'Contador de arranques', [], { math: { op: 'ADD' as const, in1: 'MW3', in2: '1', out: 'MW3' } }),
      ], 'obStartup'),
      file('fcControl', 'Controlo', [
        rung('f1', '', [cmp('c1', 'MW0', '1'), { id: 'i1', address: 'I1', contactType: 'NO' }, { id: 'i2', address: 'I2', contactType: 'NC' }], { move: { source: '2', target: 'MW0' } }),
        rung('f2', '', [cmp('c2', 'MW0', '2'), { id: 'i3', address: 'I2', contactType: 'NO' }], { move: { source: '1', target: 'MW0' } }),
      ]),
      // Como no ecrã do utilizador (FC2: MW0==1 → Q1) — é o que discrimina a ordem do scan.
      file('fcOut', 'Saída', [rung('f3', '', [cmp('c3', 'MW0', '1')], { coils: [{ id: 'q1', address: 'Q1', coilType: 'COIL' }] })]),
    ],
  },
}))

// ---- SCAN 1 (o próprio loadJSON executa um scan, igual ao RUN no editor) ----
// Ordem TIA: o arranque corre PRIMEIRO (MW0 vazio = 0 → MOVE 1→MW0) e só depois o Main:
// a «Saída» vê MW0==1 no MESMO scan e liga Q1. Com a ordem antiga Q1 ficaria a 0.
ok('scan único: arranque antes do Main (MW0=1) e Saída já ativa (Q1=1)',
  store().runtime.db.MW0?.value === 1 && store().runtime.table.Q1 === true)
ok('arranque contado exatamente 1 vez (MW3=1)', store().runtime.db.MW3?.value === 1)

// ---- I1 ativo → «Controlo» N1 sobe MW0 para 2; «Saída» segue no mesmo scan
store().setVirtualInput('I1', true)
ok('CALL+comparação+MOVE entre blocos: MW0=2 e Q1 segue (desliga, ==1 falso)',
  store().runtime.db.MW0?.value === 2 && store().runtime.table.Q1 === false)
ok('arranque NÃO repetiu (MW3 continua 1)', store().runtime.db.MW3?.value === 1)

// ---- I2 ativo → N2 reverte MW0 para 1; a Saída liga outra vez
store().setVirtualInput('I1', false)
store().setVirtualInput('I2', true)
ok('ciclo completo: MW0 volta a 1 e Q1 religa', store().runtime.db.MW0?.value === 1 && store().runtime.table.Q1 === true)
ok('arranque continua sem repetir (MW3=1)', store().runtime.db.MW3?.value === 1)

// ---- STOP + novo RUN (via save/load, integração com o ficheiro): arranque volta a correr UMA vez e primeiro
store().stop()
store().clearVirtualInputs()
store().loadJSON(store().saveJSON())
ok('reload preserva o programa e repete o arranque UMA vez, antes do Main (MW0=1, Q1=1)',
  store().runtime.db.MW0?.value === 1 && store().runtime.table.Q1 === true && store().runtime.db.MW3?.value === 1)
store().step()
ok('scan seguinte do novo RUN não volta a correr o arranque (MW3=1)', store().runtime.db.MW3?.value === 1)

console.log(`[ladder-integration] OK — ${checks} verificações`)
