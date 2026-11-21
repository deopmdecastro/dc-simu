#!/usr/bin/env node
/**
 * Simplifica malhas densas de GLB CAD com o meshoptimizer, reescrevendo o binário diretamente
 * (materiais, texturas, nós, nomes e extras ficam intactos; só índices e vértices das malhas mudam).
 *
 *   node scripts/optimize-cad-glbs.mjs [--out DIR] [--ratio 0.3] [--error 0.0015] [--min 1500] ficheiro.glb...
 *
 * - Só primitivas de triângulos com ≥ `--min` triângulos são tocadas.
 * - `LockBorder`: as costuras do CAD (arestas vivas com normais separadas, contornos de furos e
 *   bornes) ficam fixas; reduz-se o interior das superfícies curvas (roscas, boleados, cilindros),
 *   que é onde estão quase todos os triângulos. O erro é relativo à dimensão da malha.
 * - Vértices que deixam de ser usados são removidos (atributos compactados); os acessores
 *   partilhados por mais de uma primitiva não são compactados.
 * - Sem `--out`, reescreve no lugar. Imprime triângulos e bytes antes/depois.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MeshoptSimplifier } from 'meshoptimizer'

/** Predefinições validadas visualmente (diferença média < 0,2/255 nas capturas do Panel3D). */
export const CAD_SIMPLIFY_DEFAULTS = { ratio: 0.3, error: 0.0015, min: 1500 }

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 }
const TYPED = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }

function parseGlb(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('não é GLB')
  let offset = 12, json = null, bin = null
  while (offset < buf.length) {
    const len = buf.readUInt32LE(offset), type = buf.readUInt32LE(offset + 4)
    const chunk = buf.subarray(offset + 8, offset + 8 + len)
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'))
    else if (type === 0x004e4942) bin = Buffer.from(chunk)
    offset += 8 + len
  }
  return { json, bin }
}

/** Lê um acessor para um array tipado compacto (respeita byteStride). */
function readAccessor(json, bin, index) {
  const acc = json.accessors[index]
  if (acc.sparse) throw new Error('acessor esparso não suportado')
  const Typed = TYPED[acc.componentType], n = COMPONENTS[acc.type], count = acc.count
  const out = new Typed(count * n)
  if (acc.bufferView === undefined) return out
  const view = json.bufferViews[acc.bufferView]
  const base = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0)
  const elem = Typed.BYTES_PER_ELEMENT * n, stride = view.byteStride ?? elem
  const src = new DataView(bin.buffer, bin.byteOffset, bin.byteLength)
  const get = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[acc.componentType]
  for (let i = 0; i < count; i++) for (let k = 0; k < n; k++) out[i * n + k] = src[get](base + i * stride + k * Typed.BYTES_PER_ELEMENT, true)
  return out
}

