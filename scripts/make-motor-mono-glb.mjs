// Gera o motor monofásico azul a partir do motor trifásico SEW DRN80MK4/B3 vermelho:
// a mesma geometria, texturas e caixa de bornes; só a pintura da carcaça passa a azul.
//   node scripts/make-motor-mono-glb.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const SOURCE = 'public/models/motores/DRN80MK4-B3.glb'
const TARGET = 'public/models/motores/DRN80MK4-B3-mono-azul.glb'
/** Azul DC-Simu (RAL 5015 aproximado), em linear como o glTF pede. */
const BLUE = [0.035, 0.18, 0.62, 1]

const glb = readFileSync(SOURCE)
if (glb.readUInt32LE(0) !== 0x46546c67) throw new Error('Não é um GLB')
const jsonLength = glb.readUInt32LE(12)
if (glb.readUInt32LE(16) !== 0x4e4f534a) throw new Error('Primeiro bloco não é JSON')
const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'))
const rest = glb.subarray(20 + jsonLength) // bloco BIN intacto (geometria e texturas)

const paint = json.materials.filter((m) => /vermelh/i.test(m.name ?? ''))
if (paint.length !== 1) throw new Error(`Esperava um material de pintura vermelha, encontrei ${paint.length}`)
paint[0].name = 'Carcaca azul monofasico'
paint[0].pbrMetallicRoughness.baseColorFactor = BLUE
// A textura de cor era a pintura vermelha: sem ela o azul fica limpo; o relevo (normal) mantém-se.
delete paint[0].pbrMetallicRoughness.baseColorTexture
json.asset = { ...json.asset, extras: { ...(json.asset?.extras ?? {}), dcSimu: 'Motor monofásico azul derivado de DRN80MK4-B3.glb' } }

let text = JSON.stringify(json)
while (Buffer.byteLength(text) % 4) text += ' '
const jsonChunk = Buffer.from(text, 'utf8')
const header = Buffer.alloc(20)
header.writeUInt32LE(0x46546c67, 0)
header.writeUInt32LE(2, 4)
header.writeUInt32LE(20 + jsonChunk.length + rest.length, 8)
header.writeUInt32LE(jsonChunk.length, 12)
header.writeUInt32LE(0x4e4f534a, 16)
writeFileSync(TARGET, Buffer.concat([header, jsonChunk, rest]))
console.log(`${TARGET}: ${20 + jsonChunk.length + rest.length} bytes (pintura «${paint[0].name}»)`)
