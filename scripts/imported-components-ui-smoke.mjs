import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import path from 'node:path'
import {chromium} from 'playwright'

const baseURL=process.env.IMPORTED_TEST_URL||'http://127.0.0.1:5177'
const output=process.env.IMPORTED_TEST_OUTPUT
const browser=await chromium.launch({channel:process.env.IMPORTED_TEST_CHANNEL||'chrome'})
const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'})
await context.route('**/*',route=>{
 const url=new URL(route.request().url())
 return url.origin===new URL(baseURL).origin&&!url.pathname.startsWith('/api/')?route.continue():route.abort()
})
await context.addInitScript(()=>{localStorage.setItem('dcsimu:account:session:v1','dcsimu-admin');localStorage.removeItem('dcsimu:supabase:config:v1')})
const page=await context.newPage(), errors=[]
page.on('pageerror',error=>errors.push(error.message))
const types=['fuseHolderSchneiderDf101v','residualBreakerHagerCfc225p','selectorSchneiderXa2ed33','photoSensorXukt1ksml2']
try{
 await page.goto(baseURL+'/projects/native-partida-direta-v5')
 await page.getByRole('tab',{name:'3D Realista',exact:true}).waitFor({timeout:120000})
 await page.waitForFunction(()=>!document.body.innerText.includes('A carregar o editor'))
 const inserted=await page.evaluate(async types=>{
  const {useSimStore}=await import('/src/store/useSimStore.ts')
  const store=useSimStore.getState();store.newProject()
  types.forEach((type,index)=>store.addComponent(type,650+index*110,600))
  const saved=store.saveJSON();store.newProject();store.loadJSON(saved)
  return useSimStore.getState().components.map(c=>({type:c.type,terminals:c.terminals.map(t=>t.label)}))
 },types)
 assert.deepEqual(inserted.map(c=>c.type),types)
 assert.equal(inserted[1].terminals.length,4)
 assert.equal(inserted[3].terminals.length,3)
 console.log('PASS — inserção e reabertura dos quatro tipos no editor real')
 const search=page.getByRole('textbox',{name:'Pesquisar componentes',exact:true})
 await search.fill('DF101V')
 await page.getByRole('button',{name:/Posicionar Porta-fusível Schneider DF101V/}).waitFor()
 console.log('PASS — componente convertido disponível na biblioteca')
 await search.fill('START 22')
 assert.ok(await page.getByRole('button',{name:/Botão START 22.*Bloqueado/}).isDisabled())
 console.log('PASS — conjunto Inventor sem STEP permanece bloqueado')
 await search.fill('')
 await page.getByRole('button',{name:'Visualização 3D',exact:true}).click()
 await page.waitForTimeout(2500)
 assert.equal(await page.locator('canvas').count()>0,true)
 if(output){await mkdir(output,{recursive:true});await page.screenshot({path:path.join(output,'editor-new-components.png')})}
 assert.deepEqual(errors,[])
 console.log('PASS — painel 3D carregado sem exceções JavaScript')
 await page.goto(baseURL+'/scripts/imported-component-audit.html')
 await page.waitForFunction(()=>window.auditState?.done,{timeout:120000})
 const audit=await page.evaluate(()=>window.auditState)
 assert.equal(audit.ready,14);assert.deepEqual(audit.errors,[])
 if(output)await page.screenshot({path:path.join(output,'cad-14-models.png'),fullPage:true})
 console.log('PASS — os 14 GLB renderizam em frente, topo, lado direito e isométrica')
}finally{await browser.close()}
