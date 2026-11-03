import assert from 'node:assert/strict'
import { useSimStore } from '../src/store/useSimStore'
import { nativePartidaDiretaContent } from '../src/project/nativeProjects'

// Dados sintéticos: verifica a persistência do projeto, sem serviços externos.
const store = () => useSimStore.getState()
store().loadJSON(JSON.stringify(nativePartidaDiretaContent()))
// O projeto nativo já traz notas e textos explicativos: as verificações seguem a nota e o texto de teste pelo id.
const nativeNotes = store().canvasNotes.length
const nativeTexts = store().canvasTexts.length
store().addCanvasNote({ view: '3d', text: 'Verificar ligação', x: 1, y: 2, z: 0.3 })
const noteId = store().canvasNotes.at(-1)!.id
store().updateCanvasNote(noteId, {
  x: 3, y: 4, color: '#93c5fd', resolved: true,
  messages: [{ id: 'synthetic-message', text: 'Mensagem de teste', author: 'Teste local', createdAt: '2026-10-29T00:00:00Z' }],
})
const textId = store().addCanvasText({ view: '3d', text: 'Etiqueta de teste', x: 5, y: 6, font: 'mono', size: 18, color: '#15803d' })
store().updateCanvasText(textId, { x: 7, y: 8, bold: true, italic: true, underline: true, align: 'center', background: '#ffffff' })
const expectedNotes = structuredClone(store().canvasNotes)
const expectedTexts = structuredClone(store().canvasTexts)
const saved = store().saveJSON()
store().newProject()
assert.equal(store().canvasNotes.length, 0, 'um projeto novo limpa as notas')
assert.equal(store().canvasTexts.length, 0, 'um projeto novo limpa os textos')
store().loadJSON(saved)
assert.deepEqual(store().canvasNotes, expectedNotes, 'posição, cor, conversa e resolução sobrevivem a guardar/reabrir')
assert.deepEqual(store().canvasTexts, expectedTexts, 'posição e formatação do texto sobrevivem a guardar/reabrir')
store().removeCanvasNote(noteId)
store().removeCanvasText(textId)
store().loadJSON(store().saveJSON())
assert.ok(!store().canvasNotes.some((note) => note.id === noteId) && store().canvasNotes.length === nativeNotes, 'a remoção da nota é persistida')
assert.ok(!store().canvasTexts.some((text) => text.id === textId) && store().canvasTexts.length === nativeTexts, 'a remoção do texto é persistida')

const legacy = JSON.parse(saved)
delete legacy.canvasTexts
const legacyNote = legacy.canvasNotes.find((note: { id: string }) => note.id === noteId)
delete legacyNote.messages
delete legacyNote.resolved
store().loadJSON(JSON.stringify(legacy))
assert.equal(store().canvasNotes.find((note) => note.id === noteId)?.text, 'Verificar ligação', 'notas antigas mantêm o texto')
assert.deepEqual(store().canvasTexts, [], 'projetos antigos sem textos continuam válidos')
store().addCanvasNote({ view: 'grafcet', chart: 'chart-synthetic', text: 'Nota da folha', x: 140, y: 220, messages: [{ id: 'msg-grafcet', text: 'Verificar transição', createdAt: '2026-10-29T00:00:00Z' }] })
const grafcetNote = structuredClone(store().canvasNotes[store().canvasNotes.length - 1])
store().loadJSON(store().saveJSON())
assert.deepEqual(store().canvasNotes.find(n => n.id === grafcetNote.id), grafcetNote, 'nota e conversa conservam a folha GRAFCET ao guardar/reabrir')
console.log('[canvas-annotations] OK — 9 verificações de persistência e compatibilidade')
