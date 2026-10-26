/**
 * SAAS-PLANS-01 · ADMIN-COMP-01 · PROJ-COMMENTS-01 · LADDER-COMPILE-01
 * Testes puros: regras de planos/preços, componentes, comentários (platformCore),
 * a implementação local (localSaas, com localStorage simulado) e a compilação Ladder.
 */
import assert from 'node:assert/strict'

const memory = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => { memory.set(key, String(value)) },
  removeItem: (key: string) => { memory.delete(key) },
  clear: () => memory.clear(),
  key: (index: number) => [...memory.keys()][index] ?? null,
  get length() { return memory.size },
} as Storage

const core = await import('../src/saas/platformCore.mjs')
const local = await import('../src/auth/localSaas')
const { compileLadder, compileHash, compileSummary } = await import('../src/ladder/ladderCompile')
type Rung = import('../src/types').LadderRung

let checks = 0
const ok = (cond: unknown, message: string) => { assert.ok(cond, message); checks++ }
const eq = <T,>(a: T, b: T, message: string) => { assert.deepEqual(a, b, message); checks++ }
const throwsMsg = (fn: () => unknown, re: RegExp, message: string) => { assert.throws(fn, re, message); checks++ }

// ---------------------------------------------------------------- planos e preços
const P = core.DEFAULT_PRICING
eq(P.plans.map((p) => p.id), ['free', 'pro', 'escola', 'empresa'], 'quatro planos por omissão')
ok(P.plans.filter((p) => p.highlighted).length === 1, 'um único plano destacado')
const free = { id: 'u1', role: 'user' as const, plan: 'free' as const, planExpiresAt: null }
const pro = { id: 'u2', role: 'user' as const, plan: 'pro' as const, planExpiresAt: null }
const admin = { id: 'a', role: 'admin' as const, plan: 'free' as const, planExpiresAt: null }
ok(!core.canUse(free, P, 'sharing'), 'Free não partilha')
ok(core.canUse(pro, P, 'sharing'), 'Pro partilha')
ok(core.canUse(admin, P, 'ladderDebug'), 'admin usa tudo')
eq(core.limitFor(free, P, 'projects'), 3, 'Free: 3 projetos')
ok(core.withinLimit(free, P, 'projects', 2) && !core.withinLimit(free, P, 'projects', 3), 'limite de projetos')
eq(core.limitFor(admin, P, 'projects'), null, 'admin sem limite')
const expired = { ...pro, planExpiresAt: new Date(Date.now() - 86400000).toISOString() }
eq(core.effectivePlanId(expired, P), 'free', 'plano expirado volta ao plano por omissão')
eq(core.effectivePlanId({ ...pro, planExpiresAt: new Date(Date.now() + 86400000).toISOString() }, P), 'pro', 'plano dentro do período')
eq(core.cheapestPlanWith(P, 'sharing')?.id, 'pro', 'plano mais barato com partilha')
ok(/Pro/.test(core.upgradeMessage(P, 'pdfExport')), 'mensagem de upgrade indica o plano')
throwsMsg(() => core.sanitizePricing({ ...P, plans: P.plans.map((p) => ({ ...p, highlighted: true })) }), /destacado|destaque/i, 'mais de um destaque é recusado')
throwsMsg(() => core.sanitizePricing({ ...P, plans: P.plans.map((p) => p.id === 'pro' ? { ...p, priceMonthly: -5 } : p) }), /preço|Preço/, 'preço negativo é recusado')
const hiddenPro = core.sanitizePricing({ ...P, plans: P.plans.map((p) => p.id === 'pro' ? { ...p, showOnLanding: false } : p) })
ok(!hiddenPro.plans.find((p) => p.id === 'pro')!.showOnLanding, 'cartão Pro oculto na página inicial')
const end = new Date(core.periodEnd('yearly', new Date('2026-01-10T00:00:00Z')))
eq(end.getUTCFullYear(), 2027, 'período anual termina um ano depois')

// ---------------------------------------------------------------- componentes
eq(core.componentStatusOf({ enabled: false }), 'blocked', 'enabled:false legado = bloqueado')
eq(core.componentStatusOf({ status: 'archived' }), 'archived', 'estado arquivado')
throwsMsg(() => core.sanitizeComponentChange({ status: 'blocked', note: '' }), /motivo/i, 'bloquear exige motivo')
const premium = { status: 'active', minPlan: 'pro' }
eq(core.componentAccess(premium, free, P), { visible: true, insertable: false, reason: core.componentAccess(premium, free, P).reason }, 'componente Pro visível mas não inserível no Free')
ok(core.componentAccess(premium, pro, P).insertable, 'componente Pro inserível no Pro')
ok(!core.componentAccess({ status: 'archived' }, free, P).visible, 'arquivado não aparece na biblioteca')
ok(!core.componentAccess({ status: 'deleted' }, free, P).visible, 'eliminado não aparece')

