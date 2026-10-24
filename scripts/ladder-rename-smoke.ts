/**
 * Renomear pastas do projeto e blocos FC1/FC2 no editor Ladder:
 * store, histórico (desfazer) e ida-e-volta no ficheiro do projeto.
 * Corre com `npx tsx scripts/ladder-rename-smoke.ts`.
 */
import { useSimStore } from '../src/store/useSimStore'

let checks = 0
const ok = (label: string, condition: boolean) => {
  checks += 1
  if (!condition) { console.error(`[ladder-rename] ${label}`); process.exit(1) }
}

const store = () => useSimStore.getState()

// estado de partida limpo
store().newProject()
ok('pastas começam sem rótulos personalizados', Object.keys(store().projectFolderLabels).length === 0)
ok('FCs começam sem nome personalizado', Object.keys(store().fcNames).length === 0)

// renomear pastas (por PLC: sem PLC ativo → chave '_general')
store().renameProjectFolder('dataBlocks', 'Dados da máquina')
ok('pasta renomeada fica no store', store().projectFolderLabels['_general']?.dataBlocks === 'Dados da máquina')

// desfazer volta ao predefinido
store().undo()
ok('desfazer remove o rótulo personalizado', store().projectFolderLabels['_general']?.dataBlocks === undefined || store().projectFolderLabels['_general']?.dataBlocks === '')

// refazer reaplica
store().redo()
ok('refazer reaplica o rótulo', store().projectFolderLabels['_general']?.dataBlocks === 'Dados da máquina')

// vazio repõe o predefinido (guarda-se string vazia; a árvore cai no NODE_TITLES)
store().renameProjectFolder('dataBlocks', '   ')
ok('nome vazio limpa o rótulo', store().projectFolderLabels['_general']?.dataBlocks === '')

// repetir o mesmo nome não cria histórico
const historyBefore = store().history.length
store().renameProjectFolder('dataBlocks', '')
ok('renomear para o mesmo valor não altera nada', store().history.length === historyBefore)

// blocos fixos FC1/FC2
store().renameFc('fc1', 'Motores')
ok('FC1 renomeado no store', store().fcNames.fc1 === 'Motores')

// persistência: guarda e recarrega mantém rótulos e nomes de FC
const json = store().saveJSON()
store().newProject()
store().loadJSON(json)
ok('rótulo vazio de pasta sobrevive à ida-e-volta', store().projectFolderLabels['_general']?.dataBlocks === '')
ok('nome do FC1 sobrevive à ida-e-volta', store().fcNames.fc1 === 'Motores')

console.log(`[ladder-rename] OK — ${checks} verificações`)
