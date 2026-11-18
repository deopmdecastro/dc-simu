/** Lossless delivery packing for large Admin exports. No quantisation,
 * simplification, reordering, image conversion or authored metadata changes.
 * The existing 4.5 MB publication cap remains enforced by UI and backend.
 */
const EXT = 'EXT_meshopt_compression'
const aligned = (n: number) => Math.ceil(n / 4) * 4
const componentBytes: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }
const components: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 }
interface BufferView { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number; target?: number; extensions?: Record<string, unknown> }
interface Accessor { bufferView?: number; byteOffset?: number; componentType: number; type: string; count: number; sparse?: unknown }
interface Document {
  buffers: Array<{ byteLength: number; uri?: string; extensions?: Record<string, unknown> }>
  bufferViews: BufferView[]
  accessors?: Accessor[]
  extensionsUsed?: string[]
  extensionsRequired?: string[]
}

function hash(bytes: Uint8Array): string {
  let h = 2166136261
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 16777619)
  return `${bytes.length}:${h >>> 0}`
}
const equal = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((n, i) => n === b[i])

export async function compactCatalogGlb(input: ArrayBuffer): Promise<ArrayBuffer> {
  const header = new DataView(input)
  if (input.byteLength < 28 || header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2) return input
  const jsonLength = header.getUint32(12, true), binaryHeader = 20 + jsonLength
  if (header.getUint32(16, true) !== 0x4e4f534a || binaryHeader + 8 > input.byteLength || header.getUint32(binaryHeader + 4, true) !== 0x004e4942) return input
  const doc = JSON.parse(new TextDecoder().decode(new Uint8Array(input, 20, jsonLength))) as Document
  // This function packs the self-contained single-buffer GLTFExporter result,
  // not arbitrary externally referenced / already compressed user files.
  if (doc.buffers?.length !== 1 || doc.buffers[0].uri || !doc.bufferViews?.length
    || doc.bufferViews.some(view => view.buffer !== 0 || view.extensions)) return input
  const binary = new Uint8Array(input, binaryHeader + 8, header.getUint32(binaryHeader, true))
  const { MeshoptEncoder } = await import('meshoptimizer')
  if (!MeshoptEncoder.supported) return input
  await MeshoptEncoder.ready

  let length = 0, fallbackLength = 0, compressed = 0
  const chunks: Array<{ offset: number; bytes: Uint8Array }> = []
  // Hashes are only a bucket lookup; exact byte comparisons prevent collisions
  // from ever substituting a different texture or vertex/index buffer.
  const spans = new Map<string, Array<{ source: Uint8Array; offset: number; length: number }>>()
  const pack = (source: Uint8Array, mode: string, bytes: () => Uint8Array) => {
    const key = `${mode}:${hash(source)}`, candidates = spans.get(key) ?? []
    const found = candidates.find(span => equal(source, span.source))
    if (found) return found
    const encoded = bytes(), span = { source, offset: length, length: encoded.length }
    chunks.push({ offset: length, bytes: encoded }); length += aligned(encoded.length)
    candidates.push(span); spans.set(key, candidates)
    return span
  }
  for (let index = 0; index < doc.bufferViews.length; index++) {
    const view = doc.bufferViews[index], start = view.byteOffset ?? 0
    if (start + view.byteLength > binary.length) throw new Error('GLB: bufferView fora do buffer binário.')
    const source = binary.subarray(start, start + view.byteLength)
    const accessors = (doc.accessors ?? []).filter(a => a.bufferView === index)
    const accessor = accessors[0]
    const stride = view.byteStride ?? (accessor ? componentBytes[accessor.componentType] * components[accessor.type] : 0)
    const count = stride ? view.byteLength / stride : 0
    const mode = view.target === 34963 ? 'INDICES' : 'ATTRIBUTES'
    const eligible = accessor && !accessors.some(a => a.sparse) && Number.isInteger(count) && count > 0
      && (mode === 'INDICES' ? stride === 2 || stride === 4 : stride > 0 && stride <= 256 && stride % 4 === 0)
    if (eligible) {
      const span = pack(source, `${mode}:${stride}`, () => MeshoptEncoder.encodeGltfBuffer(source, count, stride, mode))
      view.buffer = 1; view.byteOffset = fallbackLength
      view.extensions = { [EXT]: { buffer: 0, byteOffset: span.offset, byteLength: span.length, byteStride: stride, count, mode } }
      fallbackLength += aligned(view.byteLength); compressed++
    } else {
      const span = pack(source, 'RAW', () => source)
      view.buffer = 0; view.byteOffset = span.offset
    }
  }
  doc.buffers = [{ ...doc.buffers[0], byteLength: length }]
  if (compressed) {
    // Extension-required placeholder, per EXT_meshopt_compression. The Three
    // loader already bundles its decoder, including in offline/PWA mode.
    doc.buffers.push({ byteLength: fallbackLength, extensions: { [EXT]: { fallback: true } } })
    doc.extensionsUsed = [...new Set([...(doc.extensionsUsed ?? []), EXT])]
    doc.extensionsRequired = [...new Set([...(doc.extensionsRequired ?? []), EXT])]
  }
  const json = new TextEncoder().encode(JSON.stringify(doc)), jsonSize = aligned(json.length)
  const output = new ArrayBuffer(12 + 8 + jsonSize + 8 + length), out = new Uint8Array(output), data = new DataView(output)
  data.setUint32(0, 0x46546c67, true); data.setUint32(4, 2, true); data.setUint32(8, output.byteLength, true)
  data.setUint32(12, jsonSize, true); data.setUint32(16, 0x4e4f534a, true)
  out.fill(0x20, 20, 20 + jsonSize); out.set(json, 20)
  data.setUint32(20 + jsonSize, length, true); data.setUint32(24 + jsonSize, 0x004e4942, true)
  for (const chunk of chunks) out.set(chunk.bytes, 28 + jsonSize + chunk.offset)
  return output.byteLength < input.byteLength ? output : input
}
