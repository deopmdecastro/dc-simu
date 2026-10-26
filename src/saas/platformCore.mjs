// Regras partilhadas entre o navegador (TypeScript, via platformCore.d.mts) e o
// servidor Express (server/*.mjs): planos SaaS, estados dos componentes e
// comentários. Sem dependências — tem de correr em Node e no Vite.

export const PLAN_IDS = ['free', 'pro', 'escola', 'empresa']

/** Funcionalidades que um plano pode incluir. O esquema elétrico é sempre incluído. */
export const FEATURES = [
  { key: 'view3d', label: 'Vista 3D do quadro', description: 'Montagem e visualização 3D com modelos CAD.' },
  { key: 'ladder', label: 'Editor Ladder', description: 'Programação Ladder com simulação do scan do PLC.' },
  { key: 'grafcet', label: 'Editor GRAFCET', description: 'GRAFCET com etapas, transições e geração de Ladder.' },
  { key: 'ladderDebug', label: 'Depuração Ladder', description: 'Pontos de paragem e execução passo a passo.' },
  { key: 'fluidsimImport', label: 'Importação FluidSIM', description: 'Importar GRAFCET de ficheiros .ct do FluidSIM.' },
  { key: 'pdfExport', label: 'Exportação PDF', description: 'Exportar esquemas e relatórios em PDF.' },
  { key: 'excelExport', label: 'Exportação Excel', description: 'Exportar listas de material e tags em Excel.' },
  { key: 'sharing', label: 'Partilha de projetos', description: 'Convidar editores para os seus projetos.' },
  { key: 'comments', label: 'Comentários', description: 'Conversar com os colaboradores dentro do projeto.' },
]
export const FEATURE_KEYS = FEATURES.map((f) => f.key)
export const LIMIT_KEYS = ['projects', 'collaborators']
export const LIMIT_LABEL = { projects: 'Projetos', collaborators: 'Colaboradores por projeto' }

const all = (value) => Object.fromEntries(FEATURE_KEYS.map((key) => [key, value]))

export const DEFAULT_PRICING = {
  showPricing: true,
  defaultPlan: 'free',
  currency: 'EUR',
  yearlyNote: '2 meses grátis no plano anual',
  plans: [
    {
      id: 'free', name: 'Free', tagline: 'Para experimentar e aprender.', priceMonthly: 0, priceYearly: 0,
      showOnLanding: true, highlighted: false, ctaLabel: 'Começar grátis', order: 1,
      features: { ...all(false), view3d: true, ladder: true, grafcet: true },
      limits: { projects: 3, collaborators: 0 },
      extras: ['Esquema elétrico completo', 'Simulação em tempo real'],
    },
    {
      id: 'pro', name: 'Pro', tagline: 'Para técnicos e projetistas.', priceMonthly: 12, priceYearly: 120,
      showOnLanding: true, highlighted: true, ctaLabel: 'Escolher Pro', order: 2,
      features: all(true),
      limits: { projects: null, collaborators: 3 },
      extras: ['Suporte por email'],
    },
    {
      id: 'escola', name: 'Escola', tagline: 'Para turmas e centros de formação.', priceMonthly: 49, priceYearly: 490,
      showOnLanding: true, highlighted: false, ctaLabel: 'Pedir plano Escola', order: 3,
      features: all(true),
      limits: { projects: null, collaborators: 30 },
      extras: ['Comentários entre formador e formandos', 'Gestão de turmas pelo administrador'],
    },
    {
      id: 'empresa', name: 'Empresa', tagline: 'Para equipas de engenharia.', priceMonthly: null, priceYearly: null,
      showOnLanding: false, highlighted: false, ctaLabel: 'Falar connosco', order: 4,
      features: all(true),
      limits: { projects: null, collaborators: null },
      extras: ['Condições sob consulta'],
    },
  ],
}

const text = (value, max, fallback = '') => {
  const out = typeof value === 'string' ? value.trim().slice(0, max) : fallback
  return out
}
const price = (value, label) => {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0 || n > 100000) throw new Error(`Preço inválido em ${label}: use um valor entre 0 e 100000 ou deixe vazio para «sob consulta».`)
  return Math.round(n * 100) / 100
}
const limit = (value, label) => {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0 || n > 100000) throw new Error(`Limite inválido em ${label}: use um inteiro ≥ 0 ou deixe vazio para ilimitado.`)
  return n
}

