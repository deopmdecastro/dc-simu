// Revisão visual de um aparelho industrial: renderiza o GLB com as serigrafias da
// aplicação (PRINTS) em WebGL real, em quatro vistas, para comparar com fotografias.
// Uso: node --import tsx scripts/render-industrial.mjs <tipo | caminho em public/models> <saida.png> [largura]
import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { PRINTS } from '../src/three/industrialFinish.ts'

const [type, out, widthArg] = process.argv.slice(2)
if (!type || !out) { console.error('Uso: render-industrial.mjs <tipo> <saida.png>'); process.exit(2) }
const W = Number(widthArg) || 1400, H = Math.round(W * .42)
const ORIGIN = 'http://render.local'
const files = { '/three/': path.resolve('node_modules/three') + '/', '/models/': path.resolve('public/models') + '/' }
const mime = { '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' }
const browser = await chromium.launch(process.env.RENDER_CHANNEL === 'bundled' ? {} : { channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route(ORIGIN + '/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script></head><body style="margin:0;background:#fff"><canvas id="c" width="${W}" height="${H}"></canvas></body></html>` })
    const prefix = Object.keys(files).find((p) => url.pathname.startsWith(p))
    if (!prefix) return route.fulfill({ status: 404 })
    const file = files[prefix] + decodeURIComponent(url.pathname.slice(prefix.length))
    try { return route.fulfill({ body: await fs.readFile(file), contentType: mime[path.extname(file)] ?? 'application/octet-stream' }) } catch { return route.fulfill({ status: 404 }) }
  })
  await page.goto(ORIGIN + '/')
  await page.evaluate(async ({ type, prints, W, H }) => {
    const T = await import('three')
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js')
    const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js')
    const renderer = new T.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true, preserveDrawingBuffer: true })
    renderer.setClearColor('#ffffff'); renderer.toneMapping = T.ACESFilmicToneMapping; renderer.outputColorSpace = T.SRGBColorSpace
    const dir = type.startsWith('timerGeya') || type.startsWith('levelRelay') || type.startsWith('buzzer') || type.startsWith('vfd') || type.startsWith('relay') || type.startsWith('pushButtonXb2') || type.startsWith('breakerMurr') ? 'industriais' : 'industriais'
    const gltf = await new GLTFLoader().loadAsync(type.includes('/') ? `/models/${type}` : `/models/${dir}/${type}.glb`)
    const loader = new T.TextureLoader()
    for (const [name, file] of Object.entries(prints)) {
      const node = gltf.scene.getObjectByName(name); if (!node) continue
      const map = await loader.loadAsync(`/models/${dir}/` + file).catch(() => null); if (!map) continue
      map.colorSpace = T.SRGBColorSpace; map.anisotropy = 8
      node.material = new T.MeshStandardMaterial({ map, roughness: .7, transparent: true })
    }
    const scene = new T.Scene()
    scene.environment = new T.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture
    const light = new T.DirectionalLight('#ffffff', 1.5); light.position.set(-1, 2, 2); scene.add(light)
    scene.add(gltf.scene)
    const box = new T.Box3().setFromObject(gltf.scene), center = box.getCenter(new T.Vector3()), radius = box.getSize(new T.Vector3()).length() / 2
    const views = [[0, 0.03, 1], [-0.7, 0.35, 0.7], [0.75, 0.3, 0.65], [1, 0.05, 0]]
    renderer.setScissorTest(true)
    const vw = W / views.length
    views.forEach((d, i) => {
      const cam = new T.PerspectiveCamera(24, vw / H, .001, 10)
      cam.position.copy(center).add(new T.Vector3(...d).normalize().multiplyScalar(radius / Math.sin(T.MathUtils.degToRad(12)) * 1.02)); cam.lookAt(center)
      renderer.setViewport(i * vw, 0, vw, H); renderer.setScissor(i * vw, 0, vw, H); renderer.render(scene, cam)
    })
  }, { type, prints: PRINTS[type] ?? {}, W, H })
  if (errors.length) throw new Error(errors.join('\n'))
  await page.locator('#c').screenshot({ path: out })
  console.log('✓', out)
} finally { await browser.close() }
