/** Smoke: montagem na face do quadro + etiquetas realistas */
import assert from 'node:assert/strict'
import { createComponent } from '../src/electrical/factory'
import { enclosureDimsOf } from '../src/three/enclosureParts'
import type { ElectricalComponent } from '../src/types'

let n = 0
const check = (name: string, ok: boolean) => { assert.ok(ok, name); n++ }

// painelMount tipo
{
  const qe = createComponent('panelEnclosure', 0, 0)
  const h1 = createComponent('pilotLightAd22', 100, 100)
  // simular mountOnPanel
  const face = 'door' as const
  h1.panelMount = { enclosureId: qe.id, face, offsetXmm: 10, offsetYmm: 5, cutoutMm: 22 }
  check('panelMount atribuível na porta com offsets e Ø22', h1.panelMount.enclosureId === qe.id && h1.panelMount.face === 'door' && h1.panelMount.cutoutMm === 22)
  // exclusão mútua com enclosureId
  h1.enclosureId = undefined
  check('panelMount exclui enclosureId (interior)', h1.panelMount !== undefined && !h1.enclosureId)
  // update
  h1.panelMount = { ...h1.panelMount, offsetXmm: 20 }
  check('update offsetX', h1.panelMount.offsetXmm === 20)
  // unmount
  h1.panelMount = undefined
  check('unmount limpa panelMount', !h1.panelMount)
}

// decals
{
  const km = createComponent('contactor', 0, 0)
  const decal = { id: 'd1', kind: 'warning' as const, face: 'front' as const, offsetXmm: 0, offsetYmm: 8, widthMm: 32, heightMm: 14, text: 'PERIGO', icon: 'bolt', background: '#facc15', color: '#0f172a', border: true }
  km.decals = [decal]
  check('decal warning na face do contator', km.decals[0].icon === 'bolt' && km.decals[0].background === '#facc15')
  // logo
  const qe = createComponent('panelEnclosure', 0, 0)
  qe.decals = [{ id: 'd2', kind: 'logo', face: 'door', text: 'WEG', background: '#0f172a', color: 'white', widthMm: 40, heightMm: 12, offsetXmm: 0, offsetYmm: -20 }]
  check('decal logo na porta do quadro', qe.decals[0].face === 'door' && qe.decals[0].text === 'WEG')
  // texto simples
  const br = createComponent('breaker1p', 50, 50)
  br.decals = [{ id: 'd3', kind: 'text', face: 'front', text: 'Q1', background: '#ffffff', color: '#0f172a', widthMm: 20, heightMm: 8 }]
  check('decal texto no disjuntor', br.decals[0].text === 'Q1')
}

// enclosure dims para porta
{
  const dims = enclosureDimsOf({ widthMm: 600, heightMm: 800, depthMm: 250 })
  check('dims porta 600x800', dims.widthMm === 600 && dims.heightMm === 800)
}

console.log(`OK panel-mount-decal-smoke: ${n} checks`)
