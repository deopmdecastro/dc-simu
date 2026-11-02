/**
 * Grupos de seleção (Ctrl+G / Ctrl+Shift+G) partilhados pelo 3D/Esquema, GRAFCET e Esquema IEC:
 * funções puras, store (histórico, gravar/abrir) e migração dos grupos antigos do Esquema 2D.
 */
import assert from 'node:assert/strict'
import { expandToGroups, groupIds, parseSelectionGroups, pruneGroups, toggleInSelection, ungroupIds, type SelectionGroup } from '../src/ui/selectionGroups'
import { useSimStore } from '../src/store/useSimStore'

let checks = 0
const check = (ok: boolean, message: string) => { assert.ok(ok, message); console.log(`PASS — ${message}`); checks++ }

// —— Funções puras
let groups: SelectionGroup[] = []
groups = groupIds(groups, 'commands', ['a', 'b'], 'g1')!
check(groups.length === 1 && groups[0].members.join() === 'a,b', 'agrupar 2 elementos cria um grupo')
check(groupIds(groups, 'commands', ['a'], 'x') === null && groupIds(groups, 'commands', ['a', 'b'], 'x') === null, 'um só elemento, ou o mesmo grupo outra vez, não cria nada')
check(expandToGroups(groups, 'commands', ['a']).sort().join() === 'a,b', 'selecionar um membro seleciona o grupo todo')
check(expandToGroups(groups, 'grafcet', ['a']).join() === 'a', 'os grupos são por vista (IEC ≠ GRAFCET)')
groups = groupIds(groups, 'commands', ['b', 'c'], 'g2')!
check(groups.length === 1 && groups[0].members.sort().join() === 'a,b,c', 'agrupar com um membro de outro grupo funde-os')
check(toggleInSelection(groups, 'commands', ['x'], 'a').sort().join() === 'a,b,c,x', 'Ctrl+clique num membro junta o grupo inteiro à seleção')
check(toggleInSelection(groups, 'commands', ['a', 'b', 'c', 'x'], 'b').join() === 'x', 'Ctrl+clique num membro selecionado retira o grupo inteiro')
check(toggleInSelection(groups, 'commands', ['x'], 'y').join() === 'x,y' && toggleInSelection(groups, 'commands', ['x', 'y'], 'y').join() === 'x', 'Ctrl+clique fora de grupos alterna só o elemento')
check(ungroupIds(groups, 'commands', ['c'])!.length === 0 && ungroupIds(groups, 'commands', ['z']) === null, 'desagrupar desfaz o grupo de um membro; fora de grupos não muda nada')
check(pruneGroups(groups, (id) => id !== 'a' && id !== 'b').length === 0 && pruneGroups(groups, (id) => id !== 'a')[0].members.join() === 'b,c', 'membros apagados saem; grupo com menos de 2 desaparece')
check(parseSelectionGroups([{ id: 'g', view: 'grafcet', members: ['s1', 't1'] }, { id: 'bad', view: 'x', members: ['a', 'b'] }, { id: 'one', view: 'commands', members: ['a'] }]).length === 1, 'leitura do projeto ignora grupos inválidos')

// —— Store: histórico, gravar e abrir
const store = useSimStore.getState()
store.loadJSON(JSON.stringify({ app: 'dc-simu', version: 6, components: [], wires: [], canvasTexts: [] }))
check(useSimStore.getState().selectionGroups.length === 0, 'projeto novo sem grupos')
check(useSimStore.getState().groupItems('grafcet', ['s1', 'c1']) && useSimStore.getState().selectionGroups.length === 1, 'store: agrupar (GRAFCET)')
check(!useSimStore.getState().groupItems('grafcet', ['s1']), 'store: um só elemento não agrupa')
useSimStore.getState().undo()
check(useSimStore.getState().selectionGroups.length === 0, 'Ctrl+Z desfaz o agrupar')
useSimStore.getState().redo()
check(useSimStore.getState().selectionGroups.length === 1, 'Ctrl+Y refaz o agrupar')
const saved = JSON.parse(useSimStore.getState().saveJSON())
check(Array.isArray(saved.selectionGroups) && saved.selectionGroups[0].members.join() === 's1,c1', 'os grupos vão com o projeto gravado')
useSimStore.getState().loadJSON(JSON.stringify(saved))
check(useSimStore.getState().selectionGroups.length === 1, 'e voltam ao abrir')
check(useSimStore.getState().ungroupItems('grafcet', ['c1']) && useSimStore.getState().selectionGroups.length === 0, 'store: desagrupar')

// —— Grupos antigos do Esquema 2D (component.groupId) passam a grupos de seleção
const legacy = { app: 'dc-simu', version: 6, wires: [], components: [
  { id: 'k1', type: 'contactor', ref: 'K1', label: '', schematicX: 0, schematicY: 0, w: 60, h: 60, terminals: [], state: {}, groupId: 'g_old' },
  { id: 'k2', type: 'contactor', ref: 'K2', label: '', schematicX: 100, schematicY: 0, w: 60, h: 60, terminals: [], state: {}, groupId: 'g_old' },
] }
useSimStore.getState().loadJSON(JSON.stringify(legacy))
const migrated = useSimStore.getState().selectionGroups
check(migrated.length === 1 && migrated[0].view === 'schematic' && migrated[0].members.sort().join() === 'k1,k2', 'projeto antigo: os componentes agrupados no Esquema 2D ficam num grupo de seleção')

console.log(`\n${checks} verificações dos grupos de seleção passaram`)
