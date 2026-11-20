// Capas WebP 192 px de aparelhos industriais (iso + frente) renderizadas com WebGL real num
// browser Playwright, com as serigrafias da aplicação (PRINTS) aplicadas.
// Uso: node --import tsx scripts/build-mico-covers.mjs [tipo ...]   (por omissão: MICO 4.6)
//      COVERS_CHANNEL=bundled para o Chromium do Playwright
import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { PRINTS } from '../src/three/industrialFinish.ts'

const SIZE = 192
const TYPES = process.argv.slice(2).length ? process.argv.slice(2) : ['breakerMurrelektronikMico46']
const ORIGIN = 'http://covers.local'
const files = { '/three/': path.resolve('node_modules/three') + '/', '/models/': path.resolve('public/models') + '/' }
const types = { '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.png': 'image/png' }
const manifestPath = path.resolve('public/component-covers/manifest.json')
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))

const browser = await chromium.launch(process.env.COVERS_CHANNEL === 'bundled' ? {} : { channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route(ORIGIN + '/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script></head><body style="margin:0"><canvas id="c" width="${SIZE}" height="${SIZE}"></canvas></body></html>` })
    const prefix = Object.keys(files).find((p) => url.pathname.startsWith(p))
    if (!prefix) return route.fulfill({ status: 404 })
    const file = files[prefix] + decodeURIComponent(url.pathname.slice(prefix.length))
    try { return route.fulfill({ body: await fs.readFile(file), contentType: types[path.extname(file)] ?? 'application/octet-stream' }) } catch { return route.fulfill({ status: 404 }) }
  })
  await page.goto(ORIGIN + '/')
  for (const type of TYPES) {
    const shots = await page.evaluate(async ({ type, textures }) => {
      const T = await import('three')
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js')
      const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js')
      const renderer = new T.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true, alpha: true, preserveDrawingBuffer: true })
      renderer.setClearColor(0x000000, 0); renderer.toneMapping = T.ACESFilmicToneMapping; renderer.outputColorSpace = T.SRGBColorSpace
      const gltf = await new GLTFLoader().loadAsync(`/models/industriais/${type}.glb`)
      const loader = new T.TextureLoader()
      for (const [name, file] of Object.entries(textures)) {
        const node = gltf.scene.getObjectByName(name); if (!node) continue
        const map = await loader.loadAsync('/models/industriais/' + file).catch(() => null); if (!map) continue
        map.colorSpace = T.SRGBColorSpace
        node.material = new T.MeshStandardMaterial({ map, roughness: .56, transparent: true, alphaTest: .04 })
      }
      const scene = new T.Scene()
      scene.environment = new T.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture
      const light = new T.DirectionalLight('#ffffff', 1.6); light.position.set(-1, 2, 2); scene.add(light)
      scene.add(gltf.scene)
      const box = new T.Box3().setFromObject(gltf.scene), center = box.getCenter(new T.Vector3()), radius = box.getSize(new T.Vector3()).length() / 2
      const shot = (dir) => {
        const cam = new T.PerspectiveCamera(24, 1, .001, 10)
        cam.position.copy(center).add(new T.Vector3(...dir).normalize().multiplyScalar(radius / Math.sin(T.MathUtils.degToRad(12)) * 1.02)); cam.lookAt(center)
        renderer.render(scene, cam)
        return renderer.domElement.toDataURL('image/webp', 1)
      }
      return { iso: shot([-0.6, 0.5, 0.75]), front: shot([0, 0.02, 1]) }
    }, { type, textures: PRINTS[type] ?? {} })
    if (errors.length) throw new Error(errors.join('\n'))
    const write = async (out, dataUrl) => {
      if (!dataUrl.startsWith('data:image/webp;base64,')) throw new Error('O browser não codificou WebP')
      await fs.mkdir(path.dirname(out), { recursive: true })
      await fs.writeFile(out, Buffer.from(dataUrl.split(',')[1], 'base64'))
    }
    await write(`public/component-covers/${type}.webp`, shots.iso)
    await write(`public/component-covers/front/${type}.webp`, shots.front)
    manifest.types[type] = `${type}.webp`
    manifest.front = manifest.front || {}
    manifest.front[type] = `front/${type}.webp`
    console.log(`✓ ${type} (iso + front)`)
  }
} finally { await browser.close() }
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
