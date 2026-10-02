import { boundsMm, defaultPart, glbNodeList, loadGlbAssets, newId } from '../../catalog/definition'
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
  const state = useEditorStore.getState()
  const ids = state.selectedParts()
  if (!ids.length) return
  // Seleção múltipla: duplica todas as peças e deixa as cópias selecionadas.
  let def = state.def
  const copies: string[] = []
  for (const id of ids) {
    const result = duplicatePart(def, id)
    if (!result) continue
    def = result.def
    copies.push(result.id)
  }
  if (!copies.length) return
  state.edit(() => def)
  state.set({ selection: { kind: 'part', id: copies[0] }, multi: copies.slice(1), tab: 'object' })
}

/** Ctrl+G: cria um grupo pai à volta de todas as peças selecionadas. */
export function groupSelection() {
  const state = useEditorStore.getState()
  const ids = state.selectedParts()
  if (!ids.length) return
  const parts = state.def.parts.filter((item) => ids.includes(item.id))
  const first = parts[0]
  if (!first) return
  // O grupo nasce na posição da primeira peça; as outras mantêm-se onde estão.
  const origin = [...first.position] as Vec3
  const group = { ...defaultPart('group', null, 'Grupo'), parentId: first.parentId, position: origin }
  state.edit((current) => ({
    ...current,
    parts: [...current.parts.map((item) => (ids.includes(item.id)
      ? { ...item, parentId: group.id, position: [item.position[0] - origin[0], item.position[1] - origin[1], item.position[2] - origin[2]] as Vec3 }
      : item)), group],
  }))
  state.set({ selection: { kind: 'part', id: group.id }, multi: [] })
  flash(ids.length > 1 ? `${ids.length} peças agrupadas.` : 'Peça agrupada.')
}

/** Ctrl+Shift+G: desfaz o grupo e devolve as peças ao nível de cima. */
export function ungroupSelection() {
  const state = useEditorStore.getState()
  const ids = state.selectedParts()
  const groups = state.def.parts.filter((item) => ids.includes(item.id) && item.kind === 'group')
  if (!groups.length) { flash('Selecione um grupo para desagrupar.'); return }
  const freed: string[] = []
  state.edit((current) => {
    let next = current
    for (const group of groups) {
      const children = next.parts.filter((item) => item.parentId === group.id)
      next = {
        ...next,
        parts: next.parts
          .filter((item) => item.id !== group.id)
          .map((item) => (item.parentId === group.id
            ? { ...item, parentId: group.parentId, position: [item.position[0] + group.position[0], item.position[1] + group.position[1], item.position[2] + group.position[2]] as Vec3 }
            : item)),
      }
      freed.push(...children.map((item) => item.id))
    }
    return next
  })
  state.set({ selection: freed.length ? { kind: 'part', id: freed[0] } : null, multi: freed.slice(1) })
  flash(groups.length > 1 ? `${groups.length} grupos desfeitos.` : 'Grupo desfeito.')
}

export function deleteSelection() {
  const state = useEditorStore.getState()
  const selection = state.selection
  if (!selection) return
  if (selection.kind === 'part') { const ids = state.selectedParts(); state.edit((current) => removeParts(current, ids)) }
  else if (selection.kind === 'terminal') state.edit((current) => ({ ...current, terminals: current.terminals.filter((item) => item.id !== selection.id) }))
  else state.edit((current) => ({ ...current, lights: current.lights.filter((item) => item.id !== selection.id) }))
  state.set({ selection: null, multi: [] })
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
  const partIds = state.selectedParts()
  state.edit((def) => {
    if (selection.kind === 'part') {
      let next = def
      for (const id of partIds) {
        const part = next.parts.find((item) => item.id === id)
        if (part) next = patchPart(next, part.id, { position: moved(part.position) })
      }
      return next
    }
    if (selection.kind === 'terminal') return { ...def, terminals: def.terminals.map((item) => (item.id === selection.id ? { ...item, position: moved(item.position) } : item)) }
    // As zonas de luz acompanham a peça a que pertencem: não têm posição própria.
    return def
  })
}

/**
 * Separa um modelo GLB nas suas partes: cada malha do ficheiro passa a ser um
 * objeto próprio na lista «Objetos», podendo ser selecionada, movida, rodada,
 * escondida, pintada ou usada como manípulo de um botão/seletor.
 * A peça original mantém-se como grupo, por isso o conjunto não se desloca.
 */
export function explodeGlbPart() {
  const state = useEditorStore.getState()
  const part = selectedPart()
  if (!part || part.kind !== 'glb' || !part.asset) { flash('Selecione primeiro a peça do modelo GLB.'); return }
  const source = glbCache.get(part.asset)
  const items = source ? glbNodeList(source) : []
  if (!items.length) { flash('O modelo ainda está a carregar.'); return }
  if (items.length === 1) { flash('Este modelo tem uma única malha: não há partes para separar.'); return }
  const asset = part.asset
  const children = items.map((item) => ({ ...defaultPart('glb', part.materialId, item.name), parentId: part.id, asset, glbNode: item.key }))
  state.edit((def) => ({ ...def, parts: [...def.parts.map((item) => (item.id === part.id ? { ...item, kind: 'group' as const } : item)), ...children] }))
  flash(`Modelo separado em ${items.length} partes.`)
}

/** Volta a juntar as partes separadas num único modelo GLB. */
export function mergeGlbParts() {
  const state = useEditorStore.getState()
  const selection = state.selection
  const part = selection?.kind === 'part' ? state.def.parts.find((item) => item.id === selection.id) : undefined
  if (!part?.asset) return
  const pieces = state.def.parts.filter((item) => item.parentId === part.id && item.glbNode)
  if (!pieces.length) return
  state.edit((def) => ({ ...def, parts: def.parts.filter((item) => !pieces.some((piece) => piece.id === item.id)).map((item) => (item.id === part.id ? { ...item, kind: 'glb' as const } : item)) }))
  flash('Partes reunidas no modelo original.')
}

/** Partes separadas de uma peça (para a interface saber que botão mostrar). */
export const explodedPiecesOf = (partId: string) =>
  useEditorStore.getState().def.parts.filter((item) => item.parentId === partId && item.glbNode).length
