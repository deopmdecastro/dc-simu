import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const baseURL = process.env.WORKSPACE_PANELS_TEST_URL || process.env.EDITOR3D_TEST_URL || 'http://127.0.0.1:5173'
const output = process.env.WORKSPACE_PANELS_TEST_OUTPUT || path.resolve('../../../runtime/dcsimu-workspace-panels-ui')
const browser = await chromium.launch(process.env.EDITOR3D_TEST_CHANNEL ? { channel:process.env.EDITOR3D_TEST_CHANNEL } : {})
const context = await browser.newContext({ viewport:{ width:1440,height:1000 }, serviceWorkers:'block' })
await context.route('**/*', (route) => {
  const url = new URL(route.request().url())
  const local = url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') && url.pathname !== '/version.json'
  const font = ['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname) || (url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/gh/lojjic/unicode-font-resolver@'))
  return local || font ? route.continue() : route.abort()
})
await context.route('**/__workspace-panels-fixture__', (route) => route.fulfill({ contentType:'text/html', body:'<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>' }))
await context.addInitScript(() => {
  localStorage.setItem('dcsimu:workspace:view','grafcet')
  localStorage.setItem('dcsimu:grafcet:palette','0')
  localStorage.setItem('dcsimu:ladder:status-open','1')
  localStorage.setItem('dcsimu:schematic:sim-open','0')
})
const page = await context.newPage()
const errors = []
page.on('pageerror',(error) => errors.push(error.message))
const check = (ok,message) => { assert.ok(ok,message); console.log('PASS — '+message) }
const state = (fn,arg) => page.evaluate(async ([source,arg]) => {
  const { useSimStore } = await import('/src/store/useSimStore.ts')
  return Function('store','arg','return ('+source+')(store,arg)')(useSimStore,arg)
},[fn.toString(),arg])
const view = async (name) => {
  await page.getByRole('tablist',{name:'Vistas'}).getByRole('tab',{name,exact:true}).click()
  await page.waitForTimeout(150)
}
const capture = (name) => page.screenshot({ path:path.join(output,name+'.png') })
const openSimulation = async () => {
  const button = page.locator('[data-sim-toggle="grafcet"]')
  if (await button.getAttribute('aria-pressed') !== 'true') await button.click()
  await page.locator('[data-grafcet-sim-dock].is-open .simulation-signals').waitFor()
}
const reached = async (locator,container) => {
  await locator.scrollIntoViewIfNeeded()
  return locator.evaluate((el,selector) => {
    const rect = el.getBoundingClientRect(), parent = el.closest(selector).getBoundingClientRect()
    return rect.width > 0 && rect.height > 0 && rect.bottom <= parent.bottom+2 && rect.top >= parent.top-2
  },container)
}

