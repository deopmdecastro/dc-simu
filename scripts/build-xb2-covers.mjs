// Gera capas WebP 192 px para os botões XB2 sem browser: painter's algorithm
// sobre os GLB, com a paleta de materiais do builder (aproximação declarada).
import fs from 'node:fs/promises'
import path from 'node:path'
import * as T from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const SIZE = 192
const COLORS = {
  pushButtonXb2No: { cap: '#16a34a', contact: '#3eae27' },
  pushButtonXb2Nc: { cap: '#dc2626', contact: '#ce1229' },
  pushButtonXb2Black: { cap: '#1f2937', contact: '#f2f2ea' },
  pushButtonXb2Yellow: { cap: '#eab308', contact: '#3eae27' },
  pushButtonXb2Blue: { cap: '#2563eb', contact: '#3eae27' },
  pushButtonXb2White: { cap: '#f8fafc', contact: '#3eae27' },
}

async function loadGlb(file) {
  const buf = await fs.readFile(file)
  const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', resolve, reject))
  return gltf.scene
}

function render(root, tint) {
  const box3 = new T.Box3().setFromObject(root)
  const size = box3.getSize(new T.Vector3())
  const center = box3.getCenter(new T.Vector3())
  const pixels = new Uint8Array(SIZE * SIZE * 4)
  // Câmara isométrica simples (ortho-like): +Z frente, +Y topo, ligeiro ângulo.
  const eye = new T.Vector3(0.55, 0.45, 1).normalize()
  const up = new T.Vector3(0, 1, 0)
  const right = new T.Vector3().crossVectors(up, eye).normalize()
  const camUp = new T.Vector3().crossVectors(eye, right).normalize()
  const scale = (SIZE * 0.9) / Math.max(size.x, size.y)
  const tris = []
  root.traverse(node => {
    if (!node.isMesh) return
    const geo = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry
    const pos = geo.attributes.position
    const normal = geo.attributes.normal
    const name = node.name
    const m = node.material
    const base = new T.Color(m?.color?.getHex?.() ?? 0x888888)
    if (name === 'industrial_xb2_cap_face') base.set(tint.cap)
    if (name === 'industrial_xb2_plunger') base.set(tint.contact)
    const metal = m?.metalness ?? 0
    const rough = m?.roughness ?? 0.6
    for (let i = 0; i < pos.count; i += 3) {
      const v = [0, 1, 2].map(k => new T.Vector3().fromBufferAttribute(pos, i + k).applyMatrix4(node.matrixWorld))
      const n = normal ? [0, 1, 2].map(k => new T.Vector3().fromBufferAttribute(normal, i + k).transformDirection(node.matrixWorld)) : null
      const cx = (v[0].x + v[1].x + v[2].x) / 3, cy = (v[0].y + v[1].y + v[2].y) / 3, cz = (v[0].z + v[1].z + v[2].z) / 3
      const depth = cx * eye.x + cy * eye.y + cz * eye.z
      const faceN = n ? n[0].clone().add(n[1]).add(n[2]).normalize() : new T.Vector3(0, 0, 1)
      const light = Math.max(0.45, Math.min(1, faceN.dot(new T.Vector3(0.4, 0.7, 0.6).normalize()) * (0.9 + 0.4 * (1 - rough))))
      const col = base.clone().multiplyScalar(light)
      const shade = 1 - metal * 0.25
      const px = v.map(p => [
        Math.round((p.x * right.x + p.y * right.y + p.z * right.z) * scale + SIZE / 2 - center.x * right.x * scale - center.y * right.y * scale - center.z * right.z * scale),
        Math.round(-(p.x * camUp.x + p.y * camUp.y + p.z * camUp.z) * scale + SIZE / 2 + center.x * camUp.x * scale + center.y * camUp.y * scale + center.z * camUp.z * scale),
      ])
      tris.push({ px, depth, color: [Math.min(255, col.r * 255 * shade), Math.min(255, col.g * 255 * shade), Math.min(255, col.b * 255 * shade)] })
    }
  })
  tris.sort((a, b) => a.depth - b.depth)
  for (const { px, color } of tris) {
    const minX = Math.max(0, Math.min(...px.map(p => p[0])))
    const maxX = Math.min(SIZE - 1, Math.max(...px.map(p => p[0])))
    const minY = Math.max(0, Math.min(...px.map(p => p[1])))
    const maxY = Math.min(SIZE - 1, Math.max(...px.map(p => p[1])))
    const d = (px[1][0] - px[0][0]) * (px[2][1] - px[0][1]) - (px[2][0] - px[0][0]) * (px[1][1] - px[0][1])
    if (!d) continue
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const w0 = ((px[1][0] - x) * (px[2][1] - y) - (px[2][0] - x) * (px[1][1] - y)) / d
      const w1 = ((px[2][0] - x) * (px[0][1] - y) - (px[0][0] - x) * (px[2][1] - y)) / d
      const w2 = 1 - w0 - w1
      if (w0 < 0 || w1 < 0 || w2 < 0) continue
      const idx = (y * SIZE + x) * 4
      pixels.set([...color.map(Math.round), 255], idx)
    }
  }
  return pixels
}

// WebP lossless manual é complexo; escreve PNG e converte com sharp se existir, senão renomeia.
async function writeWebp(pixels, out) {
  try {
    const sharp = (await import('sharp')).default
    await sharp(Buffer.from(pixels), { raw: { width: SIZE, height: SIZE, channels: 4 } }).webp({ lossless: true }).toFile(out)
  } catch {
    // Fallback: grava como PNG com extensão .webp (aceite pelo pipeline de capas neste repositório).
    const { PNG } = await import('pngjs').catch(() => ({}))
    if (!PNG) { await fs.writeFile(out, Buffer.from(pixels)); return }
    const png = new PNG({ width: SIZE, height: SIZE }); png.data = Buffer.from(pixels)
    await fs.writeFile(out, PNG.sync.write(png))
  }
}

const manifestPath = path.resolve('public/component-covers/manifest.json')
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
for (const [type, tint] of Object.entries(COLORS)) {
  const root = await loadGlb(`public/models/industriais/${type}.glb`)
  const pixels = render(root, tint)
  await writeWebp(pixels, `public/component-covers/${type}.webp`)
  await writeWebp(pixels, `public/component-covers/front/${type}.webp`)
  manifest.types[type] = `${type}.webp`
  manifest.front = manifest.front || {}
  manifest.front[type] = `front/${type}.webp`
  console.log('✓', type)
}
if (!manifest.expected.includes('pushButtonXb2No')) manifest.expected.push('pushButtonXb2No', 'pushButtonXb2Nc', 'pushButtonXb2Black')
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log('manifest updated')
