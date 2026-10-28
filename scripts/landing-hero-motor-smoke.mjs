/**
 * Smoke estrutural do hero da landing: só o motor real 3D (SEW DRN80MK4-B3),
 * vista isométrica, ventoinha a rodar, vistas giráveis por arraste — sem o
 * quadro simulador (sem HUD LOGO!, sem botões de simulação).
 *
 * Atualizado: 2026-10-28
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd())
const read = (p) => readFileSync(resolve(root, p), 'utf8')

let failures = 0
const assert = (note, cond) => {
  if (cond) console.log(`PASS — ${note}`)
  else { failures++; console.error(`FAIL — ${note}`) }
}

const heroPath = 'src/three/LandingMotorHero.tsx'
assert('LandingMotorHero existe', existsSync(resolve(root, heroPath)))
const hero = existsSync(resolve(root, heroPath)) ? read(heroPath) : ''

assert('Usa o GLB real do motor3ph (catálogo)', hero.includes("'motor3ph'") && hero.includes('getComponentModelSpec') && hero.includes('useGLTF(spec.path)'))
assert('Mesmo acabamento CAD do showcase (helpers partilhados)', /preparedModel, cloneMaterials, applyModelState[\s\S]*from '\.\/LandingShowcase'/.test(hero))
assert('Ventoinha do veio sempre em marcha', hero.includes('MotorShaftFan3D') && /rpmVisual:\s*0\.9/.test(hero))
assert('Vista isométrica por omissão', /camera=\{\{\s*position:\s*\[2\.5,\s*2\.1,\s*2\.5\]/.test(hero))
assert('Vistas giráveis por arraste (OrbitControls, sem zoom/pan)', hero.includes('<OrbitControls') && hero.includes('enablePan={false}') && hero.includes('enableZoom={false}'))
assert('Auto-rotação suave em repouso', hero.includes('autoRotate') && /autoRotateSpeed=\{0\.7\}/.test(hero))
assert('Dica «Arraste para girar»', hero.includes('dx-motor-hero-hint'))
assert('Chão/base discreto e sombras de contacto', hero.includes('ContactShadows'))

const landing = read('src/landing/Landing.tsx')
assert('HeroViewport monta o motor em vez do simulador', landing.includes('<LandingMotorHero />') && !landing.includes("LandingShowcase"))
assert('Moldura de motor: chip «Modelo GLB da biblioteca»', landing.includes('dx-window-motor') && landing.includes('dx-window-chip'))
assert('HeroViewport já não liga o simulador (plcRunning/motorOn fora da moldura)', !/const \[plcRunning/.test(landing.split('/* ================================================================ página */')[0].slice(landing.indexOf('HeroViewport'))))

const showcase = read('src/three/LandingShowcase.tsx')
assert('Helpers exportados para reutilização', showcase.includes('export function preparedModel') && showcase.includes('export function cloneMaterials') && showcase.includes('export function applyModelState'))

const css = read('src/styles/dx-landing.css')
assert('CSS do hero motor presente', css.includes('.dx-motor-hero') && css.includes('.dx-motor-hero-hint') && css.includes('.dx-window-chip'))

if (failures) {
  console.error(`\n❌ ${failures} falha(s) no contrato do hero com motor 3D`)
  process.exit(1)
}
console.log('\n✅ TODOS OS TESTES PASSARAM')
