/**
 * DC-ADR-071 — bloqueio de seleção e edição em RUN/PAUSA (store).
 * Em RUN ou PAUSA não se seleciona componente nem cabo; ao dar Play a seleção anterior sai de cena;
 * em STOP a seleção volta. Os botões e atuadores continuam a atuar em RUN.
 * A verificação visual no 3D está em `npm run test:sim-select-3d-ui` (Playwright).
 */
import { nativePartidaDiretaContent } from '../src/project/nativeProjects'
import { useSimStore } from '../src/store/useSimStore'

// play() usa window.setInterval; em Node o global é o mesmo objeto.
;(globalThis as unknown as { window: unknown }).window ??= globalThis

let failed = 0
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${extra ? ` (${extra})` : ''}`)
  if (!ok) failed++
}

useSimStore.getState().loadJSON(JSON.stringify(nativePartidaDiretaContent()))
const st = () => useSimStore.getState()
const comp = (ref: string) => st().components.find((c) => c.ref === ref)!
const wireId = st().wires[0]?.id ?? null

// STOP: a seleção funciona normalmente.
st().selectComponents([comp('B1').id])
check('STOP: selecionar um componente funciona', st().selectedComponentIds.includes(comp('B1').id))
if (wireId) {
  st().selectWire(wireId)
  check('STOP: selecionar um cabo funciona', st().selectedWireId === wireId)
}

// RUN: ao dar Play a seleção sai de cena.
st().play()
check('Play coloca a simulação em RUN', st().sim.runState === 'running')
check('Play larga a seleção anterior (cabo e componente)', st().selectedComponentIds.length === 0 && st().selectedWireId === null)

// RUN: nada se seleciona.
st().selectComponents([comp('M1').id])
check('RUN: selecionar componente não tem efeito', st().selectedComponentIds.length === 0)
if (wireId) {
  st().selectWire(wireId)
  check('RUN: selecionar cabo não tem efeito', st().selectedWireId === null)
}
st().selectComponents([comp('M1').id], true)
check('RUN: seleção aditiva (Ctrl/Shift) também fica bloqueada', st().selectedComponentIds.length === 0)

// RUN: os botões e atuadores continuam a atuar.
const before = JSON.stringify(comp('B1').state)
st().setComponentState(comp('B1').id, { startPressed: true })
check('RUN: o botão START continua a atuar', JSON.stringify(comp('B1').state) !== before)
st().setComponentState(comp('B1').id, { startPressed: false })

// PAUSA: mesma regra.
st().pause()
check('Pausa coloca a simulação em PAUSA', st().sim.runState === 'paused')
st().selectComponents([comp('B1').id])
check('PAUSA: continua sem seleção de componentes', st().selectedComponentIds.length === 0)

// STOP: volta a selecionar.
st().stop()
check('Stop coloca a simulação em STOP', st().sim.runState === 'stopped')
st().selectComponents([comp('B1').id])
check('STOP: a seleção volta depois de parar', st().selectedComponentIds.includes(comp('B1').id))

if (failed) {
  console.log(`\n❌ ${failed} verificação(ões) falharam`)
  process.exit(1)
}
console.log('\n✅ Bloqueio de edição em RUN/PAUSA: todas as verificações passaram')
