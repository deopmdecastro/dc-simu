import { chromium } from 'playwright'

const b = await chromium.launch()
const errs = []

async function openGrafcetProject(p, name) {
  await p.goto('http://127.0.0.1:4173/')
  await p.evaluate(() => localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin'))
  await p.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
  await p.waitForTimeout(900)
  const createBtn = p.getByRole('button', { name: /Novo projeto|Criar projeto/i }).first()
  await createBtn.click()
  await p.waitForTimeout(400)
  await p.locator('.dx-dialog input[type="text"], .dx-dialog input:not([type])').first().fill(name).catch(() => {})
  await p.locator('.dx-dialog button.dx-btn-primary, .dx-dialog-actions .dx-btn-primary').first().click()
  await p.waitForTimeout(1600)
  const grafcetBtn = p.getByRole('button', { name: /GRAFCET/i }).first()
  if (await grafcetBtn.count()) { await grafcetBtn.click().catch(() => {}); await p.waitForTimeout(700) }
  const openEditor = p.getByRole('button', { name: /Abrir editor/i }).first()
  if (await openEditor.count()) { await openEditor.click().catch(() => {}); await p.waitForTimeout(700) }
}

async function drag(p, from, to, shot) {
  await p.mouse.move(from.x, from.y, { steps: 4 })
  await p.mouse.down()
  for (let i = 1; i <= 14; i++) {
    await p.mouse.move(from.x + ((to.x - from.x) * i) / 14, from.y + ((to.y - from.y) * i) / 14)
    await p.waitForTimeout(32)
  }
  if (shot) await p.screenshot({ path: shot })
  await p.mouse.up()
  await p.waitForTimeout(650)
}

async function hudText(p) {
  return await p.locator('.grafcet-canvas-hud').innerText().catch(() => '')
}

async function run(ctxOptions, tag) {
  const ctx = await b.newContext(ctxOptions)
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(`${tag}: ${String(e).slice(0, 200)}`))
  await openGrafcetProject(p, `Demo Ações ${tag}`)

  const exBtn = p.getByRole('button', { name: /exemplo de 3 etapas/i })
  if (await exBtn.count()) { await exBtn.click(); await p.waitForTimeout(900) }

  // ---- 1. Criar etapa SEM transição (tecla 1)
  const before = await hudText(p)
  await p.locator('.grafcet-canvas').first().click({ position: { x: 18, y: 18 } })
  await p.keyboard.press('1')
  await p.waitForTimeout(700)
  const after1 = await hudText(p)
  console.log(`${tag}: HUD antes="${before.replace(/\s+/g,' ')}" depois(1)="${after1.replace(/\s+/g,' ')}"`)
  await p.screenshot({ path: `/home/user/gf2-${tag}-1-step-no-trans.png` })

  // ---- 2. Criar ação SOLTA (tecla 4)
  await p.keyboard.press('4')
  await p.waitForTimeout(700)
  await p.screenshot({ path: `/home/user/gf2-${tag}-2-free-action.png` })

  // ---- 3. Arrastar a ação solta sobre a etapa 2 (anexar por aproximação)
  const freeBox = await p.locator('.grafcet-action-free rect[stroke-dasharray], .grafcet-action-free').first().boundingBox().catch(() => null)
  const nodes = p.locator('.grafcet-graph-node')
  const node2 = await nodes.nth(2).boundingBox().catch(() => null)
  if (freeBox && node2) {
    await drag(p, { x: freeBox.x + freeBox.width / 2, y: freeBox.y + freeBox.height / 2 }, { x: node2.x + node2.width / 2, y: node2.y + node2.height / 2 }, `/home/user/gf2-${tag}-3-action-drag.png`)
  } else {
    console.log(`${tag}: AVISO — sem caixa de ação solta ou etapa 2`)
  }
  await p.screenshot({ path: `/home/user/gf2-${tag}-4-action-attached.png` })

  // ---- 4. Criar outra ação solta e LIGAR POR LINHA do porto roxo da etapa
  await p.keyboard.press('4')
  await p.waitForTimeout(600)
  await p.keyboard.press('l')
  await p.waitForTimeout(500)
  await p.screenshot({ path: `/home/user/gf2-${tag}-5-connect.png` })
  const actionPorts = p.locator('.grafcet-graph-node .grafcet-port.is-action')
  const freeIn = p.locator('.grafcet-action-free .grafcet-port.is-in').first()
  const portBox = await actionPorts.nth(0).boundingBox().catch(() => null)
  const freeInBox = await freeIn.boundingBox().catch(() => null)
  console.log(`${tag}: portos de ação na etapa = ${await actionPorts.count()}, porto da ação solta = ${freeInBox ? 'ok' : 'FALTA'}`)
  if (portBox && freeInBox) {
    await drag(p, { x: portBox.x + portBox.width / 2, y: portBox.y + portBox.height / 2 }, { x: freeInBox.x + freeInBox.width / 2, y: freeInBox.y + freeInBox.height / 2 }, `/home/user/gf2-${tag}-6-action-wiring.png`)
  }
  await p.screenshot({ path: `/home/user/gf2-${tag}-7-action-wired.png` })

  // ---- 5. Desanexar uma ação da etapa Q1 (arrastar a caixa para fora)
  await p.keyboard.press('v')
  await p.waitForTimeout(300)
  const attached = p.locator('.grafcet-graph-action:not(.grafcet-action-free)').first()
  const aBox = await attached.boundingBox().catch(() => null)
  if (aBox) {
    await drag(p, { x: aBox.x + aBox.width / 2, y: aBox.y + aBox.height / 2 }, { x: aBox.x + aBox.width / 2, y: aBox.y + 320 }, undefined)
    await p.waitForTimeout(400)
  }
  await p.screenshot({ path: `/home/user/gf2-${tag}-8-action-detached.png` })
  console.log(`${tag}: ok`)
  await ctx.close()
}

await run({ viewport: { width: 1440, height: 900 } }, 'desktop')
await run({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, 'mobile')
console.log('erros:', errs.join(' | ') || '0')
await b.close()
