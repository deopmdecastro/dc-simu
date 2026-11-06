/**
 * Separador «E/S» do inspetor do GRAFCET: tem de mostrar os mesmos cartões do Ladder e do Esquema IEC —
 * botões de entrada com o tipo INT/NO/NC e lâmpadas das saídas Q/M — e não uma versão própria.
 */
import React from 'react'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import GrafcetIoPanel from '../src/grafcet/GrafcetIoPanel'
import { emptyGrafcet } from '../src/grafcet/engine'
import { useSimStore } from '../src/store/useSimStore'

const html = renderToStaticMarkup(<GrafcetIoPanel program={emptyGrafcet()} stepLabel={() => '0'} extraBits={['Q3.0', 'M1.2']} />)
let n = 0
const ok = (cond: unknown, message: string) => { assert.ok(cond, message); n++; console.log(`PASS — ${message}`) }

ok(html.includes('data-grafcet-io'), 'o separador monta o contentor E/S do GRAFCET')
ok(html.includes('class="vio-panel'), 'reutiliza o painel de E/S do Ladder/IEC (vio-panel)')
const count = useSimStore.getState().virtualInputCount
ok((html.match(/class="vio-cell"/g) ?? []).length === count, `uma célula por entrada virtual (${count})`)
ok((html.match(/vio-mode is-latch/g) ?? []).length === count, 'cada entrada mostra o seletor de tipo (INT por omissão)')
ok(html.includes('>INT</button>') && !html.includes('vio-mode is-push') && !html.includes('vio-mode is-nc'), 'o seletor arranca em INT (clique avança INT → NO → NC)')
ok(html.includes('Saídas (Q)') && html.includes('Memórias (M)'), 'mostra os cartões de saídas Q e de memórias M')
ok(html.includes('>Q3.0<') && html.includes('>M1.2<'), 'as saídas e memórias usadas nas ações aparecem mesmo a 0')
console.log(`\n${n} verificações do separador E/S do GRAFCET passaram.`)
