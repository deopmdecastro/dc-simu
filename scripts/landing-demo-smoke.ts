/**
 * Smoke do contrato da demonstração da landing (Partida direta).
 *
 * Sem rede nem browser — valida o núcleo puro da funcionalidade:
 *  1. O projeto nativo é íntegro (componentes, fios com bornes válidos,
 *     Ladder, GRAFCET e tabela de tags completos).
 *  2. O corte (`sliceLandingDemo`) extrai Ladder + GRAFCET + nomes.
 *  3. Uma publicação de projeto de utilizador tem prioridade sobre o
 *     nativo; conteúdo vazio/inválido cai para o nativo.
 *  4. A tabela online (demoTable) espelha o estado partilhado PLC/motor
 *     — o mesmo estado que anima Ladder, GRAFCET e a Visualização 3D.
 *
 * Atualizado: 2026-10-28
 */
import {
  NATIVE_PARTIDA_ID,
  NATIVE_PARTIDA_NAME,
  nativePartidaDiretaContent,
  buildNativePartidaDireta,
  nativeProjectSeeds,
  nativeDemoTable,
  NATIVE_DEMO_NAMES,
} from '../src/project/nativeProjects'
import {
  nativeLandingPayload,
  sliceLandingDemo,
  type LandingPublishedPayload,
} from '../src/project/landingPublish'

let failures = 0
const assert = (note: string, cond: boolean, detalhe = '') => {
  if (cond) {
    console.log(`PASS — ${note}`)
  } else {
    failures++
    console.error(`FAIL — ${note}${detalhe ? ` :: ${detalhe}` : ''}`)
  }
}

// ── 1. Projeto nativo íntegro ────────────────────────────────────────────────
const seeds = nativeProjectSeeds()
assert('Seed único nativo com ID estável', seeds.length === 1 && seeds[0].id === NATIVE_PARTIDA_ID, seeds[0]?.id)
assert('Nome apresenta (nativo)', seeds[0].name === NATIVE_PARTIDA_NAME, seeds[0]?.name)

const built = buildNativePartidaDireta()
const terminalIds = new Set(built.components.flatMap((c) => c.terminals.map((t) => t.id)))
assert('Tem pelo menos 5 componentes', built.components.length >= 5, String(built.components.length))
assert('Fios ligados a bornes existentes', built.wires.length > 4 && built.wires.every((w) => terminalIds.has(w.fromTerminalId) && terminalIds.has(w.toTerminalId)))
assert('Ladder nativo tem redes', built.ladder.rungs.length > 0, String(built.ladder.rungs.length))
assert('GRAFCET nativo tem etapas e transições', built.grafcet.steps.length >= 2 && built.grafcet.transitions.length >= 2)
assert('Tags nomeiam I/O da demo', built.tags.some((t) => t.address === 'I0.1') && built.tags.some((t) => t.address === 'Q0.0'))

// ── 2. Corte do payload nativo ───────────────────────────────────────────────
const nativo = nativeLandingPayload()
assert('Payload nativo marcado isNative', nativo.isNative === true && nativo.projectId === NATIVE_PARTIDA_ID)
const slice = sliceLandingDemo(nativo)
assert('Corte nativo: ladder não vazio', slice.ladder.length > 0)
assert('Corte nativo: grafcet tem etapas', slice.grafcet.steps.length >= 2)
assert('Corte nativo: nomes incluem START/KM1', slice.names['I0.1'] === 'START' && slice.names['Q0.0'] === 'KM1')

// ── 3. Publicação de projeto de utilizador tem prioridade ────────────────────
const publicado: LandingPublishedPayload = {
  projectId: 'proj-utilizador-x',
  name: 'Marcha personalizada',
  owner: 'aluno@exemplo.pt',
  revision: 7,
  updatedAt: new Date().toISOString(),
  isNative: false,
  content: {
    ladder: { rungs: [{ id: 'r1', elements: [], y: 0 }] as never[] },
    tags: [{ address: 'Q0.0', name: 'BOMBA' }],
  },
}
const slicePub = sliceLandingDemo(publicado)
assert('Corte publicado: usa o nome do utilizador', slicePub.meta.name === 'Marcha personalizada')
assert('Corte publicado: usa o Ladder da publicação', slicePub.ladder.length === 1 && (slicePub.ladder[0] as { id?: string }).id === 'r1')
assert('Corte publicado: GRAFCET vazio cai para o nativo', slicePub.grafcet.steps.length >= 2)
assert('Corte publicado: tag do utilizador sobrepõe o nome nativo', slicePub.names['Q0.0'] === 'BOMBA')

const vazio: LandingPublishedPayload = { ...publicado, content: { ladder: { rungs: [] }, grafcet: { steps: [], transitions: [] } } as never }
const sliceVazio = sliceLandingDemo(vazio)
assert('Conteúdo vazio: Ladder cai para o nativo', sliceVazio.ladder.length === built.ladder.rungs.length)

// ── 4. Tabela online espelha o estado partilhado ─────────────────────────────
const parado = nativeDemoTable(false, false)
const parar = nativeDemoTable(true, false)
const marcha = nativeDemoTable(true, true)
assert('PLC STOP: saídas todas desligadas', !parado['Q0.0'] && !parado['Q0.1'] && !parado['Q0.2'])
assert('RUN sem marcha: H2 ativo, KM1/H1 off', parar['Q0.2'] === true && parar['Q0.0'] === false && parar['Q0.1'] === false)
assert('Marcha: KM1+H1 on e H2 off', marcha['Q0.0'] === true && marcha['Q0.1'] === true && marcha['Q0.2'] === false)
assert('Nomes nativos cobrem a tabela', Object.keys(nativeDemoTable(true, true)).every((a) => NATIVE_DEMO_NAMES[a]), '')


// ── 5. Semente na conta (Espaço de trabalho do Admin) ────────────────────────
{
  const { useSimStore } = await import('../src/store/useSimStore')
  const store = useSimStore.getState()
  store.loadJSON(JSON.stringify(nativePartidaDiretaContent()))
  assert('Loja: loadJSON da semente nativa regista nativeId', useSimStore.getState().nativeId === NATIVE_PARTIDA_ID)
  const saved = JSON.parse(store.saveJSON()) as { nativeId?: string }
  assert('Loja: saveJSON preserva a marca nativeId', saved.nativeId === NATIVE_PARTIDA_ID)
  useSimStore.getState().newProject()
  assert('Loja: newProject limpa a marca nativeId', useSimStore.getState().nativeId === null)
  // restaura a marca para não influenciar outros testes da sessão
  store.loadJSON(JSON.stringify(nativePartidaDiretaContent()))
  assert('Loja: edições mantêm a marca (readópção do content nativo)', useSimStore.getState().nativeId === NATIVE_PARTIDA_ID)

  const backendSrc = (await import('node:fs')).readFileSync(new URL('../src/supabase/supabaseBackend.ts', import.meta.url), 'utf8')
  assert('Backend Supabase: semente nativa reservada a admin', /resolveRole\(user\.id\)'\) === 'admin'/.test(backendSrc.replace(/\s+/g, ' ')) || backendSrc.includes("=== 'admin'"))
  assert('Backend Supabase: dedup por content.nativeId', backendSrc.includes('content?.nativeId === seed.nativeId'))
  assert('Backend Supabase: insere a semente na base', backendSrc.includes("if (!errSeed && created) rows.unshift(created)"))
}

if (failures) {
  console.error(`\n❌ ${failures} falha(s) no contrato da demonstração da landing`)
  process.exit(1)
}
console.log('\n✅ TODOS OS TESTES PASSARAM')
