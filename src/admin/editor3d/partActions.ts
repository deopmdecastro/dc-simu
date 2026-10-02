import { boundsMm, defaultPart, loadGlbAssets, newId } from '../../catalog/definition'
import type { PartDef, Vec3 } from '../../catalog/types'
import { addPart, duplicatePart, glbCache, patchPart, removeParts, useEditorStore } from './editorStore'

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

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file) })
}

/** Importa um .glb como peça. Devolve uma mensagem de erro (ou '' se correu bem). */
export async function importGlbAction(file: File | undefined): Promise<string> {
  if (!file) return ''
  if (!/\.glb$/i.test(file.name)) return 'Use um ficheiro .glb (binário).'
  if (file.size > MAX_GLB_BYTES) return 'O modelo excede 4 MB. Simplifique a malha antes de importar.'
  try {
    const state = useEditorStore.getState()
    const data = await readDataUrl(file)
    const assetId = newId('a_')
    const part: PartDef = { ...defaultPart('glb', null, file.name.replace(/\.glb$/i, '')), asset: assetId }
    const next = { ...state.def, assets: { ...state.def.assets, [assetId]: { name: file.name, mime: 'model/gltf-binary', data } }, parts: [...state.def.parts, part] }
    await loadGlbAssets(next, glbCache)
    if (!glbCache.has(assetId)) return 'Não foi possível interpretar este GLB (ficheiro inválido ou com compressão não suportada). Exporte-o novamente como .glb simples.'
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
    state.set({ selection: { kind: 'part', id: part.id }, tab: 'object' })
    state.cameraTo('fit')
    return ''
  } catch { return 'Não foi possível ler o modelo GLB.' }
}

export function duplicateSelection() {
  const part = selectedPart()
  if (!part) return
  const state = useEditorStore.getState()
  const result = duplicatePart(state.def, part.id)
  if (!result) return
  state.edit(() => result.def)
  state.set({ selection: { kind: 'part', id: result.id }, tab: 'object' })
}

export function groupSelection() {
  const part = selectedPart()
  if (!part) return
  const state = useEditorStore.getState()
  const group = { ...defaultPart('group', null, 'Grupo'), parentId: part.parentId, position: [...part.position] as Vec3 }
  state.edit((current) => ({ ...current, parts: [...current.parts.map((item) => (item.id === part.id ? { ...item, parentId: group.id, position: [0, 0, 0] as Vec3 } : item)), group] }))
  state.set({ selection: { kind: 'part', id: group.id } })
}

export function deleteSelection() {
  const state = useEditorStore.getState()
  const selection = state.selection
  if (!selection) return
  if (selection.kind === 'part') state.edit((current) => removeParts(current, [selection.id]))
  else if (selection.kind === 'terminal') state.edit((current) => ({ ...current, terminals: current.terminals.filter((item) => item.id !== selection.id) }))
  else state.edit((current) => ({ ...current, lights: current.lights.filter((item) => item.id !== selection.id) }))
  state.set({ selection: null })
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

/**
 * Move a seleção com as setas do teclado: peças, bornes e luzes deslocam-se
 * em passos de 1 mm (10 mm com Shift) no plano X/Z, ou em Y com Alt.
 */
export function nudgeSelection(dx: number, dy: number, dz: number) {
  const state = useEditorStore.getState()
  const selection = state.selection
  if (!selection) return
  const r = (value: number) => Math.round(value * 100) / 100
  const moved = (position: Vec3): Vec3 => [r(position[0] + dx), r(position[1] + dy), r(position[2] + dz)]
  state.edit((def) => {
    if (selection.kind === 'part') {
      const part = def.parts.find((item) => item.id === selection.id)
      return part ? patchPart(def, part.id, { position: moved(part.position) }) : def
    }
    if (selection.kind === 'terminal') return { ...def, terminals: def.terminals.map((item) => (item.id === selection.id ? { ...item, position: moved(item.position) } : item)) }
    // As zonas de luz acompanham a peça a que pertencem: não têm posição própria.
    return def
  })
}