try {
  await fs.mkdir(output,{recursive:true})
  await page.goto(baseURL+'/__workspace-panels-fixture__')
  await page.evaluate(async () => {
    const refresh=(await import('/@react-refresh')).default
    refresh.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true
    const main=await (await fetch('/src/main.tsx')).text()
    const dep=(name)=> { const found=main.match(new RegExp('"([^"\\n]*\\/'+name+'\\.js\\?v=[^"\\n]+)"')); if(!found)throw Error('Dependência Vite: '+name); return found[1] }
    await Promise.all([...main.matchAll(/import "([^"\n]+\.css(?:\?[^"\n]*)?)"/g)].map(match=>import(match[1])))
    const React=(await import(dep('react'))).default, ReactDOM=(await import(dep('react-dom_client'))).default
    const { BrowserRouter }=await import(dep('react-router-dom'))
    const { default:App }=await import('/src/App.tsx'), { default:DialogHost }=await import('/src/ui/dialogs.tsx')
    const { useSimStore }=await import('/src/store/useSimStore.ts'), { usePlanStore }=await import('/src/saas/usePlan.ts')
    const { nativePartidaDiretaContent }=await import('/src/project/nativeProjects.ts')
    usePlanStore.getState().set({role:'admin',plan:null})
    useSimStore.getState().loadJSON(JSON.stringify(nativePartidaDiretaContent()))
    useSimStore.getState().setCurrentProjectName('Partida direta — teste local')
    for(let i=0;i<5;i++) useSimStore.getState().step()
    document.documentElement.style.height='100%'; document.body.style.height='100%'; document.getElementById('root').style.height='100%'
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement(React.Fragment,null,React.createElement(App,{onBack:()=>{}}),React.createElement(DialogHost))))
  })
  await page.locator('[data-sim-toggle="grafcet"]').waitFor()
  await openSimulation()
  const properties=page.locator('[data-grafcet-sim-dock]')
  const inspector=page.locator('.grafcet-properties')
  check(await properties.getByRole('tab',{name:'Entradas/Saídas',exact:true}).getAttribute('aria-selected')==='true','Simulação abre Entradas/Saídas no painel inferior')
  check(await properties.locator('[data-plc-sim="native-plc"]').count()===1,'GRAFCET reutiliza o painel do PLC nativo')
  const scans=await state(store=>store.getState().sim.scanCount)
  await properties.locator('[data-plc-input="I0.1"] .vio-switch').click()
  check(await state(store=>Boolean(store.getState().components.find(c=>c.id==='native-plc').state.simInputs['I0.1'])),'START injeta no PLC real, também em STOP')
  check(await state(store=>store.getState().sim.scanCount)>scans,'Injetar em STOP executa um ciclo')
  for(let i=0;i<3;i++) await properties.getByRole('button',{name:'Passo',exact:true}).click()
  check(await state(store=>Boolean(store.getState().runtime.table['Q0.0'])),'START liga Q0.0 no PLC nativo')
  check(await properties.locator('[data-plc-output="Q0.0"]').getAttribute('class').then(v=>v.includes('is-on')),'Saída Q0.0 aparece ativa no painel GRAFCET')
  await state(store=>{const s=store.getState(); store.setState({grafcet:{...s.grafcet,transitions:s.grafcet.transitions.map((tr,i)=>i===0?{...tr,condition:tr.condition+'*PERMISSIVE'}:tr)}})})
  await properties.getByRole('tab',{name:'Sequência',exact:true}).click()
  await properties.locator('.gsim-custom-inputs > summary').click()
  await properties.locator('.gsim-actuator[title^="PERMISSIVE"]').click()
  check(await state(store=>Boolean(store.getState().virtualInputs.PERMISSIVE)),'Símbolos adicionais continuam acessíveis em projetos com PLC')
  await state(store=>{const s=store.getState(); store.setState({grafcet:{...s.grafcet,transitions:s.grafcet.transitions.map(tr=>({...tr,condition:tr.condition.replace('*PERMISSIVE','')}))}})})
  await properties.getByRole('tab',{name:'Entradas/Saídas',exact:true}).click()
  await properties.getByRole('button',{name:'Run',exact:true}).click()
  await view('Esquema')
  check(await state(store=>store.getState().sim.runState==='running'),'Trocar GRAFCET → Esquema mantém RUN')
  await view('GRAFCET')
  await openSimulation()
  check(await state(store=>store.getState().sim.runState==='running'),'Reabrir GRAFCET mantém RUN')

  for(const width of [1440,1024,768,390,375]) {
    await page.setViewportSize({width,height:width<500?844:1000})
    await page.evaluate(async(clean)=>(await import('/src/ui/cleanMode.ts')).setCleanMode(clean),width<1200)
    await openSimulation()
    await page.waitForTimeout(150)
    const body=properties.locator('.gdock-body')
    const dimensions=await body.evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth,height:el.clientHeight}))
    check(dimensions.height>70 && dimensions.scroll<=dimensions.client+2,`${width}px: corpo E/S com altura útil, sem corte horizontal`)
    check(await properties.getByRole('tab',{name:'Sequência',exact:true}).isVisible(),`${width}px: separadores da simulação acessíveis`)
    await body.evaluate(el=>{el.scrollTop=0})
    const firstInput=await properties.locator('[data-plc-input="I0.0"] .vio-switch').boundingBox()
    const bodyBox=await body.boundingBox()
    check(firstInput && firstInput.y+firstInput.height<=bodyBox.y+bodyBox.height+2,`${width}px: primeira entrada visível ao abrir`)
    check(await reached(properties.locator('[data-plc-output="Q0.0"]'),'.gdock-body'),`${width}px: saídas Q alcançáveis por scroll`)
    const transport=width>800 ? properties.getByRole('button',{name:'Run',exact:true}) : page.getByRole('button',{name:'Play',exact:true})
    check(await transport.isVisible(),`${width}px: transporte continua visível`)
    await capture(`grafcet-io-${width}`)
    if (!await inspector.evaluate(el=>el.classList.contains('is-open'))) await inspector.locator('.dc-side-panel-toggle').click()
    await inspector.getByRole('tab',{name:/^Sinais/}).click()
    check(await inspector.locator('.grafcet-signals-actions').getByRole('button',{name:/Tabela completa/}).isVisible(),`${width}px: ações da tabela de sinais acessíveis`)
    await capture(`grafcet-signals-${width}`)
    await inspector.locator('.dc-side-panel-toggle').click()
    await properties.getByRole('button',{name:'Recolher a simulação',exact:true}).click()
    check(await page.locator('[data-sim-toggle="grafcet"]').getAttribute('aria-pressed')==='false',`${width}px: recolher E/S atualiza botão`)
    check(await state(store=>store.getState().sim.runState==='running'),`${width}px: recolher E/S preserva RUN`)
    await openSimulation()
    await view('Ladder')
    const ladder=page.locator('.ladder-bottom-panel')
    const sections=page.getByRole('combobox',{name:'Secção do estado do PLC'})
    const sectionBox=await sections.boundingBox()
    check(await sections.isVisible() && sectionBox.width>100,`${width}px: oito secções Ladder acessíveis`)
    for(const option of ['memory','timers','counters','force','debug','compile','lint','io']) await sections.selectOption(option)
    check(await reached(ladder.locator('[data-plc-output="Q0.0"]'),'.ladder-status-grid'),`${width}px: saídas Ladder alcançáveis`)
    await capture(`ladder-io-${width}`)
    await view('GRAFCET')
  }
  await state(store=>store.getState().stop())
  await page.evaluate(async()=> {
    const { nativePartidaDiretaContent }=await import('/src/project/nativeProjects.ts')
    const { useSimStore }=await import('/src/store/useSimStore.ts')
    const content=nativePartidaDiretaContent()
    content.projectKind='grafcet'; content.components=[]; content.wires=[]; content.activePlcId=null; content.plcPrograms={}; content.projectFiles=[]; content.ladder={rungs:[]}
    useSimStore.getState().loadJSON(JSON.stringify(content))
    useSimStore.getState().setVirtualInput('I0.0',true); useSimStore.getState().setVirtualInput('I0.2',true)
  })
  await openSimulation()
  check(await properties.locator('[aria-label="Entradas e saídas virtuais"]').count()===1,'GRAFCET puro usa E/S virtuais compartilhadas')
  await properties.locator('.vio-switch[title^="I0.1"]').click()
  check(await state(store=>Boolean(store.getState().virtualInputs['I0.1'])),'Entrada virtual registada sem energizar circuito em STOP')
  check(await state(store=>!store.getState().runtime.table['Q0.0']),'Em STOP a saída Q0.0 mantém-se desligada até clicar Start')
  await state(store=>{store.getState().play(); store.getState().step()})
  check(await state(store=>Boolean(store.getState().runtime.table['Q0.0'])),'Ao clicar Start o GRAFCET puro executa e liga Q0.0')
  await state(store=>store.getState().stop())
  await capture('grafcet-virtual-375')
  await page.getByRole('button',{name:'Ferramentas',exact:true}).click()
  await page.getByRole('menuitem',{name:/^Texto livre/}).click()
  const canvas=await page.locator('.grafcet-canvas svg').first().boundingBox()
  await page.mouse.click(canvas.x+canvas.width*0.7,canvas.y+canvas.height*0.25)
  const textEditor=page.getByRole('textbox',{name:'Editar texto do GRAFCET',exact:true})
  await textEditor.fill('Nota sintética de validação')
  await textEditor.press('Control+Enter')
  check(await state(store=>store.getState().grafcet.comments.some(item=>item.text==='Nota sintética de validação')),'Texto livre é criado e editado através do menu no telemóvel')
  await state(store=>{const saved=store.getState().saveJSON(); store.getState().loadJSON(saved)})
  check(await state(store=>store.getState().grafcet.comments.some(item=>item.text==='Nota sintética de validação')),'Texto GRAFCET sobrevive a guardar e reabrir o projeto')
  await capture('grafcet-free-text-375')
  check(errors.length===0,'Sem erros JavaScript'+(errors.length?': '+errors.join(' | '):''))
  console.log('OK — painéis GRAFCET/PLC/virtual/Ladder em cinco larguras')
} catch(error) {
  await capture('failure').catch(()=>{})
  throw error
} finally { await browser.close() }
