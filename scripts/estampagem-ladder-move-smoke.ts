/** Estampagem (ATEC): o projeto GRAFCET abre o Ladder e as networks MOVE gerem os tempos 5/6/8 s. */
import assert from 'node:assert/strict'
import { grafcetExampleContent, grafcetExamples } from '../src/project/grafcetExamples'
import { allowedViews } from '../src/project/kind'
import { useSimStore } from '../src/store/useSimStore'

let n = 0
const check = (name: string, ok: boolean, extra = '') => { assert.ok(ok, `${name}${extra ? ` (${extra})` : ''}`); n++ }

const example = grafcetExamples().find((e) => e.id === 'grafcet-estampagem-industrial')!
const content = grafcetExampleContent(example) as Record<string, any>
check('semente nova (v24) para atualizar a cópia guardada', example.nativeId.endsWith('-v24'))
check('projeto continua do tipo GRAFCET', content.projectKind === 'grafcet')
check('Ladder desbloqueado no projeto', Array.isArray(content.unlockedViews) && content.unlockedViews.includes('ladder'))
check('vistas: GRAFCET + Ladder (+ monitor)', ['grafcet', 'ladder', 'monitor'].every((v) => allowedViews('grafcet', false, content.unlockedViews).includes(v as any)))
const rungs = content.ladder.rungs as Array<{ name: string; move?: { source: string; target: string } }>
check('5 networks MOVE no OB1', rungs.length === 5 && rungs.every((r) => r.move && r.name.startsWith('MOVE ·')))
check('tags MW100/MW102 declaradas como Int', ['MW100', 'MW102'].every((a) => content.tags.some((t: any) => t.address === a && t.dataType === 'Int')))

const st = () => useSimStore.getState()
st().loadJSON(JSON.stringify(content))
check('ao abrir, o projeto mantém o Ladder desbloqueado', st().unlockedViews.includes('ladder') && st().ladder.rungs.length === 5)
const run = (k: number) => { for (let i = 0; i < k; i++) st().step() }
const mw = (a: string) => st().runtime.db[a]?.value
const pulse = (address: string) => { st().setVirtualInput(address, true); run(3); st().setVirtualInput(address, false); run(2) }

run(3)
check('GRAFCET corre em paralelo (G0 tem etapa ativa)', st().grafcetRuntime.active.length > 0)
pulse('I0.2'); check('Peça Preta → MOVE 5 → MW100', mw('MW100') === 5, String(mw('MW100')))
pulse('I0.3'); check('Peça Branca → MOVE 6 → MW100', mw('MW100') === 6, String(mw('MW100')))
pulse('I0.4'); check('Peça Metálica → MOVE 8 → MW100', mw('MW100') === 8, String(mw('MW100')))
pulse('I0.6'); check('Depósito → MOVE MW100 → MW102 (8)', mw('MW102') === 8, String(mw('MW102')))
pulse('I1.3'); check('Reset → MOVE 0 → MW100 (MW102 mantém)', mw('MW100') === 0 && mw('MW102') === 8, `${mw('MW100')} / ${mw('MW102')}`)

console.log(`[estampagem-ladder-move] OK — ${n} verificações`)
