/** Junta, em cada malha, as primitivas com o mesmo material e os mesmos atributos.
 * node scripts/compact-glb-primitives.mjs <ficheiro.glb>… [--check]
 *
 * O conversor STEP exportava um grupo por face BREP colorida: o GLTFExporter gera
 * uma primitiva por grupo e todas apontam para o mesmo buffer de posições. Ao
 * carregar, cada primitiva vira uma BufferGeometry própria, e tudo o que percorre
 * as posições (UV CAD, caixas envolventes) repete o buffer inteiro por primitiva —
 * o 3RU1116 tinha 10 806 primitivas sobre 190 mil vértices (≈ 672 M iterações),
 * o que congelava a biblioteca ao gerar a capa. A geometria não muda: só os índices
 * das primitivas equivalentes são concatenados e o BIN é reempacotado.
 */
import fs from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942
const COMPONENT_ARRAYS = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array }

export function parseGlb(bytes) {
  if (bytes.readUInt32LE(0) !== 0x46546c67) throw new Error('Não é um GLB')
  let offset = 12
  let json = null
  let bin = Buffer.alloc(0)
  while (offset < bytes.length) {
    const length = bytes.readUInt32LE(offset)
    const type = bytes.readUInt32LE(offset + 4)
    const data = bytes.subarray(offset + 8, offset + 8 + length)
    if (type === JSON_CHUNK) json = JSON.parse(data.toString('utf8'))
    else if (type === BIN_CHUNK) bin = data
    offset += 8 + length
  }
  if (!json) throw new Error('GLB sem JSON')
  return { json, bin }
}

const primitiveKey = (primitive) => JSON.stringify([primitive.material ?? null, primitive.mode ?? 4, primitive.attributes])

/** Primitivas redundantes: mesmo material, modo e atributos dentro da mesma malha. */
export function redundantPrimitives(json) {
  let redundant = 0
  for (const mesh of json.meshes ?? []) {
    const seen = new Set()
    for (const primitive of mesh.primitives) {
      const key = primitiveKey(primitive)
      if (seen.has(key)) redundant++
      seen.add(key)
    }
  }
  return redundant
}

function readIndices(json, bin, accessorIndex) {
  const accessor = json.accessors[accessorIndex]
  const view = json.bufferViews[accessor.bufferView]
  const Array_ = COMPONENT_ARRAYS[accessor.componentType]
  if (!Array_ || accessor.sparse || view.byteStride) throw new Error(`Índices não suportados no acessor ${accessorIndex}`)
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
  const copy = bin.subarray(start, start + accessor.count * Array_.BYTES_PER_ELEMENT)
  return new Array_(copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength))
}

