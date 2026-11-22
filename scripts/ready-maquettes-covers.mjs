// Capas das maquetes prontas («Biblioteca → Maquetes prontas»): render 3/4 tirado ao Painel 3D
// depois de chamar a ação real `insertReadyMaquette()`. Só a bancada é desenhada (grelha, chão,
// etiquetas flutuantes e molduras do ambiente ficam escondidos); o recorte é o retângulo de píxeis
// realmente desenhados (readPixels), quadrado e convertido em WebP dentro do browser.
//   node scripts/ready-maquettes-covers.mjs   →   public/maquetes/<id>.webp
import { mkdir, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { panelFixture } from './lib/panel-fixture.mjs'

const SIZE = 400
const output = path.resolve('runtime/maquettes-covers')
const publicDir = path.resolve('public/maquetes')
await mkdir(publicDir, { recursive: true })
await mkdir(output, { recursive: true })
const f = await panelFixture({ baseURL: process.env.MAQUETTES_TEST_URL, output, height: 900 })
const { page, frame } = f

/** Insere a maquete pela ação do store (o mesmo caminho do clique na biblioteca). */
const insert = (id) => page.evaluate(async (id) => {
  const { useSimStore } = await window.__fixtureImport('/src/store/useSimStore.ts')
  useSimStore.getState().stop()
  useSimStore.setState({ components: [], wires: [], canvasNotes: [], canvasTexts: [], selectedComponentIds: [], selectedTerminalId: null, demoMode: false, tool: 'select' })
  await window.__fixtureFrames()
  return useSimStore.getState().insertReadyMaquette(id, { x: 420, y: 260 }).length
}, id)

/** Enquadra a montagem em vista 3/4, esconde o cenário e devolve o recorte quadrado em px. */
const frameAndClip = async () => {
  await page.waitForFunction(() => {
    const r = window.__panelState?.()
    if (!r || document.querySelector('.panel3d-loading-overlay')) return false
    let roots = 0
    r.scene.traverse((o) => { if (o.userData.isComponentRoot) roots++ })
    return roots > 1
  }, undefined, { timeout: 60000 })
  await page.waitForTimeout(800)
  await frame()
  return page.evaluate(() => {
    const r = window.__panelState(), T = window.__fixtureThree
    r.scene.updateMatrixWorld(true)
    const box = new T.Box3()
    const keep = new Set()
    r.scene.traverse((o) => {
      if (!o.userData.isComponentRoot) return
      // Etiquetas flutuantes (sprites escalados ao tamanho da peça) não entram na caixa nem na capa.
      o.traverse((n) => {
        if (n.isSprite) { n.visible = false; return }
        if (n.isMesh && n.visible) box.expandByObject(n, true)
      })
      for (let p = o; p && p !== r.scene; p = p.parent) keep.add(p)
    })
    for (const child of [...r.scene.children]) {
      if (keep.has(child) || child.isLight || child.isCamera) continue
      child.visible = false
    }
    r.scene.background = new T.Color('#ffffff')
    const center = box.getCenter(new T.Vector3()), size = box.getSize(new T.Vector3())
    const distance = (size.length() / 2) / Math.sin((r.camera.fov * Math.PI) / 360) * 0.94
    r.controls?.dispatchEvent({ type: 'start' })
    r.camera.position.copy(center).add(new T.Vector3(-0.72, 0.62, 0.92).normalize().multiplyScalar(distance))
    r.camera.lookAt(center)
    r.camera.updateProjectionMatrix()
    r.controls?.target.copy(center)
    r.controls?.update()
    r.invalidate()

    // Píxeis realmente desenhados (só WebGL, sem sobreposições do DOM).
    const gl = r.gl.getContext()
    r.gl.render(r.scene, r.camera)
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight
    const data = new Uint8Array(w * h * 4)
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data)
    let minX = w, minY = h, maxX = -1, maxY = -1
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        if (data[i] > 248 && data[i + 1] > 248 && data[i + 2] > 248) continue
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
    // Barras de deslocamento do painel ficam fora da capa (não fazem parte da bancada).
    for (const el of document.querySelectorAll('.canvas-pan-scrollbars')) el.style.display = 'none'
    const rect = r.gl.domElement.getBoundingClientRect()
    const sx = rect.width / w, sy = rect.height / h
    const contentW = (maxX - minX + 1) * sx, contentH = (maxY - minY + 1) * sy
    const cx = rect.left + (minX + maxX + 1) / 2 * sx
    // readPixels devolve y a partir de baixo: converter para coordenadas de página.
    const cy = rect.top + (1 - (minY + maxY + 1) / 2 / h) * rect.height
    const side = Math.min(Math.max(contentW, contentH) * 1.12, rect.width, rect.height)
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi)
    return {
      clip: {
        x: Math.round(clamp(cx - side / 2, rect.left, rect.left + rect.width - side)),
        y: Math.round(clamp(cy - side / 2, rect.top, rect.top + rect.height - side)),
        width: Math.round(side),
        height: Math.round(side),
      },
      mm: { x: Math.round(size.x * 100), y: Math.round(size.y * 100), z: Math.round(size.z * 100) },
    }
  })
}

