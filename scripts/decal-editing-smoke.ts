import assert from 'node:assert/strict'
import { useSimStore } from '../src/store/useSimStore'
import { createComponent } from '../src/electrical/factory'

let count = 0
const check = (ok: unknown, label: string) => { assert.ok(ok, label); count++; console.log('PASS — ' + label) }
const state = () => useSimStore.getState()
const reset = () => {
  state().stop()
  const c = createComponent('panelEnclosure', 'QE1', 'Quadro sintético', 0, 0, 0)
  c.state = { ...c.state, widthMm: 600, heightMm: 800, doorOpen: false }
  useSimStore.setState({ components: [c], wires: [], selectedComponentIds: [c.id], selectedWireId: null, selectedWireIds: [], selectedTerminalId: null, selectedDecal: null, history: [], future: [], demoMode: false })
  state().addDecal(c.id, { kind: 'text', face: 'door', text: 'BOMBA 01\nEM SERVIÇO', widthMm: 80, heightMm: 24, fontSizeMm: 4, offsetXmm: 10, offsetYmm: 20, background: '#111111', color: '#ffffff' })
  const decal = state().components[0].decals![0]
  state().selectDecal(c.id, decal.id)
  return { componentId: c.id, decalId: decal.id }
}
const decal = () => state().components[0].decals![0]

const ids = reset()
check(state().selectedDecal?.componentId === ids.componentId && state().selectedDecal?.decalId === ids.decalId, 'Selecionar identifica hospedeiro e etiqueta individual')
const baseline = JSON.stringify(decal()), history = state().history.length
state().beginDecalMove()
state().moveSelectedDecal(3, 5)
state().moveSelectedDecal(17, 25)
state().endDecalMove()
check(decal().offsetXmm === 27 && decal().offsetYmm === 45, 'Arrasto aplica delta desde o início, sem acumulação por evento')
check(state().history.length === history + 1, 'Um gesto cria apenas uma entrada de histórico')
state().undo()
check(JSON.stringify(decal()) === baseline, 'Desfazer único repõe toda a posição anterior ao arrasto')
state().redo()
check(decal().offsetXmm === 27 && decal().offsetYmm === 45, 'Refazer recupera o movimento completo')
state().selectDecal(ids.componentId, ids.decalId)
const cancelBaseline = JSON.stringify(decal()), cancelHistory = state().history.length
state().beginDecalMove(); state().moveSelectedDecal(-80, 40); state().cancelDecalMove()
check(JSON.stringify(decal()) === cancelBaseline && state().history.length === cancelHistory, 'Cancelar arrasto repõe os dados e não cria edição')
const saved = state().saveJSON()
check(!Object.hasOwn(JSON.parse(saved), 'selectedDecal'), 'Seleção transitória fica fora do projeto guardado')
state().loadJSON(saved)
check(decal().text === 'BOMBA 01\nEM SERVIÇO' && decal().fontSizeMm === 4 && decal().offsetXmm === 27, 'Texto multilinha, estilo e posição persistem ao reabrir')
check(state().selectedDecal === null, 'Reabrir projeto limpa a seleção transitória')
state().selectDecal(ids.componentId, ids.decalId)
const pose = JSON.stringify(decal())
useSimStore.setState({ components: state().components.map(c => ({ ...c, locked: true })) })
state().beginDecalMove(); state().moveSelectedDecal(20, 20); state().endDecalMove()
check(JSON.stringify(decal()) === pose, 'Hospedeiro bloqueado impede mover a etiqueta')
useSimStore.setState({ components: state().components.map(c => ({ ...c, locked: false })) })
for (const runState of ['running', 'paused'] as const) {
  useSimStore.setState({ sim: { ...state().sim, runState } })
  state().selectDecal(ids.componentId, ids.decalId)
  state().beginDecalMove(); state().moveSelectedDecal(20, 20); state().endDecalMove()
  check(JSON.stringify(decal()) === pose, `${runState}: etiqueta não muda de posição`)
}
state().stop(); state().selectDecal(ids.componentId, ids.decalId)
state().removeDecal(ids.componentId, ids.decalId)
check(!state().components[0].decals!.length && state().selectedDecal === null, 'Remover etiqueta selecionada limpa seleção obsoleta')
state().undo()
check(state().components[0].decals!.length === 1 && decal().text.includes('BOMBA'), 'Desfazer recupera etiqueta com conteúdo')
state().selectDecal(ids.componentId, ids.decalId)
state().selectComponents([])
check(state().selectedDecal === null, 'Limpar seleção do hospedeiro limpa a seleção da etiqueta')
state().selectDecal(ids.componentId, ids.decalId)
const beforeRun = JSON.stringify(decal()), beforeRunHistory = state().history.length
state().beginDecalMove(); state().moveSelectedDecal(11, 7)
useSimStore.setState({ sim: { ...state().sim, runState: 'running' } })
check(state().selectedDecal === null, 'Entrar em RUN fecha a seleção de edição da etiqueta')
check(JSON.stringify(decal()) === beforeRun && state().history.length === beforeRunHistory && !state()._decalMove, 'Entrar em RUN cancela o arrasto em curso sem posição parcial')
state().stop()
state().selectDecal(ids.componentId, ids.decalId)
state().deleteComponents([ids.componentId])
check(state().selectedDecal === null && state().components.length === 0, 'Eliminar hospedeiro não deixa seleção de etiqueta obsoleta')
console.log(`\nPASS — ${count} verificações de edição de etiquetas`)
