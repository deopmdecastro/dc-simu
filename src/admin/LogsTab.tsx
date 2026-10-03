import Select from '../ui/Select'
import { useCallback, useEffect, useState } from 'react'
import { formatDate } from '../contrib/ContribParts'
import { adminApi, downloadText } from './adminApi'
import { ACTION_LABEL, CATEGORY_LABEL, actionLabel, categoryOf, logsToCsv, severityOf, type AuditEntry, type LogCategory, type LogQuery } from './adminTypes'
import { IconArrowLeft, IconArrowRight, IconClose } from '../ui/icons'

const PAGE = 50
const fail = (value: unknown) => value instanceof Error ? value.message : 'Falha ao carregar os registos'
const toIso = (date: string, end: boolean) => date ? new Date(`${date}T${end ? '23:59:59.999' : '00:00:00'}`).toISOString() : ''

/** Registo de auditoria: quem fez o quê e quando (autenticação, contas, projetos, contribuições, componentes). */
export default function LogsTab({ initialActor = '', onChanged, onError }: { initialActor?: string; onChanged: (message: string) => Promise<void> | void; onError: (message: string) => void }) {
  const [category, setCategory] = useState<LogCategory | ''>('')
  const [action, setAction] = useState('')
  const [actor, setActor] = useState(initialActor)
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(0)
  const [data, setData] = useState<{ items: AuditEntry[]; total: number }>({ items: [], total: 0 })
  const [loading, setLoading] = useState(false)
  const [auto, setAuto] = useState(false)
  const [purgeDays, setPurgeDays] = useState(90)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => { const timer = window.setTimeout(() => { setSearch(text); setPage(0) }, 300); return () => window.clearTimeout(timer) }, [text])
  useEffect(() => { setActor(initialActor); setPage(0) }, [initialActor])

  const query = useCallback((): LogQuery => ({ category, action, actor: actor.trim(), q: search, from: toIso(from, false), to: toIso(to, true) }), [category, action, actor, search, from, to])

  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await adminApi.logs({ ...query(), limit: PAGE, offset: page * PAGE })) }
    catch (value) { onError(fail(value)) }
    finally { setLoading(false) }
  }, [query, page, onError])
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (!auto) return; const timer = window.setInterval(() => void load(), 10_000); return () => window.clearInterval(timer) }, [auto, load])

  const pages = Math.max(1, Math.ceil(data.total / PAGE))
  const reset = (apply: () => void) => { apply(); setPage(0) }

  async function exportCsv() {
    try {
      const all = await adminApi.logs({ ...query(), limit: 5000, offset: 0 })
      downloadText(`dcsimu-registos-${new Date().toISOString().slice(0, 10)}.csv`, logsToCsv(all.items), 'text/csv;charset=utf-8')
    } catch (value) { onError(fail(value)) }
  }

  async function purge() {
    if (!confirm(`Apagar definitivamente os registos com mais de ${purgeDays} dias?`)) return
    try {
      const result = await adminApi.purgeLogs(purgeDays)
      await onChanged(`${result.removed} registo(s) apagado(s).`)
      await load()
    } catch (value) { onError(fail(value)) }
  }

  return <>
    <div className="dx-admin-section"><h2>Registos de atividade</h2><span>{data.total} evento(s){loading ? ' · a atualizar…' : ''}</span></div>
    <div className="cb-filters cb-filters-logs">
      <input className="dx-input" type="search" placeholder="Pesquisar utilizador, alvo ou detalhe…" value={text} onChange={(event) => setText(event.target.value)} aria-label="Pesquisar nos registos" />
      <Select className="dx-input" value={category} onChange={(event) => reset(() => { setCategory(event.target.value as LogCategory | ''); setAction('') })} aria-label="Categoria">
        <option value="">Todas as categorias</option>{(Object.keys(CATEGORY_LABEL) as LogCategory[]).map((key) => <option key={key} value={key}>{CATEGORY_LABEL[key]}</option>)}
      </Select>
      <Select className="dx-input" value={action} onChange={(event) => reset(() => setAction(event.target.value))} aria-label="Ação">
        <option value="">Todas as ações</option>
        {Object.entries(ACTION_LABEL).filter(([key]) => !category || categoryOf(key) === category).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </Select>
      <input className="dx-input" type="date" value={from} max={to || undefined} onChange={(event) => reset(() => setFrom(event.target.value))} aria-label="Desde" title="Desde" />
      <input className="dx-input" type="date" value={to} min={from || undefined} onChange={(event) => reset(() => setTo(event.target.value))} aria-label="Até" title="Até" />
    </div>
    {actor && <div className="cb-chipbar"><span className="cb-badge">Utilizador: {actor}<button aria-label="Remover filtro de utilizador" onClick={() => reset(() => setActor(''))}><IconClose size={10} /></button></span></div>}

    <div className="cb-logs" role="table" aria-label="Registos de atividade">
      {data.items.length === 0 && <div className="dx-admin-empty">{loading ? 'A carregar…' : 'Nenhum evento com este filtro.'}</div>}
      {data.items.map((entry) => {
        const severity = severityOf(entry.action)
        const open = openId === entry.id
        return <div key={entry.id} role="row" className={`cb-log is-${severity} ${open ? 'is-open' : ''}`}>
          <button type="button" className="cb-log-main" onClick={() => setOpenId(open ? null : entry.id)} aria-expanded={open}>
            <span className="cb-log-dot" aria-hidden />
            <span className="cb-log-time">{formatDate(entry.at)}</span>
            <span className="cb-log-action"><strong>{actionLabel(entry.action)}</strong><small>{CATEGORY_LABEL[categoryOf(entry.action)]}</small></span>
            <span className="cb-log-who">{entry.actorEmail || entry.actorName || 'sistema'}</span>
            <span className="cb-log-target">{entry.targetLabel || '—'}{entry.detail ? <small>{entry.detail}</small> : null}</span>
          </button>
          {open && <dl className="cb-log-detail">
            <div><dt>Data completa</dt><dd>{new Date(entry.at).toLocaleString('pt-PT')}</dd></div>
            <div><dt>Ação</dt><dd><code>{entry.action}</code></dd></div>
            <div><dt>Utilizador</dt><dd>{[entry.actorName, entry.actorEmail].filter(Boolean).join(' · ') || '—'}</dd></div>
            <div><dt>Alvo</dt><dd>{[entry.targetType, entry.targetLabel, entry.targetId].filter(Boolean).join(' · ') || '—'}</dd></div>
            <div><dt>Detalhe</dt><dd>{entry.detail || '—'}</dd></div>
            <div><dt>Endereço IP</dt><dd>{entry.ip || '—'}</dd></div>
            {entry.actorEmail && <div><dt /><dd><button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => reset(() => setActor(entry.actorEmail!))}>Filtrar por este utilizador</button></dd></div>}
          </dl>}
        </div>
      })}
    </div>

    <div className="cb-pager">
      <button className="dx-btn dx-btn-secondary dx-btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}><IconArrowLeft size={11} /> Mais recentes</button>
      <span>Página {page + 1} de {pages}</span>
      <button className="dx-btn dx-btn-secondary dx-btn-sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Mais antigos <IconArrowRight size={11} /></button>
    </div>

    <div className="cb-logtools">
      <label className="cb-check"><input type="checkbox" checked={auto} onChange={(event) => setAuto(event.target.checked)} /> Atualizar automaticamente (10 s)</label>
      <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => void load()}>Atualizar</button>
      <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => void exportCsv()} disabled={data.total === 0}>Exportar CSV ({Math.min(data.total, 5000)})</button>
      <span className="cb-logtools-purge">
        <Select className="dx-input" value={purgeDays} onChange={(event) => setPurgeDays(Number(event.target.value))} aria-label="Antiguidade a apagar">
          {[30, 90, 180, 365].map((days) => <option key={days} value={days}>mais de {days} dias</option>)}
        </Select>
        <button className="dx-btn dx-btn-danger dx-btn-sm" onClick={() => void purge()}>Apagar antigos</button>
      </span>
    </div>
    <p className="cb-note">Os registos incluem o endereço IP das sessões e nunca guardam palavras-passe. As ações de administração, inclusive apagar registos, ficam também registadas.</p>
  </>
}
