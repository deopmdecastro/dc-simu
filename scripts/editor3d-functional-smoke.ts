import './node-env'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import * as THREE from 'three'
import { DEFAULT_META, boundsMm, buildDefinitionObject, defaultDefinition, defaultPart, loadGlbAssets, runtimeSpec } from '../src/catalog/definition'
import { buildBuiltinDraft, upgradeBuiltinDraft } from '../src/admin/editor3d/builtinComponents'
import { REAL_TERMINALS } from '../src/electrical/realInterfaces'
import { createComponent, TEMPLATES } from '../src/electrical/factory'
import { registerCatalogVersion } from '../src/catalog/registry'
import { terminalMarkerRadius, terminalNormalWorld3D } from '../src/three/terminal3D'
import { getComponentModelSpec } from '../src/three/modelPaths'
import { editorTerminalRadiusMm } from '../src/catalog/terminalGeometry'
import { partWorldMatrix, reparentPartPreservingWorld } from '../src/admin/editor3d/partTransforms'
import { groupSelection, ungroupSelection } from '../src/admin/editor3d/partActions'
import { BASE_STATE, useEditorStore } from '../src/admin/editor3d/editorStore'
import { editorSelectionBounds } from '../src/admin/editor3d/viewportSelection'
import type { CatalogEntry, CatalogVersion, ComponentDefinition, PartDef, Vec3 } from '../src/catalog/types'
import type { ComponentType } from '../src/types'

let checks = 0
const check = (message: string, test: () => void) => { test(); checks++; console.log('PASS — ' + message) }
const sameMatrix = (a: THREE.Matrix4, b: THREE.Matrix4) => assert.ok(a.elements.every((n, i) => Math.abs(n - b.elements[i]) < 1e-6))
const makePart = (id: string, kind: PartDef['kind'] = 'box'): PartDef => ({ ...defaultPart(kind, null, id), id })
const a = { ...makePart('a', 'group'), position: [30, 4, -20] as Vec3, rotation: [0, 35, 20] as Vec3, scale: [2, 2, 2] as Vec3 }
const b = { ...makePart('b', 'group'), position: [-40, 15, 30] as Vec3, rotation: [10, -25, 0] as Vec3 }
const c = { ...makePart('c'), parentId: 'a', position: [5, 12, -8] as Vec3, rotation: [20, 15, 45] as Vec3 }
const def = { ...defaultDefinition(), parts: [a, b, c] }
def.states[1].parts = { a: { position: [33, 6, 1], rotation: [0, 50, 0] }, c: { position: [9, 7, 2] } }
const moved = reparentPartPreservingWorld(def, 'c', 'b')
check('Reparent mantém posição, rotação e escala mundiais na base e nos estados', () => {
  assert.equal(moved.error, undefined)
  for (const state of [undefined, ...def.states.map((state) => state.id)]) sameMatrix(partWorldMatrix(def, 'c', state), partWorldMatrix(moved.def, 'c', state))
})
check('Reparent recusa ciclos e antepassados bloqueados sem alterar a definição', () => {
  assert.equal(reparentPartPreservingWorld(def, 'a', 'c').def, def)
  const locked = { ...def, parts: [{ ...a, locked: true }, b, c] }
  assert.ok(reparentPartPreservingWorld(locked, 'c', 'b').error)
  assert.equal(reparentPartPreservingWorld(locked, 'c', 'b').def, locked)
})
check('Escala nula ou shear incompatível são recusados sem saltos', () => {
  const invalid = { ...def, parts: [a, { ...b, scale: [0, 1, 1] as Vec3 }, c] }
  assert.ok(reparentPartPreservingWorld(invalid, 'c', 'b').error)
  const shear = { ...def, parts: [a, { ...b, scale: [3, 1, 1] as Vec3 }, c] }
  assert.ok(reparentPartPreservingWorld(shear, 'c', 'b').error)
})

