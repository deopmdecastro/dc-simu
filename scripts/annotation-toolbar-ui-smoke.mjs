import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

// Anotações nas barras: 2D/3D/GRAFCET, criação, arrasto, persistência e ecrãs pequenos.
const baseURL = process.env.EDITOR3D_TEST_URL || 'http://127.0.0.1:5173'
const output = process.env.EDITOR3D_TEST_OUTPUT
const browser = await chromium.launch(process.env.EDITOR3D_TEST_CHANNEL ? { channel: process.env.EDITOR3D_TEST_CHANNEL } : {})
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
await context.route('**/*', (route) => {
  const url = new URL(route.request().url())
  const local = url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') && url.pathname !== '/version.json'
  const fonts = ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)
    || (url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/gh/lojjic/unicode-font-resolver@'))
  return local || fonts ? route.continue() : route.abort()
})
await context.addInitScript(() => {
  localStorage.removeItem('dcsimu:supabase:config:v1')
  localStorage.setItem('dcsimu:ladder:status-open', '1')
  localStorage.setItem('dcsimu:schematic:sim-open', '0')
  localStorage.setItem('dcsimu:workspace:view', 'schematic')
})
// Monta os componentes reais sem passar por contas, projetos remotos ou configuração Supabase.
await context.route('**/__toolbar-fixture__', (route) => route.fulfill({
  contentType: 'text/html',
  body: '<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>',
}))
const page = await context.newPage()
const errors = []
const nativeDialogs = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('dialog', async (dialog) => { nativeDialogs.push(dialog.type() + ': ' + dialog.message()); await dialog.dismiss() })
const check = (value, message) => { assert.ok(value, message); console.log('PASS — ' + message) }
const capture = async (name, locator) => { if (output) await (locator ?? page).screenshot({ path: path.join(output, name + '.png') }) }
const sim = (source, arg) => page.evaluate(async ([source, arg]) => {
  const { useSimStore } = await import('/src/store/useSimStore.ts')
  return Function('store', 'arg', 'return (' + source + ')(store, arg)')(useSimStore, arg)
}, [source.toString(), arg])
const tabs = () => page.getByRole('tablist', { name: 'Vistas' })
const openView = async (name) => { await tabs().getByRole('tab', { name, exact: true }).click(); await page.waitForTimeout(350) }
try {
  if (output) await fs.mkdir(output, { recursive: true })
  await page.goto(baseURL + '/__toolbar-fixture__')
  await page.evaluate(async () => {
    const refresh = (await import('/@react-refresh')).default
    refresh.injectIntoGlobalHook(window)
    window.$RefreshReg$ = () => {}
    window.$RefreshSig$ = () => (type) => type
    window.__vite_plugin_react_preamble_installed__ = true
    const main = await (await fetch('/src/main.tsx')).text()
    const dependency = (name) => {
      const match = main.match(new RegExp('"([^"\\n]*\\/' + name + '\\.js\\?v=[^"\\n]+)"'))
      if (!match) throw new Error('Dependência Vite não encontrada: ' + name)
      return match[1]
    }
    await Promise.all([...main.matchAll(/import "([^"\n]+\.css(?:\?[^"\n]*)?)"/g)].map((match) => import(match[1])))
    const React = (await import(dependency('react'))).default
    const ReactDOM = (await import(dependency('react-dom_client'))).default
    const { BrowserRouter } = await import(dependency('react-router-dom'))
    const { default: App } = await import('/src/App.tsx')
    const { default: DialogHost } = await import('/src/ui/dialogs.tsx')
    const { useSimStore } = await import('/src/store/useSimStore.ts')
    const { usePlanStore } = await import('/src/saas/usePlan.ts')
    usePlanStore.getState().set({ role: 'admin', plan: null })
    useSimStore.getState().newProject()
    useSimStore.getState().setCurrentProjectName('Anotações na barra')
    document.documentElement.style.height = '100%'
    document.body.style.height = '100%'
    document.getElementById('root').style.height = '100%'
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter, null,
      React.createElement(React.Fragment, null, React.createElement(App, { onBack: () => {} }), React.createElement(DialogHost))))
  })
  await tabs().waitFor()

  // 1) Esquema: Atalhos, Simulação e folhas com nome editável no sítio
  await openView('Esquema')
  await page.setViewportSize({ width: 1920, height: 1000 })
  await page.evaluate(async()=> {
    const {useSimStore}=await import('/src/store/useSimStore.ts')
    const {nativePartidaDiretaContent}=await import('/src/project/nativeProjects.ts')
    useSimStore.getState().loadJSON(JSON.stringify(nativePartidaDiretaContent()))
  })
  const toolbar=page.locator('.dc-toolbar-row2')
  const createNote=async(title)=> {
    await toolbar.getByRole('button',{name:'Comentário',exact:true}).click()
    const dialog=page.getByRole('dialog').filter({has:page.getByRole('textbox',{name:'Título do comentário'})})
    await dialog.getByRole('textbox',{name:'Título do comentário'}).fill(title)
    await dialog.getByRole('textbox',{name:'Nova mensagem'}).fill('Mensagem sintética de validação')
    await dialog.getByRole('button',{name:'Enviar',exact:true}).click()
    await page.getByRole('dialog').filter({has:page.getByRole('textbox',{name:'Título do comentário'})}).getByRole('button',{name:'Fechar',exact:true}).click()
  }
  for(const mode of ['Esquema 2D','Visualização 3D']) {
    await page.getByRole('button',{name:mode,exact:true}).click()
    await page.waitForFunction(async()=> {
      const source=await(await fetch('/src/three/Panel3D.tsx')).text()
      const {_roots}=await import(source.match(/from "([^"]*\/\@react-three_fiber\.js\?v=[^"]+)"/)[1])
      let wired=false;for(const root of _roots.values())root.store.getState().scene.traverse(n=>{if(n.userData.wireEndType)wired=true});return wired
    })
    check(await page.locator('.canvas-annotate').count()===0,mode+': sem botões flutuantes de anotação')
    await createNote('Nota '+mode)
    await toolbar.getByRole('button',{name:'Texto livre',exact:true}).click()
    check(await toolbar.getByRole('button',{name:'Texto livre',exact:true}).getAttribute('aria-pressed')==='true',mode+': colocação de texto assinalada na barra')
    const canvas=page.locator('.panel3d-stage canvas').first(),box=await canvas.boundingBox()
    await page.mouse.click(box.x+box.width*0.15,box.y+box.height*0.18)
    await page.locator('.ctext.is-editing').waitFor()
    await page.locator('.ctext.is-editing').fill('Texto '+mode)
    await page.keyboard.press('Escape')
    check(await sim(store=>store.getState().canvasTexts.length)>0,mode+': texto colocado a partir da barra')
    await capture('annotations-'+(mode==='Esquema 2D'?'2d':'3d'))
  }
  await openView('GRAFCET')
  await createNote('Nota GRAFCET')
  check(await page.locator('[data-grafcet-note]').count()===1,'GRAFCET: comentário visível na folha')
  const noteBefore=await sim(store=>store.getState().canvasNotes.find(n=>n.view==='grafcet'))
  const chip=page.locator('[data-grafcet-note] .cnote-chip'),noteBox=await chip.boundingBox()
  await page.mouse.move(noteBox.x+noteBox.width/2,noteBox.y+noteBox.height/2)
  await page.mouse.down();await page.mouse.move(noteBox.x+noteBox.width/2+90,noteBox.y+noteBox.height/2+40,{steps:8});await page.mouse.up()
  check(await sim((store,id)=>store.getState().canvasNotes.find(n=>n.id===id).x,noteBefore.id)>noteBefore.x,'GRAFCET: nota arrasta-se nas coordenadas do diagrama')
  await toolbar.getByRole('button',{name:'Texto livre',exact:true}).click()
  const graph=await page.locator('.grafcet-canvas').boundingBox()
  await page.mouse.click(graph.x+graph.width*0.7,graph.y+graph.height*0.55)
  await page.getByRole('textbox',{name:'Editar texto do GRAFCET'}).fill('Texto GRAFCET')
  await page.keyboard.press('Escape')
  check(await sim(store=>store.getState().grafcet.comments.some(c=>c.text==='Texto GRAFCET')),'GRAFCET: texto livre funcional na barra')
  await capture('annotations-grafcet')
  const before=await sim(store=>({notes:store.getState().canvasNotes,texts:store.getState().canvasTexts,comments:store.getState().grafcet.comments}))
  await sim(store=>store.getState().loadJSON(store.getState().saveJSON()))
  assert.deepEqual(JSON.parse(JSON.stringify(await sim(store=>({notes:store.getState().canvasNotes,texts:store.getState().canvasTexts,comments:store.getState().grafcet.comments})))),JSON.parse(JSON.stringify(before)))
  for(const width of [1280,768,390]) {
    await page.setViewportSize({width,height:900})
    await page.waitForTimeout(200)
    for(const view of ['Esquema','GRAFCET']) {
      await openView(view)
      if(width<1280) {
        await toolbar.getByRole('button',{name:'Ferramentas',exact:true}).click()
        const menu=page.getByRole('menu').last()
        check(await menu.getByRole('menuitem',{name:/Comentário/}).count()===1&&await menu.getByRole('menuitem',{name:/Texto livre/}).count()===1,`${view}/${width}: anotações no menu da barra`)
        await page.keyboard.press('Escape')
      } else check(await toolbar.getByRole('button',{name:'Comentário',exact:true}).isVisible(),view+': comentário na barra')
      check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${view}/${width}: sem transbordo horizontal`)
    }
    await capture('annotations-mobile-'+width)
  }
  check(errors.length===0,'Sem erros JavaScript')
  check(nativeDialogs.length===0,'Sem caixas de diálogo nativas')
} catch(error) {
  console.error(errors)
  await capture('annotations-failure').catch(()=>{})
  throw error
} finally { await browser.close() }