// ---------------------------------------------------------------- comentários
throwsMsg(() => core.sanitizeCommentBody('   '), /vazio|escreva/i, 'comentário vazio recusado')
throwsMsg(() => core.sanitizeCommentBody('x'.repeat(core.COMMENT_MAX + 50)), /longo/, 'comentário acima do limite recusado')
const comment = { authorId: 'u2' }
eq(core.commentPermissions(comment, { id: 'u2', role: 'user' }, 'editor'), { edit: true, remove: true, resolve: true }, 'autor edita, remove e resolve')
eq(core.commentPermissions(comment, { id: 'u1', role: 'user' }, 'owner').edit, false, 'proprietário não edita o texto de outro')
ok(core.commentPermissions(comment, { id: 'u1', role: 'user' }, 'owner').remove, 'proprietário modera')
ok(!core.canCommentOn(free, free, P), 'Free em projeto de dono Free: sem comentários')
ok(core.canCommentOn(free, pro, P), 'convidado Free comenta em projeto de dono Pro')
ok(core.canCommentOn(pro, free, P), 'convidado Pro comenta com o seu próprio plano')

// ---------------------------------------------------------------- modo local
const userAcc = { id: 'dcsimu-user', name: 'User', email: 'user@dcsimu.local', role: 'user' as const }
const adminAcc = { id: 'dcsimu-admin', name: 'Admin', email: 'admin@dcsimu.local', role: 'admin' as const }
const ctx = (user: typeof userAcc | typeof adminAcc, verb: string, url: string, payload: Record<string, unknown> = {}) => ({
  parts: url.split('?')[0].split('/').filter(Boolean), url, verb, payload, user,
  project: (id: string) => ({ id, name: 'Demo', ownerId: 'dcsimu-user', role: user.id === 'dcsimu-user' ? 'owner' as const : 'editor' as const }),
  accountName: (id: string) => id === 'dcsimu-user' ? 'User' : 'Admin',
  accountEmail: (id: string) => id === 'dcsimu-user' ? 'user@dcsimu.local' : 'admin@dcsimu.local',
})
const api = (...args: Parameters<typeof ctx>) => local.localSaasApi(ctx(...args)) as Record<string, unknown>
eq((api(userAcc, 'GET', '/account/plan') as { plan: string }).plan, 'free', 'local: conta começa no Free')
api(userAcc, 'POST', '/account/plan-request', { plan: 'pro', period: 'monthly', message: 'NIF 123' })
throwsMsg(() => api(userAcc, 'POST', '/account/plan-request', { plan: 'escola', period: 'monthly' }), /pendente/, 'local: um pedido pendente de cada vez')
const reqs = api(adminAcc, 'GET', '/admin/plan-requests?status=pending') as unknown as Array<{ id: string; plan: string }>
eq(reqs.length, 1, 'local: admin vê o pedido')
api(adminAcc, 'POST', `/admin/plan-requests/${reqs[0].id}`, { action: 'approve', note: 'pago' })
const after = api(userAcc, 'GET', '/account/plan') as { plan: string; planExpiresAt: string | null }
eq(after.plan, 'pro', 'local: aprovação aplica o plano')
ok(!!after.planExpiresAt, 'local: aprovação define o fim do período')
throwsMsg(() => api(userAcc, 'PUT', '/admin/pricing', P as unknown as Record<string, unknown>), /administrador/, 'local: só o admin muda preços')
api(adminAcc, 'PUT', '/admin/pricing', { ...P, showPricing: false } as unknown as Record<string, unknown>)
eq(local.localPricing().showPricing, false, 'local: admin oculta a secção de preços')
const added = api(userAcc, 'POST', '/projects/p1/comments', { body: 'Rever o borne X1', anchor: 'esquema' }) as { id: string; anchor: string }
eq(added.anchor, 'esquema', 'local: comentário com âncora')
api(adminAcc, 'POST', '/projects/p1/comments', { body: 'Feito', anchor: 'geral' })
const list = api(userAcc, 'GET', '/projects/p1/comments') as { comments: unknown[]; canWrite: boolean }
eq(list.comments.length, 2, 'local: conversa com duas mensagens')
ok(list.canWrite, 'local: dono Pro pode comentar')
api(userAcc, 'PATCH', `/projects/p1/comments/${added.id}`, { resolved: true })
ok((api(userAcc, 'GET', '/projects/p1/comments') as { comments: Array<{ id: string; resolved: boolean }> }).comments.find((c) => c.id === added.id)!.resolved, 'local: comentário resolvido')
local.dropLocalComments('p1')
eq((api(userAcc, 'GET', '/projects/p1/comments') as { comments: unknown[] }).comments.length, 0, 'local: projeto eliminado apaga a conversa')