/** Valida e normaliza a configuração de planos enviada pelo administrador. Lança Error em PT-PT. */
export function sanitizePricing(input) {
  const source = input && typeof input === 'object' ? input : {}
  const plansIn = Array.isArray(source.plans) ? source.plans : []
  const byId = new Map(plansIn.filter((p) => p && PLAN_IDS.includes(p.id)).map((p) => [p.id, p]))
  const plans = DEFAULT_PRICING.plans.map((base) => {
    const p = byId.get(base.id) ?? base
    const name = text(p.name, 40) || base.name
    const features = Object.fromEntries(FEATURE_KEYS.map((key) => [key, p.features && typeof p.features === 'object' && key in p.features ? !!p.features[key] : base.features[key]]))
    const limits = Object.fromEntries(LIMIT_KEYS.map((key) => [key, limit(p.limits && typeof p.limits === 'object' && key in p.limits ? p.limits[key] : base.limits[key], `${name} · ${LIMIT_LABEL[key]}`)]))
    const extras = (Array.isArray(p.extras) ? p.extras : base.extras).map((line) => text(line, 120)).filter(Boolean).slice(0, 8)
    const order = Number.isInteger(Number(p.order)) ? Math.min(Math.max(Number(p.order), 0), 99) : base.order
    return {
      id: base.id, name, tagline: text(p.tagline, 140, base.tagline),
      priceMonthly: price(p.priceMonthly, `${name} (mensal)`), priceYearly: price(p.priceYearly, `${name} (anual)`),
      showOnLanding: p.showOnLanding === undefined ? base.showOnLanding : !!p.showOnLanding,
      highlighted: !!p.highlighted, ctaLabel: text(p.ctaLabel, 40) || base.ctaLabel, order,
      features, limits, extras,
    }
  })
  if (plans.filter((p) => p.highlighted).length > 1) throw new Error('Só um plano pode estar em destaque na landing page.')
  const defaultPlan = PLAN_IDS.includes(source.defaultPlan) ? source.defaultPlan : DEFAULT_PRICING.defaultPlan
  const currency = /^[A-Z]{3}$/.test(String(source.currency || '')) ? String(source.currency) : DEFAULT_PRICING.currency
  return {
    showPricing: source.showPricing === undefined ? DEFAULT_PRICING.showPricing : !!source.showPricing,
    defaultPlan, currency, yearlyNote: text(source.yearlyNote, 80, DEFAULT_PRICING.yearlyNote),
    plans: plans.sort((a, b) => a.order - b.order || PLAN_IDS.indexOf(a.id) - PLAN_IDS.indexOf(b.id)),
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : undefined,
    updatedBy: typeof source.updatedBy === 'string' ? source.updatedBy.slice(0, 120) : undefined,
  }
}

/** Configuração guardada (ou nada) → configuração válida, sem nunca lançar. */
export function readPricing(stored) {
  try { return sanitizePricing(stored ?? DEFAULT_PRICING) } catch { return sanitizePricing(DEFAULT_PRICING) }
}

export function isPlanId(value) { return PLAN_IDS.includes(value) }

/** Plano em vigor: o atribuído, ou o plano por omissão quando expirou / não existe. */
export function effectivePlanId(user, config, now = Date.now()) {
  const fallback = config?.defaultPlan ?? 'free'
  if (!user || !isPlanId(user.plan)) return fallback
  if (user.planExpiresAt) {
    const until = Date.parse(user.planExpiresAt)
    if (Number.isFinite(until) && until < now) return fallback
  }
  return user.plan
}

export function planById(config, id) {
  return config.plans.find((p) => p.id === id) ?? config.plans.find((p) => p.id === config.defaultPlan) ?? config.plans[0]
}

/** O administrador tem sempre acesso total; os restantes dependem do plano em vigor. */
export function canUse(user, config, feature, now = Date.now()) {
  if (user?.role === 'admin') return true
  if (!FEATURE_KEYS.includes(feature)) return true
  return !!planById(config, effectivePlanId(user, config, now)).features[feature]
}

/** null = ilimitado. */
export function limitFor(user, config, key, now = Date.now()) {
  if (user?.role === 'admin') return null
  const value = planById(config, effectivePlanId(user, config, now)).limits[key]
  return value === undefined ? null : value
}

export function withinLimit(user, config, key, currentCount, now = Date.now()) {
  const max = limitFor(user, config, key, now)
  return max === null || currentCount < max
}

/** Plano mais barato que inclui a funcionalidade (para a mensagem de upgrade). */
export function cheapestPlanWith(config, feature) {
  return [...config.plans].filter((p) => p.features[feature]).sort((a, b) => (a.priceMonthly ?? Infinity) - (b.priceMonthly ?? Infinity))[0] ?? null
}

export function planRank(config, id) {
  const plan = config.plans.find((p) => p.id === id)
  return plan ? PLAN_IDS.indexOf(plan.id) : 0
}

export function featureLabel(key) { return FEATURES.find((f) => f.key === key)?.label ?? key }

/** Mensagem de bloqueio por plano, em PT-PT. */
export function upgradeMessage(config, feature) {
  const plan = cheapestPlanWith(config, feature)
  return `${featureLabel(feature)} não está incluída no seu plano.${plan ? ` Disponível a partir do plano ${plan.name}.` : ''}`
}

