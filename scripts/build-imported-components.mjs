/** Conversão offline dos STEP fornecidos. Usa o mesmo OCCT/WASM do editor 3D.
 * node scripts/build-imported-components.mjs <pasta-preparada> [tipo]
 * A orientação é explícita no ficheiro de configuração; sem escala não uniforme.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import occtImportJs from '@sunbox/occt-import-js'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(value => { this.result = value; this.onloadend?.() }).catch(error => this.onerror?.(error)) }
}

const sourceRoot = path.resolve(process.argv[2] ?? '')
if (!process.argv[2]) throw new Error('Indique a pasta preparada com prepare-component-cad.py')
const config = JSON.parse(await fs.readFile(new URL('./imported-components.config.json', import.meta.url), 'utf8'))
const sources = JSON.parse(await fs.readFile(path.join(sourceRoot, 'sources.json'), 'utf8'))
const wasmBinary = await fs.readFile(new URL('./occt-import-js.wasm', import.meta.resolve('@sunbox/occt-import-js')))
const occt = await occtImportJs({ wasmBinary })
const output = path.resolve('public/models/importados')
await fs.mkdir(output, { recursive: true })
const report = []
for (const item of config) {
  if (process.argv[3] && item.type !== process.argv[3]) continue
  const input = path.join(sourceRoot, item.type, 'source.step')
  let bytes
  try { bytes = await fs.readFile(input) } catch { console.log(`${item.type}: sem STEP, preservado como pendência`); continue }
  console.log(`${item.type}: a converter ${Math.round(bytes.length / 1024)} KiB`)
  const result = occt.ReadStepFile(bytes, { linearUnit: 'millimeter', linearDeflectionType: 'absolute_value', linearDeflection: 0.15, angularDeflection: 0.4 })
  if (!result.success || !result.meshes?.length) throw new Error(`${item.type}: STEP sem geometria válida`)
  const group = new THREE.Group()
  let triangles = 0
  result.meshes.forEach((mesh, index) => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.attributes.position.array, 3))
    if (mesh.attributes.normal) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.attributes.normal.array, 3))
    geometry.setIndex(new THREE.Uint32BufferAttribute(mesh.index.array, 1))
    if (!mesh.attributes.normal) geometry.computeVertexNormals()
    const color = mesh.color ?? item.fallbackColor ?? [.72, .73, .74]
    const material = rgb => new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(...rgb, THREE.SRGBColorSpace), roughness: .55, metalness: 0 })
    const materials = [material(color)]
    const faceColors = new Map()
    // OCCT fornece intervalos de triângulos por face; preserva as cores CAD.
    const faces = mesh.brep_faces ?? []
    if (faces.some(face => face.color)) {
      let cursor = 0
      for (const face of faces) {
        if (face.first > cursor) geometry.addGroup(cursor * 3, (face.first - cursor) * 3, 0)
        const rgb = face.color ?? color
        const key = rgb.join(',')
        if (!faceColors.has(key)) { faceColors.set(key, materials.length); materials.push(material(rgb)) }
        geometry.addGroup(face.first * 3, (face.last - face.first + 1) * 3, faceColors.get(key))
        cursor = face.last + 1
      }
      if (cursor * 3 < mesh.index.array.length) geometry.addGroup(cursor * 3, mesh.index.array.length - cursor * 3, 0)
    }
    const object = new THREE.Mesh(geometry, materials.length > 1 ? materials : materials[0])
    object.name = `cad_${index}_${(mesh.name ?? 'peca').replace(/[^\w-]/g, '_').slice(0, 70)}`
    object.userData = { cadName: mesh.name ?? '', sourceType: item.type }
    group.add(object)
    triangles += mesh.index.array.length / 3
  })
  group.rotation.set(...item.rotation.map(value => value * Math.PI / 180))
  group.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(group, true)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  // Bake: topo +Y, frente +Z, origem ao centro em X e na base em Y/Z; metros.
  const rotation = new THREE.Matrix4().makeRotationFromEuler(group.rotation)
  for (const object of group.children) {
    object.geometry.applyMatrix4(rotation)
    object.geometry.translate(-center.x, -box.min.y, -box.min.z)
    object.geometry.scale(.001, .001, .001)
  }
  group.rotation.set(0, 0, 0)
  group.updateMatrixWorld(true)
  const scene = new THREE.Scene()
  scene.add(group)
  const glb = Buffer.from(await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: true }))
  const filename = `${item.type}.glb`
  await fs.writeFile(path.join(output, filename), glb)
  const source = sources.find(entry => entry.type === item.type)
  const row = { ...item, rotation: [0, 0, 0], sourceRotationDeg: item.rotation, path: `/models/importados/${filename}`, physicalSizeMm: { width: +size.x.toFixed(3), height: +size.y.toFixed(3), depth: +size.z.toFixed(3) }, source: { ...source, sourceSha256: createHash('sha256').update(bytes).digest('hex') }, meshes: result.meshes.length, triangles, bytes: glb.length, glbSha256: createHash('sha256').update(glb).digest('hex') }
  report.push(row)
  await fs.writeFile(path.join(sourceRoot, `${item.type}.json`), JSON.stringify(row, null, 2) + '\n')
  console.log(`${item.type}: ${size.toArray().map(x => x.toFixed(2)).join(' × ')} mm; ${triangles} triângulos; ${Math.round(glb.length / 1024)} KiB`)
  group.traverse(object => { if (object.isMesh) { object.geometry.dispose(); for (const mat of Array.isArray(object.material) ? object.material : [object.material]) mat.dispose() } })
}
const assembled = []
for (const item of config) {
  try { assembled.push(JSON.parse(await fs.readFile(path.join(sourceRoot, `${item.type}.json`), 'utf8'))) } catch { /* fonte ainda não convertida */ }
}
await fs.mkdir('src/data', { recursive: true })
await fs.writeFile('src/data/imported-component-models.json', JSON.stringify(assembled, null, 2) + '\n')
