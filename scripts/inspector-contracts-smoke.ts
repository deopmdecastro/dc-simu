import './node-env'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createComponent } from '../src/electrical/factory'
import { useSimStore } from '../src/store/useSimStore'
import { DEFAULT_META, defaultDefinition, runtimeSpec } from '../src/catalog/definition'
import { registerCatalogVersion } from '../src/catalog/registry'
import { catalogType, type CatalogEntry } from '../src/catalog/types'
import { updateCatalogComponent } from '../src/catalog/update'

let count = 0
const check = (ok: unknown, label: string) => { assert.ok(ok, label); count++; console.log('PASS — ' + label) }
const def = defaultDefinition()
def.terminals = [{ id: 'phase', label: 'L', name: 'Fase', position: [0, 20, 5], normal: [0, 0, 1], fn: 'L1', kind: 'power-in', contact: 'socket', diameterMm: 4, socketDepthMm: 5 }]
const next = structuredClone(def)
next.terminals[0].position[0] = 2
next.terminals[0].name = 'Fase revista'
const box = new THREE.Box3(new THREE.Vector3(-10, 0, -5), new THREE.Vector3(10, 40, 5))
const entry: CatalogEntry = { id: 'inspector-contract-fixture', meta: { ...DEFAULT_META, name: 'Componente de ensaio local' }, status: 'published', latestVersion: 2, archived: false, updatedAt: '2026-11-21', versions: [def, next].map((definition, i) => ({ version: i + 1, publishedAt: '2026-11-21', note: '', changes: [], definition, runtime: runtimeSpec(definition, box) })) }
entry.versions.forEach(v => registerCatalogVersion(entry, v))
const component = createComponent(catalogType(entry.id, 1), 'X1', 'Descrição de autoria', 0, 10, 20)
component.catalog = { id: entry.id, version: 1, source: 'official' }
component.terminals[0].displayName = 'Alimentação principal'
component.terminals[0].electricalClass = 'other'
component.terminals[0].electricalClassCustom = 'Alimentação identificada'
const terminalId = component.terminals[0].id
useSimStore.setState({ components: [component], wires: [], history: [], future: [], dirty: false, demoMode: false, selectedComponentIds: [] })
const result = updateCatalogComponent(component.id, [entry])
const updated = useSimStore.getState().components[0]
check(result.ok && updated.catalog?.version === 2, 'Catálogo: atualização real aplica a nova revisão')
check(updated.terminals[0].displayName === 'Alimentação principal', 'Catálogo: atualização conserva o nome documental editado no inspetor')
check(updated.terminals[0].id === terminalId && updated.terminals[0].label === 'L', 'Catálogo: código físico e identidade elétrica mantêm-se')
check(updated.label === component.label && updated.ref === component.ref && updated.schematicX === component.schematicX, 'Catálogo: identificação e posição de autoria conservadas')
check(updated.terminals[0].electricalClassCustom === 'Alimentação identificada', 'Catálogo: classificação elétrica personalizada conservada')
useSimStore.getState().undo()
check(useSimStore.getState().components[0].catalog?.version === 1 && useSimStore.getState().components[0].terminals[0].displayName === 'Alimentação principal', 'Catálogo: Desfazer conserva a identificação documental')
useSimStore.getState().redo()
check(useSimStore.getState().components[0].catalog?.version === 2 && useSimStore.getState().components[0].terminals[0].displayName === 'Alimentação principal', 'Catálogo: Refazer conserva o nome editado')
const json = useSimStore.getState().saveJSON()
useSimStore.getState().loadJSON(json)
check(useSimStore.getState().components[0].terminals[0].displayName === 'Alimentação principal', 'Catálogo: nome do borne persiste ao guardar/reabrir')
console.log('\nPASS — ' + count + ' inspector contract checks')