function compact({ json, bin }) {
  if (json.skins?.length || json.animations?.length || (json.buffers?.length ?? 0) > 1) throw new Error('GLB com skins, animações ou vários buffers: não suportado')
  const extraViews = []
  for (const mesh of json.meshes ?? []) {
    const groups = new Map()
    const kept = []
    for (const primitive of mesh.primitives) {
      if (primitive.indices === undefined || primitive.targets || primitive.extensions) { kept.push(primitive); continue }
      const key = primitiveKey(primitive)
      const group = groups.get(key)
      if (group) { group.parts.push(primitive.indices); continue }
      groups.set(key, { primitive, parts: [primitive.indices] })
      kept.push(primitive)
    }
    for (const { primitive, parts } of groups.values()) {
      if (parts.length < 2) continue
      const arrays = parts.map((accessor) => readIndices(json, bin, accessor))
      const total = arrays.reduce((sum, array) => sum + array.length, 0)
      let max = 0
      for (const array of arrays) for (const value of array) if (value > max) max = value
      const merged = max < 65536 ? new Uint16Array(total) : new Uint32Array(total)
      let at = 0
      for (const array of arrays) { merged.set(array, at); at += array.length }
      extraViews.push(Buffer.from(merged.buffer))
      json.bufferViews.push({ buffer: 0, byteLength: merged.byteLength, target: 34963, __extra: extraViews.length - 1 })
      json.accessors.push({ bufferView: json.bufferViews.length - 1, componentType: merged instanceof Uint16Array ? 5123 : 5125, count: total, type: 'SCALAR' })
      primitive.indices = json.accessors.length - 1
    }
    mesh.primitives = kept
  }

  // Reempacota apenas os acessores e bufferViews ainda referenciados.
  const usedAccessors = new Set()
  for (const mesh of json.meshes ?? []) for (const primitive of mesh.primitives) {
    for (const accessor of Object.values(primitive.attributes)) usedAccessors.add(accessor)
    if (primitive.indices !== undefined) usedAccessors.add(primitive.indices)
    for (const target of primitive.targets ?? []) for (const accessor of Object.values(target)) usedAccessors.add(accessor)
  }
  const accessorMap = new Map()
  const accessors = []
  json.accessors.forEach((accessor, index) => { if (usedAccessors.has(index)) { accessorMap.set(index, accessors.length); accessors.push(accessor) } })
  const usedViews = new Set(accessors.map((accessor) => accessor.bufferView).filter((view) => view !== undefined))
  for (const image of json.images ?? []) if (image.bufferView !== undefined) usedViews.add(image.bufferView)
  const viewMap = new Map()
  const views = []
  const chunks = []
  let length = 0
  json.bufferViews.forEach((view, index) => {
    if (!usedViews.has(index)) return
    const data = view.__extra !== undefined ? extraViews[view.__extra] : bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)
    const padding = (4 - (length % 4)) % 4
    if (padding) { chunks.push(Buffer.alloc(padding)); length += padding }
    const { __extra, ...rest } = view
    viewMap.set(index, views.length)
    views.push({ ...rest, byteOffset: length })
    chunks.push(data)
    length += data.length
  })
  for (const accessor of accessors) if (accessor.bufferView !== undefined) accessor.bufferView = viewMap.get(accessor.bufferView)
  for (const image of json.images ?? []) if (image.bufferView !== undefined) image.bufferView = viewMap.get(image.bufferView)
  for (const mesh of json.meshes ?? []) for (const primitive of mesh.primitives) {
    for (const name of Object.keys(primitive.attributes)) primitive.attributes[name] = accessorMap.get(primitive.attributes[name])
    if (primitive.indices !== undefined) primitive.indices = accessorMap.get(primitive.indices)
    for (const target of primitive.targets ?? []) for (const name of Object.keys(target)) target[name] = accessorMap.get(target[name])
  }
  json.accessors = accessors
  json.bufferViews = views
  const newBin = Buffer.concat(chunks)
  json.buffers = [{ byteLength: newBin.length }]
  return { json, bin: newBin }
}

export function writeGlb({ json, bin }) {
  const pad = (buffer, fill) => { const extra = (4 - (buffer.length % 4)) % 4; return extra ? Buffer.concat([buffer, Buffer.alloc(extra, fill)]) : buffer }
  const jsonBytes = pad(Buffer.from(JSON.stringify(json), 'utf8'), 0x20)
  const binBytes = pad(bin, 0)
  const header = Buffer.alloc(12)
  header.writeUInt32LE(0x46546c67, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(12 + 8 + jsonBytes.length + 8 + binBytes.length, 8)
  const chunkHead = (size, type) => { const head = Buffer.alloc(8); head.writeUInt32LE(size, 0); head.writeUInt32LE(type, 4); return head }
  return Buffer.concat([header, chunkHead(jsonBytes.length, JSON_CHUNK), jsonBytes, chunkHead(binBytes.length, BIN_CHUNK), binBytes])
}

export function compactGlb(bytes) {
  return writeGlb(compact(parseGlb(bytes)))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const checkOnly = process.argv.includes('--check')
  const files = process.argv.slice(2).filter((arg) => arg !== '--check')
  if (!files.length) throw new Error('Indique um ou mais ficheiros GLB')
  let failures = 0
  for (const file of files) {
    const bytes = await fs.readFile(file)
    const { json } = parseGlb(bytes)
    const before = json.meshes?.reduce((sum, mesh) => sum + mesh.primitives.length, 0) ?? 0
    const redundant = redundantPrimitives(json)
    if (checkOnly) { if (redundant) { failures++; console.log(`${file}: ${redundant} primitivas redundantes`) } continue }
    if (!redundant) { console.log(`${file}: já compacto (${before} primitivas)`); continue }
    const output = compactGlb(bytes)
    await fs.writeFile(file, output)
    console.log(`${file}: ${before} → ${before - redundant} primitivas; ${Math.round(bytes.length / 1024)} → ${Math.round(output.length / 1024)} KiB`)
  }
  if (failures) process.exitCode = 1
}
