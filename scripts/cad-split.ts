import * as THREE from 'three'
import { buildDefinitionObject, defaultDefinition, defaultPart, boundsMm } from '../src/catalog/definition'
import { splitPart, canSplit } from '../src/admin/editor3d/cadImport'
import { removeParts } from '../src/admin/editor3d/editorStore'

let failed = 0
const ok = (cond: boolean, name: string) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}`); if (!cond) failed += 1 }

// modelo CAD sintético: cena → montagem → 3 peças (uma com sub-peça)
const mk = (name: string, x: number, y = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshStandardMaterial()); m.name = name; m.position.set(x, y, 0); return m }
const scene = new THREE.Group(); const assembly = new THREE.Group(); assembly.name = 'Montagem'; assembly.position.set(5, 0, 0)
const a = mk('A', -20), b = mk('B', 0), c = mk('C', 20); const c2 = mk('C2', 0, 15); c.add(c2)
assembly.add(a, b, c); scene.add(assembly)
const holder = new THREE.Group(); scene.scale.setScalar(2); holder.add(scene)
const cache = new Map([['asset1', holder]])

const def = defaultDefinition()
const part = { ...defaultPart('glb', null, 'CAD'), asset: 'asset1', position: [10, 5, 0] as [number, number, number], scale: [1.5, 1.5, 1.5] as [number, number, number] }
def.parts = [part]; def.assets = { asset1: { name: 'x.glb', mime: 'model/gltf-binary', data: '' } }

const worldBox = (d: typeof def, id?: string) => { const root = buildDefinitionObject(d, cache); root.updateMatrixWorld(true); return new THREE.Box3().setFromObject(id ? root.getObjectByName(id)! : root, true) }
const before = worldBox(def)
ok(canSplit(def, cache, part.id), 'modelo com várias partes pode ser dividido')
const res = splitPart(def, cache, part.id)
if ('error' in res) throw new Error(res.error)
ok(res.ids.length === 3, `dividido em 3 peças (A, B, C): ${res.ids.length}`)
const after = worldBox(res.def)
ok(before.min.distanceTo(after.min) < 1e-3 && before.max.distanceTo(after.max) < 1e-3, 'a caixa envolvente mantém-se depois de dividir')
const ca = worldBox(res.def, res.def.parts.find((p) => p.name === 'A')!.id)
ok(Math.abs(ca.getSize(new THREE.Vector3()).x - 10 * 2 * 1.5) < 1e-3, 'peça A tem o tamanho certo (10 × escala 2 × 1,5)')
// mover uma peça não mexe nas outras
const moved = { ...res.def, parts: res.def.parts.map((p) => (p.name === 'B' ? { ...p, position: [p.position[0] + 50, p.position[1], p.position[2]] as [number, number, number] } : p)) }
const bId = moved.parts.find((p) => p.name === 'B')!.id
ok(Math.abs(worldBox(moved, bId).min.x - worldBox(res.def, bId).min.x - 50 * 1.5) < 1e-3, 'mover B desloca só B (50 mm × escala do grupo)')
// divisão recursiva da peça C (malha com sub-peça C2)
const cId = res.def.parts.find((p) => p.name === 'C')!.id
ok(canSplit(res.def, cache, cId), 'peça C pode ser dividida de novo')
const res2 = splitPart(res.def, cache, cId)
if ('error' in res2) throw new Error(res2.error)
ok(res2.ids.length === 2 && res2.def.parts.some((p) => p.ownOnly), 'C → corpo + C2')
const after2 = worldBox(res2.def)
ok(before.min.distanceTo(after2.min) < 1e-3 && before.max.distanceTo(after2.max) < 1e-3, 'a caixa envolvente mantém-se depois da 2.ª divisão (pivôs corretos)')
const c2box = worldBox(res2.def, res2.def.parts.find((p) => p.name === 'C2')!.id)
ok(Math.abs(c2box.getSize(new THREE.Vector3()).y - 10 * 2 * 1.5) < 1e-3, 'C2 isolada tem só a sua malha')
// eliminar peças limpa o asset quando já ninguém o usa
const gone = removeParts(res.def, [res.def.parts.find((p) => p.kind === 'group')!.id])
ok(Object.keys(gone.assets).length === 0 && gone.parts.length === 0, 'eliminar o grupo remove o modelo importado (asset órfão)')
const partial = removeParts(res.def, [res.ids[0]])
ok(Object.keys(partial.assets).length === 1 && partial.parts.length === 3, 'eliminar uma sub-peça mantém o asset partilhado')
void boundsMm
if (failed) { console.log(`\n❌ ${failed} falha(s)`); process.exit(1) }
console.log('\n✅ divisão CAD OK')
