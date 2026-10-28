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

assert('Pá montada no sítio real do veio (MOTOR_FAN.hubX do editor)', hero.includes('MOTOR_FAN.hubX') && hero.includes('MOTOR_CAD.minY'))
assert('Usa o GLB real do motor3ph (catálogo)', hero.includes("'motor3ph'") && hero.includes('getComponentModelSpec') && hero.includes('useGLTF(spec.path)'))
assert('Mesmo acabamento CAD do showcase (helpers partilhados)', /preparedModel, cloneMaterials, applyModelState[\s\S]*from '\.\/LandingShowcase'/.test(hero))
assert('Pás do veio sempre em marcha e em sentido horário', hero.includes('MotorShaftFan3D') && /rpmVisual:\s*0\.9/.test(hero) && hero.includes("direction: 'cw'"))
assert('Vista isométrica por omissão (FitIsoCamera, direção 1,0.82,1)', hero.includes('FitIsoCamera') && /ISO_DIR\s*=\s*new THREE\.Vector3\(1,\s*0\.82,\s*1\)/.test(hero))
assert('Vistas giráveis por arraste (OrbitControls, sem zoom/pan)', hero.includes('<OrbitControls') && hero.includes('enablePan={false}') && hero.includes('enableZoom={false}'))
assert('A câmara não roda sozinha — só o utilizador gira (sem autoRotate)', !hero.includes('autoRotate'))
assert('Dica «Arraste para girar»', hero.includes('dx-motor-hero-hint'))
assert('Sombras de contacto subtis (sem plinta/cartão)', hero.includes('ContactShadows') && !hero.includes('meshStandardMaterial color="#e2e8f0"'))

const landing = read('src/landing/Landing.tsx')
assert('HeroViewport monta o motor em vez do simulador', landing.includes('<LandingMotorHero />') && !landing.includes("LandingShowcase"))
assert('HeroViewport já não usa moldura/cartão', landing.includes('dx-hero-motor') && !landing.includes('dx-window-motor'))
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