// ---------------------------------------------------------------- compilação Ladder
let n = 0
const contact = (address: string) => ({ kind: 'contact' as const, id: `c${n++}`, address, contactType: 'NO' as const })
const coil = (address: string) => ({ kind: 'coil' as const, id: `k${n++}`, address, coilType: 'COIL' as const })
const rung = (id: string, input: string, output: string, extra: Partial<Rung> = {}): Rung => ({ id, name: '', enabled: true, branches: [{ id: `b${n++}`, elements: [contact(input)] }], coils: output ? [coil(output)] : [], ...extra } as Rung)

const clean = compileLadder({ main: [rung('m1', 'I0.0', 'Q0.0')], physicalInputs: false })
ok(clean.ok && clean.errors === 0, 'programa simples compila')
eq(clean.blocks, 1, 'um bloco (Main)')
ok(clean.instructions >= 2, 'conta instruções')
ok(/Compilação concluída/.test(compileSummary(clean)), 'resumo de sucesso')

const missingCall = compileLadder({ main: [rung('m1', 'I0.0', '', { call: { targetId: 'nao-existe' } })] })
ok(!missingCall.ok && missingCall.issues.some((i) => i.id.endsWith('call-missing')), 'CALL para bloco inexistente é erro')

const fcA = { id: 'fa', folder: 'programBlocks' as const, name: 'FC_A', content: '', rungs: [rung('a1', 'I0.1', '', { call: { targetId: 'fb' } })] }
const fcB = { id: 'fb', folder: 'programBlocks' as const, name: 'FC_B', content: '', rungs: [rung('b1', 'I0.2', '', { call: { targetId: 'fa' } })] }
const cyc = compileLadder({ main: [rung('m1', 'I0.0', '', { call: { targetId: 'fa' } })], files: [fcA, fcB] })
ok(cyc.issues.some((i) => i.id.startsWith('call-cycle:')), 'chamadas em ciclo (FC_A → FC_B → FC_A) são erro')
const self = compileLadder({ main: [], files: [{ ...fcA, rungs: [rung('a1', 'I0.1', '', { call: { targetId: 'fa' } })] }] })
ok(self.issues.some((i) => i.id.endsWith('call-self')), 'recursão direta é erro')
ok(self.issues.some((i) => i.id === 'main-empty'), 'Main vazio dá aviso')
ok(self.issues.some((i) => i.id === 'uncalled:fa'), 'FC nunca chamado dá informação')

// bobina duplicada entre blocos (referência cruzada): Main e FC1 escrevem Q0.0
const dup = compileLadder({ main: [rung('m1', 'I0.0', 'Q0.0', { })], fc1: [rung('f1', 'I0.1', 'Q0.0')], fcAdded: { fc1: true } })
const dupIssue = dup.issues.find((i) => i.id.startsWith('dup:'))
ok(!!dupIssue, 'bobina duplicada entre Main e FC1 é detetada')
ok(/FC1/.test(dupIssue?.message ?? ''), 'a mensagem indica o bloco FC1')

// etiquetas LBL/JMP são locais: o mesmo LBL em dois blocos não é duplicado
const lblA = rung('la', 'I0.0', '', { label: 'FIM' } as Partial<Rung>)
const lblB = rung('lb', 'I0.1', '', { label: 'FIM' } as Partial<Rung>)
const labels = compileLadder({ main: [lblA, rung('m2', 'I0.3', 'Q0.1')], fc1: [lblB, rung('f2', 'I0.4', 'Q0.2')], fcAdded: { fc1: true } })
ok(!labels.issues.some((i) => /lbl-dup|LBL.*duplic/i.test(`${i.id} ${i.message}`)), 'LBL igual em blocos diferentes não é conflito')

const base = rung('m1', 'I0.0', 'Q0.0')
const sameBlock = compileLadder({ main: [rung('x1', 'I0.0', 'Q0.3', { label: 'FIM' } as Partial<Rung>), rung('x2', 'I0.1', 'Q0.4', { label: 'FIM' } as Partial<Rung>)] })
ok(!sameBlock.ok && sameBlock.issues.some((i) => i.id.startsWith('lbl-dup:')), 'LBL repetido no mesmo bloco é erro')

const h1 = compileHash({ main: [base] })
eq(compileHash({ main: [structuredClone(base)] }), h1, 'hash estável para o mesmo programa')
const changed = structuredClone(base); (changed.coils[0] as { address: string }).address = 'Q0.1'
ok(compileHash({ main: [changed] }) !== h1, 'hash muda quando o programa muda')

console.log(`saas-smoke: ok (${checks} verificações)`)
