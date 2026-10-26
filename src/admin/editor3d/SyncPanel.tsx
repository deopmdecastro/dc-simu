import { useCallback, useEffect, useMemo, useState } from 'react'
import { catalogApi } from '../../catalog/catalogApi'
import { useCatalogStore } from '../../catalog/registry'
import { useComponentSettings } from '../componentSettings'
import { uiConfirm } from '../../ui/dialogs'
import { auditCatalogSync, publishDraft, syncDraft, type SyncIssueKind, type SyncRow } from './syncAudit'

const LABEL: Record<SyncIssueKind, string> = {
  'draft-only': 'Só no editor', unpublished: 'Por publicar', archived: 'Arquivado', 'builtin-update': 'Integrado atualizado',
  'draft-flipped': 'Bornes invertidos', 'published-flipped': 'Publicado invertido', 'missing-terminals': 'Bornes em falta',
  'builtin-locked': 'Sem GLB no simulador', blocked: 'Bloqueado',
}
const SEVERE: SyncIssueKind[] = ['draft-flipped', 'published-flipped', 'missing-terminals']

/** Varrimento editor ↔ simulador: o que difere, porquê, e a correção (BUILTIN-SYNC-01). */
export default function SyncPanel({ onNotice, onError, onChanged, onOpen }: { onNotice: (message: string) => void; onError: (message: string) => void; onChanged: () => void; onOpen: (id: string, name: string) => void }) {
  const [rows, setRows] = useState<SyncRow[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [showLocked, setShowLocked] = useState(false)
  const disabled = useComponentSettings((s) => s.disabled)
  const hidden = useComponentSettings((s) => s.hidden)

  const scan = useCallback(async () => {
    setRows(null)
    try {
      const list = await catalogApi.adminList()
      const full = []
      for (const entry of list) { try { full.push(await catalogApi.adminGet(entry.id)) } catch { full.push(entry) } }
      setRows(await auditCatalogSync(full, { disabled, hidden }))
    } catch (value) { onError(value instanceof Error ? value.message : 'Falha no varrimento'); setRows([]) }
  }, [disabled, hidden, onError])
  useEffect(() => { void scan() }, [scan])

  const catalogRows = useMemo(() => (rows ?? []).filter((row) => row.entryId), [rows])
  const lockedRows = useMemo(() => (rows ?? []).filter((row) => !row.entryId), [rows])
  const fixable = catalogRows.filter((row) => row.canUpgrade || row.needsPublish)

  async function fix(row: SyncRow, publish: boolean) {
    if (!row.entryId) return
    setBusy(row.key)
    try {
      const upgraded = row.canUpgrade ? await syncDraft(row.entryId) : false
      const version = publish ? await publishDraft(row.entryId) : 0
      await useCatalogStore.getState().load()
      onNotice(`«${row.name}»: ${[upgraded && 'rascunho sincronizado com o integrado', version && `publicado como v${version}`].filter(Boolean).join(' e ') || 'sem alterações'}.`)
      onChanged(); await scan()
    } catch (value) { onError(value instanceof Error ? value.message : 'Falha ao sincronizar') }
    finally { setBusy(null) }
  }
  async function fixAll() {
    if (!fixable.length) return
    const toPublish = fixable.filter((row) => row.needsPublish)
    if (!await uiConfirm(`Sincronizar ${fixable.length} componente(s) e publicar ${toPublish.length} nova(s) versão(ões)? Os projetos existentes não mudam: cada utilizador recebe um aviso e escolhe quando atualizar.`)) return
    setBusy('all')
    let done = 0
    const failed: string[] = []
    for (const row of fixable) {
      try { if (row.canUpgrade) await syncDraft(row.entryId!); if (row.needsPublish) await publishDraft(row.entryId!); done++ }
      catch (value) { failed.push(value instanceof Error ? value.message : row.name) }
    }
    await useCatalogStore.getState().load()
    setBusy(null); onChanged(); await scan()
    if (failed.length) onError(`${done} sincronizado(s); falharam ${failed.length}: ${failed.join(' · ')}`)
    else onNotice(`${done} componente(s) sincronizado(s) com o simulador.`)
  }

  return <section className="ce-sync" data-sync-panel aria-label="Sincronização editor ↔ simulador">
    <div className="ce-sync-head">
      <div>
        <h3>Sincronização editor ↔ simulador</h3>
        <p className="cb-note">O simulador 3D usa a última versão publicada (ou o integrado original). Aqui ficam todas as diferenças: rascunhos por publicar, bornes invertidos, elementos novos do integrado e integrados sem modelo GLB.</p>
      </div>
      <div className="ce-sync-actions">
        <button className="dx-btn dx-btn-secondary dx-btn-sm" disabled={!!busy} onClick={() => void scan()}>Verificar de novo</button>
        <button className="dx-btn dx-btn-primary dx-btn-sm" data-sync-all disabled={!!busy || !fixable.length} onClick={() => void fixAll()}>{busy === 'all' ? 'A sincronizar…' : `Sincronizar tudo (${fixable.length})`}</button>
      </div>
    </div>
    {rows === null ? <p className="dx-admin-empty">A comparar o editor com o simulador…</p> : <>
      <p className="ce-sync-summary" data-sync-summary>{catalogRows.length === 0 ? 'Todos os componentes do catálogo estão iguais no editor e no simulador.' : `${catalogRows.length} componente(s) do catálogo com diferenças.`} {lockedRows.length > 0 && `${lockedRows.length} integrado(s) aparecem no editor mas não podem ser inseridos no simulador.`}</p>
      {catalogRows.length > 0 && <table className="ce-sync-table">
        <thead><tr><th>Componente</th><th>Editor</th><th>Simulador</th><th>Diferenças</th><th /></tr></thead>
        <tbody>{catalogRows.map((row) => <tr key={row.key} data-sync-row={row.entryId}>
          <td><button className="ce-sync-link" onClick={() => onOpen(row.entryId!, row.name)}>{row.name}</button>{row.builtin && <small>{row.builtin}</small>}</td>
          <td>{row.editor}</td><td>{row.simulator}</td>
          <td><ul>{row.issues.map((issue) => <li key={issue.kind} data-sync-issue={issue.kind} className={SEVERE.includes(issue.kind) ? 'is-severe' : ''}><b>{LABEL[issue.kind]}</b> {issue.text}</li>)}</ul></td>
          <td className="ce-sync-fix">
            {row.canUpgrade && <button className="dx-btn dx-btn-secondary dx-btn-sm" disabled={!!busy} onClick={() => void fix(row, false)}>Corrigir rascunho</button>}
            {(row.needsPublish || row.canUpgrade) && <button className="dx-btn dx-btn-primary dx-btn-sm" disabled={!!busy} onClick={() => void fix(row, true)}>{busy === row.key ? 'A sincronizar…' : row.canUpgrade ? 'Corrigir e publicar' : 'Publicar'}</button>}
          </td>
        </tr>)}</tbody>
      </table>}
      {lockedRows.length > 0 && <details className="ce-sync-locked" open={showLocked} onToggle={(event) => setShowLocked((event.target as HTMLDetailsElement).open)}>
        <summary>Integrados só no editor ({lockedRows.length})</summary>
        <p className="cb-note">Sem modelo CAD (GLB), o simulador mostra-os bloqueados. «Editar no 3D» cria uma cópia em volume com as dimensões e os bornes certos; ao publicá-la, passa a poder ser inserida no simulador.</p>
        <ul>{lockedRows.map((row) => <li key={row.key} data-sync-locked={row.builtin}>{row.name} <small>{row.builtin}</small> — {row.issues.map((issue) => LABEL[issue.kind]).join(' · ')}</li>)}</ul>
      </details>}
    </>}
  </section>
}
