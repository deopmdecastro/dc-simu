import { boundsMm, defaultPart, loadGlbAssets, newId, posedPart } from '../../catalog/definition'
import type { PartDef, Vec3 } from '../../catalog/types'
import { addPart, descendantsOf, duplicatePart, glbCache, patchPart, patchTerminal, posePart, removeParts, selectedPartIds, useEditorStore } from './editorStore'
import { canSplit, convertToGlb, splitPart } from './cadImport'

export const MAX_GLB_BYTES = 4 * 1024 * 1024

export const PART_KINDS: Array<[PartDef['kind'], string]> = [['box', 'Caixa'], ['cylinder', 'Cilindro'], ['sphere', 'Esfera'], ['cone', 'Cone'], ['torus', 'Anel'], ['group', 'Grupo']]

const flash = (text: string) => window.dispatchEvent(new CustomEvent('ce-flash', { detail: text }))

function selectedPart(): PartDef | undefined {
  const { selection, def } = useEditorStore.getState()
  return selection?.kind === 'part' ? def.parts.find((part) => part.id === selection.id) : undefined
}

/** Adiciona uma forma (dentro do grupo selecionado, se houver) e seleciona-a. */
export function addPartAction(kind: PartDef['kind']) {
  const state = useEditorStore.getState()
  const current = selectedPart()
  const parent = current?.kind === 'group' ? current.id : current?.parentId ?? null
  const result = addPart(state.def, kind, parent)
  state.edit(() => result.def)
  state.set({ selection: { kind: 'part', id: result.part.id }, tab: 'object', placing: false, placingSpec: null })
  if (useEditorStore.getState().ribbon !== 'select') useEditorStore.getState().setRibbon('select')
}

/** Importa um modelo 3D / CAD (.glb, .gltf, .stl, .obj). Modelos com várias malhas ficam divididos em peças. Devolve uma mensagem de erro (ou '' se correu bem). */
export async function importModelAction(file: File | undefined): Promise<string> {
  if (!file) return ''
  try {
    const state = useEditorStore.getState()
    const model = await convertToGlb(file)
    const assetId = newId('a_')
    const part: PartDef = { ...defaultPart('glb', null, model.name.replace(/\.[^.]+$/, '')), asset: assetId }
    const next = { ...state.def, assets: { ...state.def.assets, [assetId]: { name: model.name, mime: 'model/gltf-binary', data: model.dataUrl } }, parts: [...state.def.parts, part] }
    await loadGlbAssets(next, glbCache)
    if (!glbCache.has(assetId)) return 'Não foi possível interpretar este modelo (ficheiro inválido ou com compressão não suportada). Exporte-o novamente como .glb simples.'
    // o corpo de exemplo («Corpo», caixa 36×80×58 intacta) esconderia o modelo importado: substitui-o
    const placeholder = state.def.parts.length === 1 && state.def.parts[0].name === 'Corpo' && state.def.parts[0].kind === 'box' && state.def.parts[0].size.join() === '36,80,58'
    const parts = placeholder ? [part] : next.parts
    // pousa o modelo no chão (base a Y = 0), como o resto da peça
    const box = boundsMm({ ...next, parts: [part] }, glbCache)
    // tamanho inicial utilizável: a maior dimensão fica com 100 mm (ajuste depois em Escala)
    const size = box.getSize(box.min.clone())
    const k = Math.max(0.01, Math.round((100 / (Math.max(size.x, size.y, size.z) || 100)) * 100) / 100)
    const placed: PartDef = { ...part, scale: [k, k, k], position: [part.position[0], Math.round((part.position[1] - box.min.y) * k * 100) / 100, part.position[2]] }
    const final = { ...next, parts: parts.map((item) => (item.id === part.id ? placed : item)) }
    state.edit(() => final)
    state.bumpGlb()
    state.set({ selection: { kind: 'part', id: part.id }, extraSel: [], tab: 'object' })
    // projetos CAD com várias partes: cada parte passa a peça própria (selecionável, movível, eliminável)
    let note = ''
    if (model.meshes > 1) {
      const result = splitPart(useEditorStore.getState().def, glbCache, part.id)
      if (!('error' in result)) { useEditorStore.getState().edit(() => result.def); note = `${result.ids.length} peças` }
    }
    useEditorStore.getState().cameraTo('fit')
    flash(note ? `Modelo importado em ${note}. Use «Dividir» para abrir sub-partes.` : 'Modelo importado.')
    return ''
  } catch (error) { return error instanceof Error ? error.message : 'Não foi possível ler o modelo.' }
}
/** Nome antigo (compatibilidade). */
export const importGlbAction = importModelAction

