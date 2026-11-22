// Exercita o getter que falhava depois de compilar/minificar com Rollup/Vite.
// Não altera autenticação nem exige uma sessão cloud para testar a biblioteca.
import assert from 'node:assert/strict'
import path from 'node:path'
import { mkdir,writeFile,readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { build } from 'vite'

const dir=path.resolve('runtime/tdz-maquette/compiled')
await mkdir(dir,{recursive:true})
const entry=path.join(dir,'entry.ts')
await writeFile(entry,`
import {READY_MAQUETTES} from '../../../src/electrical/readyMaquettes'
import {stampingWallPanelContent} from '../../../src/electrical/stampingWallPanel'
export function counts(){return READY_MAQUETTES.map(m=>({id:m.id,count:m.componentCount,types:m.types.length}))}
export function panel(){const p=stampingWallPanelContent('build-');return {components:p.components.length,wires:p.wires.length}}
`)
const config=(outDir=dir,plugins=[])=>({
  configFile:false,publicDir:false,logLevel:'warn',plugins,
  define:{'import.meta.env':'{}'},
  build:{
    outDir,emptyOutDir:false,minify:'esbuild',target:'es2022',
    lib:{entry,formats:['es'],fileName:()=> 'maquette-runtime.mjs'},
    rollupOptions:{external:id=>!id.startsWith('\0')&&!id.startsWith('.')&&!path.isAbsolute(id)},
  },
})
await build(config())
const compiled=await import(pathToFileURL(path.join(dir,'maquette-runtime.mjs')).href)
const first=compiled.counts()
assert.equal(first.find(m=>m.id==='atec-estampagem').count,147)
assert.equal(first.find(m=>m.id==='atec-bancada').count,6)
console.log('PASS — getter componentCount do bundle minificado calcula 147 e 6 componentes')
assert.deepEqual(compiled.counts(),first)
console.log('PASS — leitura repetida da Biblioteca conserva as contagens')
const panel=compiled.panel()
assert.equal(panel.components,50)
assert.ok(panel.wires>0)
console.log('PASS — construção direta do QGD minificado cria componentes e cabos sem TDZ')
await writeFile(path.resolve('runtime/tdz-maquette/minified-result.json'),JSON.stringify({ok:true,counts:first,panel},null,2)+'\n')

// Diagnóstico opcional: confirma que o mesmo teste deteta o defeito no fonte
// original previamente guardado. Não depende de Git nem da rede no build normal.
if(process.argv.includes('--verify-published')){
  const original=await readFile('runtime/tdz-maquette/old/src/electrical/stampingWallPanel.ts','utf8')
  const baselineDir=path.resolve('runtime/tdz-maquette/published-compiled')
  await build(config(baselineDir,[{name:'published-tdz-baseline',load(id){if(id.replaceAll('\\','/').endsWith('/src/electrical/stampingWallPanel.ts'))return original}}]))
  const baseline=await import(pathToFileURL(path.join(baselineDir,'maquette-runtime.mjs')).href)
  assert.throws(()=>baseline.counts(),/Cannot access .+ before initialization/)
  console.log('PASS — o mesmo teste reproduz e deteta a TDZ do fonte publicado')
}
