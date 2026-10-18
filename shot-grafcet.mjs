import { chromium, devices } from 'playwright'

const b = await chromium.launch()
const errs = []

async function openGrafcetProject(p, name) {
  await p.goto('http://127.0.0.1:4173/')
  await p.evaluate(() => localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin'))
  await p.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
  await p.waitForTimeout(1000)

  // Criar projeto GRAFCET se o dashboard estiver vazio; senão abrir o existente.
  const createBtn = p.getByRole('button', { name: /Novo projeto|Criar projeto/i }).first()
  await createBtn.click()
  await p.waitForTimeout(500)
  await p.getByPlaceholder(/Nome do projeto|Ex\./i).first().fill(name).catch(async () => {
    await p.locator('.dx-dialog input[type="text"], .dx-dialog input:not([type])').first().fill(name)
  })
  // Escolher tipo GRAFCET se existir seletor
  const kindOption = p.locator('.dx-kind', { hasText: /GRAFCET/i }).first()
  if (await kindOption.count()) await kindOption.click().catch(() => {})
  await p.locator('.dx-dialog button.dx-btn-primary, .dx-dialog-actions .dx-btn-primary').first().click()
  await p.waitForTimeout(1800)

  // Garantir que estamos na vista GRAFCET: qualquer botão/tab/chip com o nome GRAFCET, e depois "Abrir editor"
  const grafcetBtn = p.getByRole('button', { name: /GRAFCET/i }).first()
  if (await grafcetBtn.count()) {
    await grafcetBtn.click().catch(() => {})
    await p.waitForTimeout(900)
  }
  const openEditor = p.getByRole('button', { name: /Abrir editor/i }).first()
  if (await openEditor.count()) {
    await openEditor.click().catch(() => {})
    await p.waitForTimeout(900)
  }
}

async function run(ctxOptions, tag) {
  const ctx = await b.newContext(ctxOptions)
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(`${tag}: ${String(e).slice(0, 160)}`))
  await openGrafcetProject(p, `Demo GRAFCET ${tag}`)

  // Carregar o exemplo de 3 etapas (estado vazio)
  const exBtn = p.getByRole('button', { name: /exemplo de 3 etapas/i })
  if (await exBtn.count()) {
    await exBtn.click()
    await p.waitForTimeout(900)
  }
  await p.screenshot({ path: `/home/user/gf-${tag}-1-example.png` })

  // ---- 1. Criar transição SOLTA (tecla T)
  await p.locator('.grafcet-canvas').first().click({ position: { x: 20, y: 20 } })
  await p.keyboard.press('t')
  await p.waitForTimeout(700)
  await p.screenshot({ path: `/home/user/gf-${tag}-2-free.png` })

  // ---- 2. Arrastar a barra solta sobre uma etapa (ligar origem)
  const stub = p.locator('.grafcet-free-port').first()
  const nodes = p.locator('.grafcet-graph-node')
  const stubBox = await stub.boundingBox()
  const nodeBox = await nodes.nth(0).boundingBox()
  if (stubBox && nodeBox) {
    await p.mouse.move(stubBox.x + 6, stubBox.y + stubBox.height) // barra (junto ao stub inferior)
    await p.mouse.down()
    // Arrastar a BARRA (centro aproximado) para a metade INFERIOR da etapa 1 → vira origem? não: metade de cima da barra = origem...
    // Soltar com a barra DEBAIXO da etapa → a etapa fica como ORIGEM.
    const tx = nodeBox.x + nodeBox.width / 2
    const ty = nodeBox.y + nodeBox.height + 24
    for (let i = 1; i <= 12; i++) {
      await p.mouse.move(stubBox.x + ((tx - stubBox.x) * i) / 12, stubBox.y + ((ty - stubBox.y) * i) / 12)
      await p.waitForTimeout(30)
    }
    await p.screenshot({ path: `/home/user/gf-${tag}-3-dragging.png` })
    await p.mouse.up()
    await p.waitForTimeout(700)
  }
  await p.screenshot({ path: `/home/user/gf-${tag}-4-attached.png` })

  // ---- 3. Ferramenta Ligar: fio de uma saída para um destino
  await p.keyboard.press('l')
  await p.waitForTimeout(500)
  await p.screenshot({ path: `/home/user/gf-${tag}-5-connect-mode.png` })
  const outPorts = p.locator('.grafcet-graph-node .grafcet-port.is-out')
  const outCount = await outPorts.count()
  console.log(`${tag}: portos de saída visíveis =`, outCount)
  if (outCount >= 2) {
    const a = await outPorts.nth(0).boundingBox()
    const c = await nodes.nth(2).boundingBox()
    if (a && c) {
      await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2, { steps: 4 })
      await p.mouse.down()
      for (let i = 1; i <= 10; i++) {
        await p.mouse.move(a.x + ((c.x + c.width / 2 - a.x) * i) / 10, a.y + ((c.y + 8 - a.y) * i) / 10)
        await p.waitForTimeout(40)
      }
      await p.screenshot({ path: `/home/user/gf-${tag}-6-wiring.png` })
      await p.mouse.up()
      await p.waitForTimeout(700)
    }
  }
  await p.screenshot({ path: `/home/user/gf-${tag}-7-wired.png` })
  console.log(`${tag}: ok`)
  await ctx.close()
}

await run({ viewport: { width: 1440, height: 900 } }, 'desktop')
await run({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, "mobile")
console.log('erros:', errs.join(' | ') || '0')
await b.close()