/** Divide a peça selecionada (modelo CAD) nas suas sub-partes. */
export function splitSelection() {
  const part = selectedPart()
  if (!part) return
  const state = useEditorStore.getState()
  const result = splitPart(state.def, glbCache, part.id)
  if ('error' in result) { flash(result.error); return }
  state.edit(() => result.def)
  state.bumpGlb()
  flash(`«${part.name}» dividida em ${result.ids.length} peças.`)
}
export const canSplitSelection = () => { const part = selectedPart(); return !!part && canSplit(useEditorStore.getState().def, glbCache, part.id) }

/** Selecionadas sem as que já vão incluídas no pai selecionado. */
function topSelected(): string[] {
  const state = useEditorStore.getState()
  const ids = selectedPartIds(state)
  return ids.filter((id) => !ids.some((other) => other !== id && descendantsOf(state.def, other).includes(id)))
}

export function duplicateSelection() {
  const ids = topSelected()
  if (!ids.length) return
  const state = useEditorStore.getState()
  let def = state.def
  const created: string[] = []
  for (const id of ids) { const result = duplicatePart(def, id); if (result) { def = result.def; created.push(result.id) } }
  if (!created.length) return
  state.edit(() => def)
  state.selectParts(created)
  state.set({ tab: 'object' })
}

export function groupSelection() {
  const state = useEditorStore.getState()
  const ids = topSelected()
  const first = state.def.parts.find((part) => part.id === ids[0])
  if (!first) return
  const members = ids.map((id) => state.def.parts.find((part) => part.id === id)!).filter((part) => part.parentId === first.parentId)
  const group = { ...defaultPart('group', null, members.length > 1 ? 'Grupo' : first.name + ' (grupo)'), parentId: first.parentId, position: [...first.position] as Vec3 }
  const memberIds = new Set(members.map((part) => part.id))
  state.edit((current) => ({
    ...current,
    parts: [...current.parts.map((item) => (memberIds.has(item.id) ? { ...item, parentId: group.id, position: item.position.map((value, axis) => Math.round((value - first.position[axis]) * 100) / 100) as Vec3 } : item)), group],
  }))
  state.select({ kind: 'part', id: group.id })
}

/** Elimina a seleção: várias peças, bornes, luzes, botões ou ecrãs. Peças bloqueadas não são eliminadas. */
export function deleteSelection() {
  const state = useEditorStore.getState()
  const selection = state.selection
  if (!selection) return
  if (selection.kind === 'part') {
    const ids = topSelected()
    const blocked = ids.filter((id) => state.def.parts.find((part) => part.id === id)?.locked)
    const targets = ids.filter((id) => !blocked.includes(id))
    if (!targets.length) { flash('Peça bloqueada: desbloqueie-a (L) para a eliminar.'); return }
    state.edit((current) => removeParts(current, targets))
    flash(blocked.length ? `${blocked.length} peça(s) bloqueada(s) não foram eliminadas.` : targets.length > 1 ? `${targets.length} peças eliminadas (Ctrl+Z desfaz).` : 'Peça eliminada (Ctrl+Z desfaz).')
  } else if (selection.kind === 'terminal') {
    state.edit((current) => ({ ...current, terminals: current.terminals.filter((item) => item.id !== selection.id) }))
    state.set({ testWires: state.testWires.filter((wire) => wire.a !== selection.id && wire.b !== selection.id) })
  } else if (selection.kind === 'control') state.edit((current) => ({ ...current, controls: (current.controls ?? []).filter((item) => item.id !== selection.id) }))
  else if (selection.kind === 'display') state.edit((current) => ({ ...current, displays: (current.displays ?? []).filter((item) => item.id !== selection.id) }))
  else state.edit((current) => ({ ...current, lights: current.lights.filter((item) => item.id !== selection.id) }))
  state.select(null)
}