const previousWindow = globalThis.window
globalThis.window = { dispatchEvent: () => true } as never
try {
  const d = { ...makePart('d'), parentId: 'b', position: [15, 4, 6] as Vec3 }
  const multiple = { ...def, parts: [...def.parts, d] }
  useEditorStore.setState({ def: multiple, meta: DEFAULT_META, selection: { kind: 'part', id: 'c' }, multi: ['d'], past: [], future: [], editState: BASE_STATE })
  groupSelection()
  const grouped = useEditorStore.getState().def
  check('Agrupar peças de pais diferentes conserva todas as poses e cria um só histórico', () => {
    for (const id of ['c','d']) for (const state of [undefined, ...def.states.map((state) => state.id)]) sameMatrix(partWorldMatrix(multiple, id, state), partWorldMatrix(grouped, id, state))
    assert.equal(useEditorStore.getState().past.length, 1)
  })
  ungroupSelection()
  check('Desagrupar e desfazer preservam as transformações e a seleção', () => {
    for (const id of ['c','d']) for (const state of [undefined, ...def.states.map((state) => state.id)]) sameMatrix(partWorldMatrix(multiple, id, state), partWorldMatrix(useEditorStore.getState().def, id, state))
    useEditorStore.getState().undo()
    assert.equal(useEditorStore.getState().def, grouped)
    useEditorStore.getState().undo()
    assert.equal(useEditorStore.getState().def, multiple)
  })
} finally { globalThis.window = previousWindow }

const focusDef = { ...defaultDefinition(), parts: [{ ...makePart('left'), position: [-200, 20, 0] as Vec3 }, { ...makePart('right'), position: [300, 20, 0] as Vec3 }] }
const focusRoot = buildDefinitionObject(focusDef)
check('Enquadramento inclui todas as peças da multisseleção', () => {
  const box = editorSelectionBounds(focusDef, focusRoot, { kind: 'part', id: 'left' }, ['right'], null, [])
  assert.ok(box.min.x <= -220 && box.max.x >= 320)
})

const originalFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (url.startsWith('/models/')) return new Response(await fs.readFile(path.join('public', decodeURIComponent(url))))
  if (url.startsWith('blob:') || url.startsWith('data:')) return originalFetch(input, init)
  throw new Error('Rede externa proibida neste teste: ' + url)
}
try {
  let terminals = 0
  for (const type of Object.keys(REAL_TERMINALS) as ComponentType[]) {
    const { def: draft, meta, usedModel } = await buildBuiltinDraft(type)
    const cache = new Map<string, THREE.Object3D>()
    await loadGlbAssets(draft, cache)
    const root = buildDefinitionObject(draft, cache), spec = getComponentModelSpec(type)!
    const size = new THREE.Box3().setFromObject(root.getObjectByName(draft.parts[0].id)!, true).getSize(new THREE.Vector3())
    const box = boundsMm(draft, cache), volume = box.getSize(new THREE.Vector3())
    const runtime = runtimeSpec(draft, box)
    // Registo apenas em memória: não chama API, não grava nem publica o catálogo.
    const version: CatalogVersion = { version: 1, publishedAt: '2026-10-26T00:00:00Z', note: 'Fixture sintética', changes: [], definition: draft, runtime }
    const entry: CatalogEntry = { id: 'synthetic-' + type, meta, status: 'draft', latestVersion: 0, archived: false, updatedAt: version.publishedAt, versions: [] }
    const catalogComponent = createComponent(registerCatalogVersion(entry, version))
    catalogComponent.viewOrientation = { x: 0, y: 0, z: 0 }
    check(type + ': editor importa o volume físico e conserva os pontos dos furos', () => {
      assert.ok(usedModel)
      assert.ok(Math.abs(size.x - spec.physicalSizeMm.width) < .001 && Math.abs(size.y - spec.physicalSizeMm.height) < .001 && Math.abs(size.z - spec.physicalSizeMm.depth) < .001)
      for (const terminal of draft.terminals) {
        const p = TEMPLATES[type].terminals.find((item) => item.label === terminal.label)!.position3D!
        assert.ok(new THREE.Vector3(...terminal.position).distanceTo(new THREE.Vector3((p.x-.5)*size.x,p.y*size.y,(p.z-.5)*size.z)) < .001)
        const spot = REAL_TERMINALS[type]!.find((spot) => spot.label === terminal.label)!
        // Pinos e pontas de fio (`contact` ≠ socket) não têm cavidade onde o marcador tenha de caber.
        const socketRoom = Math.min(spot.diameterMm! * .5, terminal.socketInsetMm!, terminal.socketDepthMm! - terminal.socketInsetMm!)
        if (!spot.contact || spot.contact === 'socket') assert.ok(editorTerminalRadiusMm(terminal) * 1.32 < socketRoom, `${type}.${terminal.label}: marcador maior do que o encaixe`)
        const exported = runtime.terminals.find((item) => item.id === terminal.id)!
        const q = exported.position3D
        assert.ok(new THREE.Vector3(...terminal.position).distanceTo(new THREE.Vector3(box.min.x + q.x * volume.x, box.min.y + q.y * volume.y, box.min.z + q.z * volume.z)) < .001, 'Exportação conserva a posição dentro do furo')
        const instance = catalogComponent.terminals.find((item) => item.defId === terminal.id)!
        assert.deepEqual(instance.position3D, q)
        assert.equal(terminalMarkerRadius(catalogComponent, instance), editorTerminalRadiusMm(terminal) * .01)
        assert.ok(terminalNormalWorld3D(catalogComponent, instance).distanceTo(new THREE.Vector3(...terminal.normal).normalize()) < 1e-6, 'Catálogo conserva a normal real de saída do cabo')
        terminals++
      }
    })
  }
  assert.equal(terminals, Object.values(REAL_TERMINALS).reduce((sum, spots) => sum + (spots?.length ?? 0), 0), 'Todos os bornes medidos passam pelo editor')
  const fresh = (await buildBuiltinDraft('terminalPhoenixPti6')).def
  const assetId = fresh.parts[0].asset!, old = structuredClone(fresh)
  delete old.assets[assetId].builtinType
  const cache = new Map<string, THREE.Object3D>()
  await loadGlbAssets(old, cache)
  old.parts[0].rotation = [90,0,0]
  const k = 66.02 / boundsMm(old, cache).getSize(new THREE.Vector3()).y
  old.parts[0].scale = [k,k,k]
  const box = boundsMm(old, cache), center = box.getCenter(new THREE.Vector3())
  old.parts[0].position = [-center.x,-box.min.y,-center.z]
  const oldBox = boundsMm(old, cache), oldSize = oldBox.getSize(new THREE.Vector3())
  old.terminals = old.terminals.map((terminal) => {
    const p = TEMPLATES.terminalPhoenixPti6.terminals.find((item) => item.label === terminal.label)!.position3D!
    return { ...terminal, position: [oldBox.min.x+p.x*oldSize.x,oldBox.max.y-p.y*oldSize.y,oldBox.max.z] as Vec3,normal: [0,0,1] as Vec3 }
  })
  const updated = await upgradeBuiltinDraft('terminalPhoenixPti6', old)
  check('Importação antiga intacta é corrigida sem mudar os IDs dos bornes', () => {
    assert.ok(updated)
    old.terminals.forEach((terminal, index) => { assert.equal(updated!.terminals[index].id, terminal.id); assert.deepEqual(updated!.terminals[index].position, fresh.terminals[index].position) })
  })
  const manual = structuredClone(old); manual.terminals[0].position[0] += 1
  const manualUpgrade = await upgradeBuiltinDraft('terminalPhoenixPti6', manual)
  check('Rascunho ajustado manualmente não é substituído pela atualização', () => assert.equal(manualUpgrade, null))
  const repeatedUpgrade = await upgradeBuiltinDraft('terminalPhoenixPti6', updated!)
  check('Atualização do rascunho é idempotente', () => assert.equal(repeatedUpgrade, null))
} finally { globalThis.fetch = originalFetch }
console.log(`PASS — ${checks} verificações funcionais; 25 modelos e 162 bornes importados sem rede externa`)