export function limitMessage(config, user, key) {
  const max = limitFor(user, config, key)
  if (key === 'projects') return `O seu plano permite ${max} projeto(s). Elimine um projeto ou mude de plano.`
  return `O seu plano permite ${max} colaborador(es) por projeto. Mude de plano para convidar mais.`
}

/** Fim do período pago a partir de agora (mensal: 1 mês; anual: 1 ano). */
export function periodEnd(period, from = new Date()) {
  const end = new Date(from.getTime())
  if (period === 'yearly') end.setUTCFullYear(end.getUTCFullYear() + 1)
  else end.setUTCMonth(end.getUTCMonth() + 1)
  return end.toISOString()
}

// ---------------------------------------------------------------------------
// Componentes: ativo · bloqueado · arquivado · eliminado
// ---------------------------------------------------------------------------

export const COMPONENT_STATUSES = ['active', 'blocked', 'archived', 'deleted']
export const COMPONENT_STATUS_LABEL = { active: 'Ativo', blocked: 'Bloqueado', archived: 'Arquivado', deleted: 'Eliminado' }

/** Compatível com o formato antigo { enabled:false } = bloqueado. */
export function componentStatusOf(setting) {
  if (!setting) return 'active'
  if (COMPONENT_STATUSES.includes(setting.status)) return setting.status
  return setting.enabled === false ? 'blocked' : 'active'
}

/**
 * Valida uma alteração de estado de componente. Devolve { status, note, minPlan }.
 * Bloquear exige motivo (é mostrado ao utilizador na biblioteca).
 */
export function sanitizeComponentChange(body) {
  const source = body && typeof body === 'object' ? body : {}
  const status = COMPONENT_STATUSES.includes(source.status) ? source.status : source.enabled === false ? 'blocked' : 'active'
  const note = text(source.note, 300)
  if (status === 'blocked' && !note) throw new Error('Indique o motivo para bloquear o componente.')
  const minPlan = source.minPlan === null || source.minPlan === '' || source.minPlan === undefined ? null : source.minPlan
  if (minPlan !== null && !PLAN_IDS.includes(minPlan)) throw new Error('Plano mínimo inválido.')
  return { status, note, minPlan }
}

/** Uma linha só precisa de existir se houver algo diferente do estado por omissão. */
export function isDefaultComponentSetting(change) {
  return change.status === 'active' && !change.minPlan
}

/**
 * Acesso de um utilizador a um tipo de componente na biblioteca:
 * - visible: aparece na biblioteca (arquivados/eliminados desaparecem);
 * - insertable: pode ser inserido (bloqueados e acima do plano não);
 * - reason: mensagem para o utilizador.
 */
export function componentAccess(setting, user, config) {
  const status = componentStatusOf(setting)
  if (status === 'archived' || status === 'deleted') return { visible: false, insertable: false, reason: status === 'archived' ? 'Arquivado pelo administrador' : 'Eliminado do catálogo' }
  if (status === 'blocked') return { visible: true, insertable: false, reason: setting?.note ? `Bloqueado pelo administrador: ${setting.note}` : 'Bloqueado pelo administrador' }
  if (setting?.minPlan && user?.role !== 'admin' && planRank(config, effectivePlanId(user, config)) < planRank(config, setting.minPlan)) {
    return { visible: true, insertable: false, reason: `Disponível a partir do plano ${planById(config, setting.minPlan).name}` }
  }
  return { visible: true, insertable: true, reason: null }
}

// ---------------------------------------------------------------------------
// Comentários de projeto
// ---------------------------------------------------------------------------

export const COMMENT_MAX = 2000

export function sanitizeCommentBody(value) {
  const body = typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : ''
  if (!body) throw new Error('Escreva o comentário antes de enviar.')
  if (body.length > COMMENT_MAX) throw new Error(`O comentário é demasiado longo (máximo ${COMMENT_MAX} caracteres).`)
  return body
}

/** Âncora opcional: em que parte do projeto o comentário se aplica. */
export const COMMENT_ANCHORS = ['geral', 'esquema', '3d', 'ladder', 'grafcet']
export function sanitizeCommentAnchor(value) { return COMMENT_ANCHORS.includes(value) ? value : 'geral' }

/**
 * Permissões sobre um comentário. O autor edita e apaga os seus; o proprietário do
 * projeto e o administrador podem apagar qualquer um e marcar como resolvido.
 */
export function commentPermissions(comment, user, projectRole) {
  const mine = !!user && comment.authorId === user.id
  const moderator = projectRole === 'owner' || user?.role === 'admin'
  return { edit: mine, remove: mine || moderator, resolve: mine || moderator }
}

/**
 * Pode escrever comentários se o seu plano incluir «comments» ou se o plano do
 * proprietário do projeto o incluir (quem paga a equipa cobre os convidados).
 */
export function canCommentOn(user, owner, config) {
  return canUse(user, config, 'comments') || (!!owner && canUse(owner, config, 'comments'))
}
