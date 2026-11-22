// Verificação visual + capturas de evidência dos componentes pneumáticos redesenhados:
// compressor Maxxim 24 L (AirCompressor3D) e ilha de válvulas Festo VTUG (PneumaticManifold3D).
// Reaproveita o panelFixture (mesmo padrão de mechanical-refinement-ui-smoke.mjs):
//   node scripts/pneumatics-fidelity-ui-smoke.mjs
// Saída: docs/validation/compressor-vtug-fidelity/{airCompressor,pneumaticManifold}-*.png
import path from 'node:path'
import { writeFile, mkdir } from 'node:fs/promises'
import { panelFixture } from './lib/panel-fixture.mjs'

const output = process.env.PNEUMATICS_FIDELITY_OUTPUT || path.resolve('docs/validation/compressor-vtug-fidelity')
const f = await panelFixture({ baseURL: process.env.INDUSTRIAL_TEST_URL, output })
const { page, check } = f
const evidence = { components: {}, errors: f.errors }

async function pose(dir = [0.65, 0.32, 1.7]) {
  await page.evaluate((dir) => {
    const r = window.__panelState(), T = window.__fixtureThree, b = new T.Box3()
    r.scene.updateMatrixWorld(true)
    r.scene.traverse((n) => { if (n.userData.isComponentRoot) b.expandByObject(n, true) })
    const c = b.getCenter(new T.Vector3()), s = b.getSize(new T.Vector3())
    const distance = Math.max(s.x / r.camera.aspect, s.y, s.z) * 1.9
    r.controls?.dispatchEvent({ type: 'start' })
    r.camera.position.copy(c).add(new T.Vector3(...dir).normalize().multiplyScalar(distance))
    r.camera.lookAt(c)
    r.controls?.target.copy(c)
    r.controls?.update()
    r.invalidate()
  }, dir)
  await f.frame()
}

try {
  await mkdir(output, { recursive: true })
  const types = process.env.PNEUMATICS_FIDELITY_TYPES?.split(',') || ['airCompressor', 'pneumaticManifold']
  for (const type of types) {
    const [id] = await f.show(type)
    await page.waitForTimeout(400)
    await f.frame()
    // Contagem de malhas montadas
    const stats = await page.evaluate((id) => {
      const r = window.__panelState()
      let root
      r.scene.traverse((n) => { if (n.userData.isComponentRoot && n.userData.componentId === id) root = n })
      let meshes = 0
      root?.traverse((n) => { if (n.isMesh) meshes += 1 })
      return { meshes }
    }, id)
    check(stats.meshes > 20, `${type}: monta ${stats.meshes} malhas 3D (>20)`)
    if (type === 'airCompressor') {
      const shape = await page.evaluate(() => {
        const r = window.__panelState(), T = window.__fixtureThree
        const tank = r.scene.getObjectByName('compressor-tank')
        tank.geometry.computeBoundingBox()
        const size = tank.geometry.boundingBox.getSize(new T.Vector3())
        const pos = tank.geometry.attributes.position
        // Todos os vértices pertencem a secções circulares completas: as duas
        // metades longitudinais do reservatório têm a mesma extensão em Z.
        let front = 0, back = 0
        for (let i = 0; i < pos.count; i++) { if (pos.getZ(i) > 0) front++; if (pos.getZ(i) < 0) back++ }
        const maps = new Map()
        r.scene.traverse(n => { if (n.material?.map) maps.set(n.material.map.uuid, n.material.map) })
        const logo = [...maps.values()].find(t => t.image?.width === 768 && t.image?.height === 160)
        if (!logo) throw new Error('Logótipo original não carregado')
        window.__compressorLogo = { texture: logo, disposed: false }
        logo.addEventListener('dispose', () => { window.__compressorLogo.disposed = true })
        return { ratio: size.x / size.y, roundness: size.y / size.z, front, back }
      })
      check(shape.ratio > 2.2 && shape.ratio < 2.4 && Math.abs(shape.roundness - 1) < 0.001, 'Reservatório proporcional, circular e fechado nas duas extremidades')
      check(Math.abs(shape.front - shape.back) < 100, 'Reservatório sem corte longitudinal nas tampas')
      await f.store(s => s.setState({ components: s.getState().components.map(c => c.type === 'airCompressor' ? { ...c, state: { ...c.state, tankPressureBar: 6, outletPressureBar: 4, coverOpen: true } } : c) }))
      await f.frame()
      check(await page.evaluate(() => !window.__compressorLogo.disposed && window.__panelState().scene.getObjectByName('compressor-cover').rotation.z > 0.5), 'Alterar pressão preserva decalques; a carenagem continua a abrir')
      await pose([-0.65, 0.28, 1.6])
      await page.screenshot({ path: path.join(output, 'airCompressor-cover-open.png') })
      await f.store(s => s.setState({ components: s.getState().components.map(c => c.type === 'airCompressor' ? { ...c, state: { ...c.state, tankPressureBar: 0, outletPressureBar: 0, coverOpen: false } } : c) }))
      await f.frame()
      const pdf = await page.request.get(new URL('/datasheets/pneumatics/maxxim-air-compressor-24l-manual.pdf', page.url()).href)
      const body = await pdf.body()
      check(pdf.ok() && body.length > 1900000 && body.subarray(0,1024).includes(Buffer.from('%PDF-')), 'Manual original servido pelo simulador (36 páginas, sem resumo de substituição)')
      evidence.components.airCompressor = { ...shape, manualBytes: body.length }
    }
    // Vista 3/4 (como as capas de produto) + vista frontal
    await pose([0.62, 0.3, 1.75])
    await page.screenshot({ timeout: 120000, path: path.join(output, `${type}-iso.png`) })
    await pose([0.05, 0.12, 2.0])
    await page.screenshot({ timeout: 120000, path: path.join(output, `${type}-front.png`) })
    if (type === 'airCompressor') {
      await pose([1.8, 0.15, 0.05])
      await page.screenshot({ path: path.join(output, 'airCompressor-end.png') })
      await pose([-0.62, 0.3, -1.75])
      await page.screenshot({ path: path.join(output, 'airCompressor-rear.png') })
    }
    evidence.components[type] = { ...evidence.components[type], ...stats }
    console.log(`CAPTURE ${type}`, JSON.stringify(stats))
  }
  f.stable()
  await writeFile(path.join(output, 'results.json'), JSON.stringify(evidence, null, 2))
  console.log('PASS — pneumatics fidelity capture')
} catch (error) {
  console.error('React/WebGL:', f.errors)
  await page.screenshot({ path: path.join(output, 'failure.png'), timeout: 15000 }).catch(() => {})
  throw error
} finally {
  await f.browser?.close?.()
}
