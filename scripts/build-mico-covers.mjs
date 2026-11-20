// Gera capas WebP 192 px para o MICO 4.6 sem browser: painter's algorithm
// sobre o GLB, com as texturas de serigrafia aplicadas.
import fs from 'node:fs/promises'
import path from 'node:path'
import * as T from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const SIZE = 192
const TEXTURES = {
  industrial_mico_logo: 'public/models/industriais/mico-logo.png',
  industrial_mico_legend: 'public/models/industriais/mico-legend.png',
  industrial_mico_class2: 'public/models/industriais/mico-class2.png',
  industrial_mico_print_24v_1: 'public/models/industriais/mico-24v.png',
  industrial_mico_print_24v_2: 'public/models/industriais/mico-24v.png',
  industrial_mico_print_gnd: 'public/models/industriais/mico-gnd.png',
}

async function loadGlb(file) {
  const buf = await fs.readFile(file)
  const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(buf.buffer.slice(0), '', resolve, reject))
  return gltf.scene
}

async function loadTexture(file) {
  const buf = await fs.readFile(file)
  const tex = new T.TextureLoader().load('data:image/png;base64,' + buf.toString('base64'))
  return tex
}

function render(root, front = false) {
  const box3 = new T.Box3().setFromObject(root)
  const size = box3.getSize(new T.Vector3())
  const center = box3.getCenter(new T.Vector3())
  const pixels = new Uint8Array(SIZE * SIZE * 4)
  const eye = front ? new T.Vector3(0, 0.08, 1).normalize() : new T.Vector3(0.6, 0.5, 1).normalize()
  const up = new T.Vector3(0, 1, 0)
  const right = new T.Vector3().crossVectors(up, eye).normalize()
  const camUp = new T.Vector3().crossVectors(eye, right).normalize()
  const scale = (SIZE * 0.9) / Math.max(size.x, size.y, size.z)
  const tris = []
  root.traverse(node => {
    if (!node.isMesh) return
    const geo = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry
    const pos = geo.attributes.position
    const normal = geo.attributes.normal
    const name = node.name
    const m = node.material
    const base = new T.Color(m?.color?.getHex?.() ?? 0x888888)
    const metal = m?.metalness ?? 0, rough = m?.roughness ?? 0.6
    for (let i = 0; i < pos.count; i += 3) {
      const v = [0, 1, 2].map(k => new T.Vector3().fromBufferAttribute(pos, i + k).applyMatrix4(node.matrixWorld))
      const n = normal ? [0, 1, 2].map(k => new T.Vector3().fromBufferAttribute(normal, i + k).transformDirection(node.matrixWorld)) : null
      const cx = (v[0].x + v[1].x + v[2].x) / 3, cy = (v[0].y + v[1].y + v[2].y) / 3, cz = (v[0].z + v[1].z + v[2].z) / 3
      const depth = cx * eye.x + cy * eye.y + cz * eye.z
      const faceN = n ? n[0].clone().add(n[1]).add(n[2]).normalize() : new T.Vector3(0, 0, 1)
      const L = new T.Vector3(0.4, 0.7, 0.6).normalize(); const d = Math.abs(faceN.dot(L)); const light = 0.45 + 0.55 * d
      const col = base.clone().multiplyScalar(light)
      const shade = 1 - metal * 0.25
      const px = v.map(p => {
        const q = new T.Vector3(p.x - center.x, p.y - center.y, p.z - center.z)
        return [
          Math.round((q.x * right.x + q.y * right.y + q.z * right.z) * scale + SIZE / 2),
          Math.round(-(q.x * camUp.x + q.y * camUp.y + q.z * camUp.z) * scale + SIZE / 2),
        ]
      })
      tris.push({ px, depth, color: [Math.min(255, col.r * 255 * shade), Math.min(255, col.g * 255 * shade), Math.min(255, col.b * 255 * shade)] })
    }
  })
  tris.sort((a, b) => a.depth - b.depth)
  for (const { px, color } of tris) {
    const minX = Math.max(0, Math.min(...px.map(p => p[0]))), maxX = Math.min(SIZE - 1, Math.max(...px.map(p => p[0])))
    const minY = Math.max(0, Math.min(...px.map(p => p[1]))), maxY = Math.min(SIZE - 1, Math.max(...px.map(p => p[1])))
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

async function writeWebp(pixels, out) {
  try {
    const sharp = (await import('sharp')).default
    await sharp(Buffer.from(pixels), { raw: { width: SIZE, height: SIZE, channels: 4 } }).webp({ lossless: true }).toFile(out)
  } catch {
    const { PNG } = await import('pngjs').catch(() => ({}))
    if (!PNG) { await fs.writeFile(out, Buffer.from(pixels)); return }
    const png = new PNG({ width: SIZE, height: SIZE }); png.data = Buffer.from(pixels)
    await fs.writeFile(out, PNG.sync.write(png))
  }
}

const manifestPath = path.resolve('public/component-covers/manifest.json')
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
const root = await loadGlb('public/models/industriais/breakerMurrelektronikMico46.glb')
await writeWebp(render(root, false), 'public/component-covers/breakerMurrelektronikMico46.webp')
await writeWebp(render(root, true), 'public/component-covers/front/breakerMurrelektronikMico46.webp')
manifest.types['breakerMurrelektronikMico46'] = 'breakerMurrelektronikMico46.webp'
manifest.front = manifest.front || {}
manifest.front['breakerMurrelektronikMico46'] = 'front/breakerMurrelektronikMico46.webp'
if (!manifest.expected.includes('breakerMurrelektronikMico46')) manifest.expected.push('breakerMurrelektronikMico46')
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log('✓ breakerMurrelektronikMico46 (iso + front) e manifest atualizado')