/** Simplifica um GLB em memória. Devolve o novo binário e os triângulos antes/depois. */
export async function optimizeGlbBuffer(input, options = {}) {
  await MeshoptSimplifier.ready
  const opt = { ...CAD_SIMPLIFY_DEFAULTS, ...options }
  const { json, bin } = parseGlb(input)
  // Conteúdo final dos acessores alterados (os restantes são relidos tal como estão).
  const replaced = new Map() // accessor index -> { data }
  const usage = new Map()
  for (const mesh of json.meshes ?? []) for (const prim of mesh.primitives) {
    for (const a of Object.values(prim.attributes)) usage.set(a, (usage.get(a) ?? 0) + 1)
    for (const t of prim.targets ?? []) for (const a of Object.values(t)) usage.set(a, (usage.get(a) ?? 0) + 99)
    if (prim.indices !== undefined) usage.set(prim.indices, (usage.get(prim.indices) ?? 0) + 1)
  }
  // Primitivas que partilham exatamente os mesmos atributos (o mesmo conjunto de vértices) tratam-se juntas.
  const groups = new Map()
  for (const mesh of json.meshes ?? []) for (const prim of mesh.primitives) {
    if ((prim.mode ?? 4) !== 4 || prim.attributes.POSITION === undefined) continue
    const key = JSON.stringify(Object.entries(prim.attributes).sort())
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(prim)
  }
  let trisBefore = 0, trisAfter = 0
  for (const prims of groups.values()) {
    const attrs = prims[0].attributes, posIndex = attrs.POSITION, posAcc = json.accessors[posIndex]
    const positions = posAcc.componentType === 5126 ? readAccessor(json, bin, posIndex) : null
    let changed = false
    const finalIndices = prims.map((prim) => {
      const indices = prim.indices !== undefined ? Uint32Array.from(readAccessor(json, bin, prim.indices)) : Uint32Array.from({ length: posAcc.count }, (_, i) => i)
      trisBefore += indices.length / 3
      if (!positions || indices.length / 3 < opt.min || prim.targets?.length) { trisAfter += indices.length / 3; return indices }
      const target = Math.max(3, Math.floor((indices.length * opt.ratio) / 3) * 3)
      const [simplified] = MeshoptSimplifier.simplify(indices, positions, 3, target, opt.error, ["LockBorder"])
      if (simplified.length >= indices.length * 0.95) { trisAfter += indices.length / 3; return indices }
      trisAfter += simplified.length / 3; changed = true
      return simplified
    })
    if (!changed) continue
    // Os atributos só podem ser compactados se nenhuma outra primitiva fora do grupo os usar.
    const compact = Object.values(attrs).every((a) => (usage.get(a) ?? 0) === prims.length)
    let remap = null, used = posAcc.count
    if (compact) {
      remap = new Int32Array(posAcc.count).fill(-1); used = 0
      for (const indices of finalIndices) for (const v of indices) if (remap[v] < 0) remap[v] = used++
      for (const [name, accIndex] of Object.entries(attrs)) {
        const acc = json.accessors[accIndex], n = COMPONENTS[acc.type]
        const data = readAccessor(json, bin, accIndex)
        const packed = new data.constructor(used * n)
        for (let v = 0; v < remap.length; v++) if (remap[v] >= 0) for (let k = 0; k < n; k++) packed[remap[v] * n + k] = data[v * n + k]
        acc.count = used
        if (name === "POSITION" || acc.min) {
          const min = Array(n).fill(Infinity), max = Array(n).fill(-Infinity)
          for (let i = 0; i < used; i++) for (let k = 0; k < n; k++) { const x = packed[i * n + k]; if (x < min[k]) min[k] = x; if (x > max[k]) max[k] = x }
          acc.min = min; acc.max = max
        }
        replaced.set(accIndex, { data: packed })
      }
    }
    const IndexType = used <= 65535 ? Uint16Array : Uint32Array
    prims.forEach((prim, p) => {
      const indices = remap ? Uint32Array.from(finalIndices[p], (v) => remap[v]) : finalIndices[p]
      // Índice próprio (novo acessor) para não alterar um índice partilhado com outra primitiva.
      json.accessors.push({ componentType: IndexType === Uint16Array ? 5123 : 5125, type: "SCALAR", count: indices.length })
      prim.indices = json.accessors.length - 1
      replaced.set(prim.indices, { data: IndexType.from(indices) })
    })
  }
  // Só se escrevem os acessores ainda referenciados (os índices antigos substituídos saem do ficheiro).
  const referenced = new Set()
  for (const mesh of json.meshes ?? []) for (const prim of mesh.primitives) {
    for (const a of Object.values(prim.attributes)) referenced.add(a)
    for (const t of prim.targets ?? []) for (const a of Object.values(t)) referenced.add(a)
    if (prim.indices !== undefined) referenced.add(prim.indices)
  }
  for (const anim of json.animations ?? []) for (const s of anim.samplers) { referenced.add(s.input); referenced.add(s.output) }
  for (const skin of json.skins ?? []) if (skin.inverseBindMatrices !== undefined) referenced.add(skin.inverseBindMatrices)
  const accessorRemap = new Map(), keptAccessors = [], keptReplaced = new Map()
  json.accessors.forEach((acc, i) => { if (!referenced.has(i)) return; accessorRemap.set(i, keptAccessors.length); if (replaced.has(i)) keptReplaced.set(keptAccessors.length, replaced.get(i)); keptAccessors.push(acc) })
  const oldAccessors = json.accessors
  const readOld = (newIndex) => { const old = [...accessorRemap].find(([, n]) => n === newIndex)[0]; json.accessors = oldAccessors; const data = readAccessor(json, bin, old); return data }
  for (const mesh of json.meshes ?? []) for (const prim of mesh.primitives) {
    for (const k of Object.keys(prim.attributes)) prim.attributes[k] = accessorRemap.get(prim.attributes[k])
    for (const t of prim.targets ?? []) for (const k of Object.keys(t)) t[k] = accessorRemap.get(t[k])
    if (prim.indices !== undefined) prim.indices = accessorRemap.get(prim.indices)
  }
  for (const anim of json.animations ?? []) for (const s of anim.samplers) { s.input = accessorRemap.get(s.input); s.output = accessorRemap.get(s.output) }
  for (const skin of json.skins ?? []) if (skin.inverseBindMatrices !== undefined) skin.inverseBindMatrices = accessorRemap.get(skin.inverseBindMatrices)
  // Lê já os dados finais de cada acessor mantido (com o referencial antigo de bufferViews).
  const finalData = keptAccessors.map((acc, i) => keptReplaced.get(i)?.data ?? (acc.bufferView === undefined ? null : readOld(i)))
  json.accessors = keptAccessors

  // Reconstrói o BIN: cada acessor num bufferView próprio e compacto; vistas sem acessor (imagens) copiadas.
  const chunks = []
  let length = 0
  const push = (bytes, align = 4) => {
    const pad = (align - (length % align)) % align
    if (pad) { chunks.push(Buffer.alloc(pad)); length += pad }
    const at = length
    chunks.push(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)); length += bytes.byteLength
    return at
  }
  // Vistas de dados de acessores (incluindo os descartados) não se copiam; só imagens e afins.
  const viewsWithAccessors = new Set(oldAccessors.map(a => a.bufferView).filter(v => v !== undefined))
  const newViews = []
  const viewRemap = new Map()
  ;(json.bufferViews ?? []).forEach((view, i) => {
    if (viewsWithAccessors.has(i)) return
    const bytes = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)
    const at = push(bytes)
    viewRemap.set(i, newViews.length)
    newViews.push({ ...view, buffer: 0, byteOffset: at, byteStride: undefined })
  })
  json.accessors.forEach((acc, i) => {
    const data = finalData[i]
    if (!data) return
    const target = acc.type === 'SCALAR' && (acc.componentType === 5123 || acc.componentType === 5125) && json.meshes.some(m => m.primitives.some(p => p.indices === i)) ? 34963 : 34962
    const at = push(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
    newViews.push({ buffer: 0, byteOffset: at, byteLength: data.byteLength, target })
    acc.bufferView = newViews.length - 1
    delete acc.byteOffset
  })
  for (const image of json.images ?? []) if (image.bufferView !== undefined) image.bufferView = viewRemap.get(image.bufferView)
  json.bufferViews = newViews.map(v => Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined)))
  json.accessors = json.accessors.map(a => Object.fromEntries(Object.entries(a).filter(([, x]) => x !== undefined)))
  const binOut = Buffer.concat(chunks)
  const binPadded = Buffer.concat([binOut, Buffer.alloc((4 - (binOut.length % 4)) % 4)])
  json.buffers = [{ byteLength: binPadded.length }]
  let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8')
  jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)])
  const header = Buffer.alloc(12)
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binPadded.length, 8)
  const ch = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b }
  const output = Buffer.concat([header, ch(jsonBuf.length, 0x4e4f534a), jsonBuf, ch(binPadded.length, 0x004e4942), binPadded])
  return { output, trisBefore: Math.round(trisBefore), trisAfter: Math.round(trisAfter) }
}

async function optimizeFile(file, opt) {
  const input = fs.readFileSync(file)
  const { output, trisBefore, trisAfter } = await optimizeGlbBuffer(input, opt)
  const dest = opt.out ? path.join(opt.out, path.basename(file)) : file
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, output)
  console.log(`${path.basename(file)}: ${Math.round(trisBefore)} → ${Math.round(trisAfter)} triângulos (${Math.round(100 * trisAfter / trisBefore)} %), ${(input.length / 1024).toFixed(0)} → ${(output.length / 1024).toFixed(0)} KB`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), opt = { out: null }, files = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === "--out") opt.out = args[++i]
    else if (a === "--ratio") opt.ratio = Number(args[++i])
    else if (a === "--error") opt.error = Number(args[++i])
    else if (a === "--min") opt.min = Number(args[++i])
    else files.push(a)
  }
  if (!files.length) { console.error("uso: node scripts/optimize-cad-glbs.mjs [--out DIR] [--ratio R] [--error E] [--min N] ficheiro.glb..."); process.exit(2) }
  for (const file of files) await optimizeFile(file, opt)
}
