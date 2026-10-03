import { chromium, devices } from 'playwright'
const b = await chromium.launch()
for (const [tag, opt] of [['desktop', { viewport:{width:1440,height:900} }], ['iphone', devices['iPhone 13']]]) {
  const p = await (await b.newContext(opt)).newPage()
  const errs=[]; p.on('pageerror',e=>errs.push(String(e.stack||e).slice(0,400)))
  await p.goto('http://127.0.0.1:4173/')
  await p.evaluate(() => localStorage.setItem('dcsimu:account:session:v1','dcsimu-admin'))
  await p.goto('http://127.0.0.1:4173/admin', { waitUntil:'networkidle' })
  await p.getByRole('button', { name:'Biblioteca 3D' }).first().click()
  await p.waitForTimeout(600)
  await p.getByRole('button', { name:/^Editar( no 3D)?$/ }).first().click()
  await p.waitForTimeout(9000)
  await p.screenshot({ path:`/home/user/shot-${tag}.png` })
  const box = await p.locator('.ce-root').boundingBox().catch(()=>null)
  console.log(tag, 'url', p.url(), 'ce-root box', JSON.stringify(box), 'canvas', await p.locator('canvas').count(), 'erros', errs.join(' | ').slice(0,500)||'0')
}
await b.close()
