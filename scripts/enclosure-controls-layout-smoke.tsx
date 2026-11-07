import React from 'react'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { createComponent } from '../src/electrical/factory'
import { EnclosureControls } from '../src/components/PanelAccessoryControls'
import { ENCLOSURE_FACES } from '../src/three/enclosureVisibility'

const enclosure = createComponent('panelEnclosure', 'QE1', undefined, 0, 0, 0)
const html = renderToStaticMarkup(<EnclosureControls c={enclosure} />)

const header = html.indexOf('Quadro metálico')
const measures = html.indexOf('Medidas')
const exteriorAction = html.indexOf('data-enclosure-exterior-toggle')
assert.ok(header >= 0 && header < measures && measures < exteriorAction, 'identidade e medidas aparecem antes do atalho de visibilidade')

assert.match(html, /data-enclosure-exterior-toggle/)
assert.match(html, /aria-label="Ocultar exteriores do quadro"/)
assert.match(html, /aria-pressed="false"[^>]*aria-label="Ocultar exteriores do quadro"/)
assert.match(html, /<details\b[^>]*data-enclosure-visibility/)
assert.match(html, /<summary>Visibilidade das chapas/)
assert.match(html, /aria-label="Ocultar todas as chapas"/)
assert.match(html, /aria-pressed="false" aria-label="Ocultar todas as chapas"/)

for (const [, label] of ENCLOSURE_FACES) {
  assert.ok(html.includes(`aria-label="Ocultar ${label.toLowerCase()}"`), `controlo individual acessível: ${label}`)
}

for (const summary of ['Imagem da tampa', 'Furos no quadro', 'Aparelhos internos']) {
  assert.ok(html.includes(`<summary>${summary}`), `grupo disponível: ${summary}`)
}
assert.ok(html.includes('type="file" accept="image/*"'), 'upload de imagem continua acessível')
assert.ok(html.includes('Fazer furo'), 'criação de furos continua acessível')
assert.ok(html.includes('Marcar seleção como dentro'), 'montagem de aparelhos internos continua acessível')

const groups = [...html.matchAll(/<details\b([^>]*)>/g)]
assert.equal(groups.length, 4, 'existem grupos de visibilidade, imagem, furos e aparelhos internos')
assert.ok(groups.every(([, attributes]) => !/\bopen\b/.test(attributes)), 'grupos menos frequentes iniciam recolhidos')

console.log('PASS — disposição compacta do inspetor: medidas prioritárias, atalho exterior, visibilidade acessível e grupos recolhidos')
