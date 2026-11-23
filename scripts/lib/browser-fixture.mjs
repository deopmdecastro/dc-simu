import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

/** Isolated real React UI, Vite modules, and zero external requests. */
export async function browserFixture({ baseURL = 'http://127.0.0.1:5173', output, height = 900 } = {}) {
  if (output) await mkdir(output, { recursive: true })
  const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  const context = await browser.newContext({ viewport: { width: 1440, height }, serviceWorkers: 'block' })
  const origin = new URL(baseURL).origin
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    return url.origin === origin && !url.pathname.startsWith('/api/') && url.pathname !== '/version.json' ? route.continue() : route.abort()
  })
  await context.route('**/__real-react-fixture__', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="pt"><head><meta charset="utf-8"></head><body style="margin:0"><div id="root" style="height:${height}px;width:100vw"></div></body></html>` }))
  const page = await context.newPage(), errors = []
  page.setDefaultTimeout(30000)
  page.on('pageerror', error => errors.push(error.stack || error.message))
  page.on('console', m => { if (/Invalid hook call|Rendered (?:more|fewer) hooks|change in the order of Hooks|THREE.WebGLProgram: Shader Error/.test(m.text())) errors.push(m.text()) })
  const reload = async () => {
  await page.goto(baseURL + '/__real-react-fixture__')
  await page.evaluate(async () => {
    performance.setResourceTimingBufferSize(10000)
    const refresh = (await import('/@react-refresh')).default
    refresh.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type
    window.__vite_plugin_react_preamble_installed__ = true
    localStorage.setItem('dcsimu:account:session:v1', 'dcsimu-admin')
    localStorage.setItem('dc-simu:panel3d:grid', '0')
    localStorage.setItem('dcsimu:grafcet:autosync', '0')
    const main = await (await fetch('/src/main.tsx')).text()
    const dependency = name => {
      const match = main.match(new RegExp('"([^"\\n]*\\/' + name + '\\.js\\?v=[^"\\n]+)"'))
      if (!match) throw new Error('Vite dependency not found: ' + name)
      return match[1]
    }
    await Promise.all([...main.matchAll(/import "([^"\n]+\.css(?:\?[^"\n]*)?)"/g)].map(m => import(m[1])))
    window.__fixtureReact = (await import(dependency('react'))).default
    const ReactDOM = (await import(dependency('react-dom_client'))).default
    window.__fixtureRoot = ReactDOM.createRoot(document.getElementById('root'))
    const imports = new Map(), resolvedImports = new Map()
    window.__fixtureImport = path => {
      if(imports.has(path))return imports.get(path)
      const hit = performance.getEntriesByType('resource').map(e => e.name).filter(url => new URL(url).pathname === path).pop()
      const module=import(hit || path).then(value=>{resolvedImports.set(path,value);return value});imports.set(path,module);return module
    }
    // waitForFunction must use a synchronous predicate. In Playwright an
    // async predicate's Promise is truthy even when it resolves to false.
    window.__fixtureModule = path => {
      if(!resolvedImports.has(path))throw new Error('Fixture module was not preloaded: '+path)
      return resolvedImports.get(path)
    }
    window.__fixtureFrames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
  }
  await reload()
  let count = 0
  const check = (value, label) => { assert.ok(value, label); count++; console.log('PASS — ' + label) }
  const stable = () => check(!errors.length, 'No React/WebGL exceptions: ' + (errors.join(' | ') || 'OK'))
  return { browser, context, page, errors, check, stable, reload, count: () => count }
}
