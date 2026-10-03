import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await (await b.newContext()).newPage()
const errs = []
p.on('pageerror', (e) => errs.push('ERRO '+ (e.stack||String(e)).slice(0,2000)))
await p.goto('http://127.0.0.1:4173/')
await p.evaluate(() => localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin'))
await p.goto('http://127.0.0.1:4173/dashboard', { waitUntil: 'networkidle' })
await p.getByRole('button', { name: 'Criar projeto' }).first().click()
await p.waitForTimeout(500)
const inp = p.locator('input[type=text], input:not([type])').first()
await inp.fill('Teste').catch(()=>{})
await p.getByRole('button', { name: 'Criar projeto' }).last().click()
await p.waitForTimeout(6000)
console.log('URL', p.url())
const btns = (await p.getByRole('button').allInnerTexts()).map(s=>s.replace(/\n/g,' ')).filter(Boolean)
console.log('botoes:', btns.join(' | ').slice(0,1500))
console.log('erros:', errs.join('\n').slice(0,1500) || 'nenhum')

const [np] = await Promise.all([
  p.context().waitForEvent('page').catch(()=>null),
  p.getByRole('button',{name:/Abrir editor/}).first().click(),
])
await p.waitForTimeout(6000)
const t = np || p
if (np) np.on('pageerror', e => errs.push('NEWPAGE '+String(e.stack||e).slice(0,1500)))
console.log('nova aba?', !!np, 'URL', t.url())
await t.waitForTimeout(5000)
console.log('corpo:', (await t.innerText('body')).slice(0,300).replace(/\n/g,' | '))
console.log('ce-root', await t.locator('.ce-root').count(), 'canvas', await t.locator('canvas').count())
console.log('ERROS FINAIS:', errs.join('\n').slice(0,2500) || 'nenhum')
await b.close()