/**
 * PNG → WebP quadrado (SIZE px): recorta as margens uniformes (fundo branco e eventuais sobreposições
 * claras do painel), centra o conteúdo e reduz, tudo dentro do browser.
 */
const toWebp = (pngBuffer) => page.evaluate(async ({ base64, size }) => {
  const image = new Image()
  await new Promise((resolve, reject) => {
    image.onload = resolve
    image.onerror = reject
    image.src = `data:image/png;base64,${base64}`
  })
  const w = image.naturalWidth, h = image.naturalHeight
  const raw = document.createElement('canvas')
  raw.width = w
  raw.height = h
  const rctx = raw.getContext('2d', { willReadFrequently: true })
  rctx.drawImage(image, 0, 0)
  const { data } = rctx.getImageData(0, 0, w, h)
  const background = (i) => data[i] > 244 && data[i + 1] > 244 && data[i + 2] > 244
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (background((y * w + x) * 4)) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) throw new Error('Capa vazia: nenhum píxel desenhado')
  // Linhas/colunas de cor uniforme e clara (bordas e barras do painel) não fazem parte da bancada.
  const uniformLightRow = (y) => {
    const base = (y * w + minX) * 4
    for (let x = minX; x <= maxX; x++) {
      const i = (y * w + x) * 4
      if (Math.abs(data[i] - data[base]) > 4 || Math.abs(data[i + 1] - data[base + 1]) > 4 || Math.abs(data[i + 2] - data[base + 2]) > 4) return false
    }
    return data[base] > 200
  }
  const uniformLightCol = (x) => {
    const base = (minY * w + x) * 4
    for (let y = minY; y <= maxY; y++) {
      const i = (y * w + x) * 4
      if (Math.abs(data[i] - data[base]) > 4 || Math.abs(data[i + 1] - data[base + 1]) > 4 || Math.abs(data[i + 2] - data[base + 2]) > 4) return false
    }
    return data[base] > 200
  }
  while (maxY > minY && uniformLightRow(maxY)) maxY--
  while (minY < maxY && uniformLightRow(minY)) minY++
  while (maxX > minX && uniformLightCol(maxX)) maxX--
  while (minX < maxX && uniformLightCol(minX)) minX++
  const side = Math.min(Math.max(maxX - minX + 1, maxY - minY + 1) * 1.08, w, h)
  const sx = Math.min(Math.max((minX + maxX + 1) / 2 - side / 2, 0), w - side)
  const sy = Math.min(Math.max((minY + maxY + 1) / 2 - side / 2, 0), h - side)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, sx, sy, side, side, 0, 0, size, size)
  return canvas.toDataURL('image/webp', 0.94).split(',')[1]
}, { base64: pngBuffer.toString('base64'), size: SIZE })

try {
  for (const id of ['atec-estampagem', 'atec-bancada']) {
    const created = await insert(id)
    const { clip, mm } = await frameAndClip()
    const png = await page.screenshot({ clip })
    await writeFile(path.join(output, `${id}.png`), png)
    const webp = await toWebp(png)
    await writeFile(path.join(publicDir, `${id}.webp`), Buffer.from(webp, 'base64'))
    console.log(`OK — ${id}: ${created} componentes · ${mm.x} × ${mm.y} × ${mm.z} mm · recorte ${clip.width}² → public/maquetes/${id}.webp`)
  }
  await f.stable()
} finally {
  await f.browser.close()
  await rm(output, { recursive: true, force: true })
}