export function selectAllParts() {
  const state = useEditorStore.getState()
  state.selectParts(state.def.parts.map((part) => part.id))
  flash(`${state.def.parts.length} peça(s) selecionada(s).`)
}

/** Setas / PgUp / PgDn: desloca a seleção (peças ou borne) em mm. */
export function nudgeSelection(dx: number, dy: number, dz: number) {
  const state = useEditorStore.getState()
  const r = (value: number) => Math.round(value * 100) / 100
  if (state.selection?.kind === 'terminal') {
    const id = state.selection.id
    state.edit((def) => { const t = def.terminals.find((item) => item.id === id); return t ? patchTerminal(def, id, { position: [r(t.position[0] + dx), r(t.position[1] + dy), r(t.position[2] + dz)] as Vec3 }) : def }, 'nudge')
    return
  }
  const ids = topSelected()
  if (!ids.length) return
  state.edit((def) => ids.reduce((acc, id) => {
    const part = acc.parts.find((item) => item.id === id)
    if (!part || part.locked) return acc
    const position = posedPart(part, acc.states.find((item) => item.id === state.editState)?.parts[id]).position
    return posePart(acc, state.editState, id, { position: [r(position[0] + dx), r(position[1] + dy), r(position[2] + dz)] as Vec3 })
  }, def), 'nudge')
}

export function toggleSelectionVisible(all = false) {
  const state = useEditorStore.getState()
  if (all) { state.edit((def) => ({ ...def, parts: def.parts.map((part) => (part.visible ? part : { ...part, visible: true })) })); flash('Todas as peças visíveis.'); return }
  const ids = selectedPartIds(state)
  if (!ids.length) return
  const hide = ids.some((id) => state.def.parts.find((part) => part.id === id)?.visible)
  state.edit((def) => ids.reduce((acc, id) => patchPart(acc, id, { visible: !hide }), def))
}

export function toggleSelectionLocked() {
  const state = useEditorStore.getState()
  const ids = selectedPartIds(state)
  if (!ids.length) return
  const lock = ids.some((id) => !state.def.parts.find((part) => part.id === id)?.locked)
  state.edit((def) => ids.reduce((acc, id) => patchPart(acc, id, { locked: lock }), def))
  flash(lock ? 'Peça(s) bloqueada(s).' : 'Peça(s) desbloqueada(s).')
}

/** Desloca as peças de topo e os bornes por (dx, dy, dz) — os bornes acompanham o modelo. */
function shiftModel(dx: number, dy: number, dz: number) {
  const r = (value: number) => Math.round(value * 100) / 100
  useEditorStore.getState().edit((def) => {
    let next = def
    def.parts.filter((part) => part.parentId === null).forEach((part) => { next = patchPart(next, part.id, { position: [r(part.position[0] + dx), r(part.position[1] + dy), r(part.position[2] + dz)] as Vec3 }) })
    return { ...next, terminals: next.terminals.map((terminal) => ({ ...terminal, position: [r(terminal.position[0] + dx), r(terminal.position[1] + dy), r(terminal.position[2] + dz)] as Vec3 })) }
  })
}

/** Pousa o modelo no chão: leva a base da caixa envolvente a Y = 0 (move só as peças de topo). */
export function dropToFloor() {
  const state = useEditorStore.getState()
  const box = boundsMm(state.def, glbCache)
  if (box.isEmpty()) return
  const offset = -box.min.y
  if (Math.abs(offset) < 0.01) { flash('O modelo já está no chão.'); return }
  shiftModel(0, offset, 0)
  flash(`Modelo pousado no chão (${offset > 0 ? '+' : ''}${Math.round(offset * 10) / 10} mm).`)
}

/** Centra o modelo em X/Z (a base mantém-se onde está). */
export function centerOnOrigin() {
  const state = useEditorStore.getState()
  const box = boundsMm(state.def, glbCache)
  if (box.isEmpty()) return
  const dx = -(box.min.x + box.max.x) / 2, dz = -(box.min.z + box.max.z) / 2
  if (Math.abs(dx) < 0.01 && Math.abs(dz) < 0.01) { flash('O modelo já está centrado.'); return }
  shiftModel(dx, 0, dz)
  flash('Modelo centrado na origem.')
}
