import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = path.join(root, 'public/models/bornes-e-barras/phoenix-pti6-3213972.glb')
const source = fs.readFileSync(sourcePath)

function parseGlb(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'glTF' || buffer.readUInt32LE(4) !== 2) throw new Error('O modelo de origem tem de ser GLB 2.0.')
  let offset = 12
  const chunks = []
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset)
    const type = buffer.readUInt32LE(offset + 4)
    chunks.push({ type, data: buffer.subarray(offset + 8, offset + 8 + length) })
    offset += 8 + length
  }
  const json = chunks.find((chunk) => chunk.type === 0x4e4f534a)
  const bin = chunks.find((chunk) => chunk.type === 0x004e4942)
  if (!json || !bin) throw new Error('O GLB de origem precisa de chunks JSON e BIN.')
  return { document: JSON.parse(json.data.toString('utf8').trim()), binary: bin.data }
}

const srgbToLinear = (hex) => hex.slice(1).match(/.{2}/g).map((channel) => {
  const value = parseInt(channel, 16) / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
})

function build(conductors, output) {
  const { document: sourceDoc, binary } = parseGlb(source)
  if (sourceDoc.nodes.length !== 4 || sourceDoc.meshes.length !== 3 || sourceDoc.materials.length !== 3) {
    throw new Error('Estrutura inesperada no GLB Phoenix PTI 6; não vou gerar o modelo composto.')
  }
  const phaseColors = { L: '#171717', L1: '#171717', L2: '#8b4513', L3: '#6b7280', N: '#2563eb', PE: '#27834a' }
  const width = 8.15
  const depth = 48.5
  const height = 66.02
  const materials = sourceDoc.materials.map((material) => structuredClone(material))
  const nodes = []
  const meshes = []
  const roots = []
  const sourceNodes = sourceDoc.nodes

  conductors.forEach((conductor, moduleIndex) => {
    const color = phaseColors[conductor]
    if (!color) throw new Error(`Cor nativa não definida para ${conductor}.`)
    const neutralMaterialIds = moduleIndex === 0
      ? [0, 1]
      : [0, 1].map((sourceId) => {
        const id = materials.length
        materials.push(structuredClone(sourceDoc.materials[sourceId]))
        return id
      })
    neutralMaterialIds.forEach((id) => {
      const material = materials[id]
      material.name = `Polímero ${conductor}`
      material.pbrMetallicRoughness.baseColorFactor = [...srgbToLinear(color), 1]
    })

    const meshIds = sourceDoc.meshes.map((mesh) => {
      const id = meshes.length
      meshes.push({ ...structuredClone(mesh), primitives: mesh.primitives.map((primitive) => ({
        ...structuredClone(primitive),
        material: primitive.material === 0 ? neutralMaterialIds[0] : primitive.material === 1 ? neutralMaterialIds[1] : primitive.material,
      })) })
      return id
    })
    const nodeOffset = nodes.length
    for (const sourceNode of sourceNodes) {
      const node = structuredClone(sourceNode)
      if (node.mesh !== undefined) node.mesh = meshIds[node.mesh]
      if (node.children) node.children = node.children.map((child) => child + nodeOffset)
      delete node.translation
      delete node.rotation
      delete node.scale
      nodes.push(node)
    }
    const centerOffset = (moduleIndex - (conductors.length - 1) / 2) * width
    const rootNode = nodes[nodeOffset]
    rootNode.matrix = [
      1, 0, 0, 0,
      0, 0, 1, 0,
      0, -1, 0, 0,
      centerOffset - width / 2, depth, -height / 2, 1,
    ]
    roots.push(nodeOffset)
  })

  const json = {
    ...sourceDoc,
    asset: { ...sourceDoc.asset, generator: 'DC-SIMU native assembly from Phoenix Contact PTI 6 · 3213972' },
    scenes: [{ ...sourceDoc.scenes[sourceDoc.scene ?? 0], nodes: roots }],
    scene: 0,
    nodes,
    meshes,
    materials,
  }
  const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8')
  const jsonPadding = (4 - jsonBytes.length % 4) % 4
  const paddedJson = Buffer.concat([jsonBytes, Buffer.alloc(jsonPadding, 0x20)])
  const binPadding = (4 - binary.length % 4) % 4
  const paddedBin = Buffer.concat([binary, Buffer.alloc(binPadding)])
  const totalLength = 12 + 8 + paddedJson.length + 8 + paddedBin.length
  const header = Buffer.alloc(12)
  header.write('glTF', 0, 'ascii')
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(totalLength, 8)
  const jsonHeader = Buffer.alloc(8)
  jsonHeader.writeUInt32LE(paddedJson.length, 0)
  jsonHeader.writeUInt32LE(0x4e4f534a, 4)
  const binHeader = Buffer.alloc(8)
  binHeader.writeUInt32LE(paddedBin.length, 0)
  binHeader.writeUInt32LE(0x004e4942, 4)
  fs.writeFileSync(output, Buffer.concat([header, jsonHeader, paddedJson, binHeader, paddedBin]))
}

build(['L', 'N', 'PE'], path.join(root, 'public/models/bornes-e-barras/conjunto-bornes-monofasico.glb'))
build(['L1', 'L2', 'L3', 'N', 'PE'], path.join(root, 'public/models/bornes-e-barras/conjunto-bornes-trifasico.glb'))
