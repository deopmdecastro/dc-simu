import { useMemo, useState } from 'react'
import { nanoid } from 'nanoid'
import { useSimStore } from '../store/useSimStore'
import PropertyDialog from '../ui/PropertyDialog'
import ImportPreview from '../excel/ImportPreview'
import SheetTransferBar from '../excel/SheetTransferBar'
import { foldText } from '../utils/text'
import {
  ROTATIONS, componentRowsToSheets, componentTemplateSheets, componentToRow, componentTypeName, componentTypeOptions, emptyComponentRow,
  parseComponentSheets, planComponentRows, reduceToChanges, type ComponentRow, type ParsedComponentRow,
} from '../excel/componentSheet'
import type { ImportIssue, RawSheet } from '../excel/sheetIO'

type DraftRow = ComponentRow & { key: string; fromProject: boolean }

const sameRef = (a: string, b: string) => foldText(a).trim() === foldText(b).trim()
const numberValue = (text: string): number | null => { const value = Number(text.replace(',', '.')); return text.trim() === '' || !Number.isFinite(value) ? null : value }

/**
 * Tabela de componentes do projeto (Painel 3D / Esquema): cria e atualiza equipamentos a partir de linhas
 * editáveis ou de um Excel. Nada é aplicado até «Aplicar»; nunca apaga componentes nem cabos.
 */
export default function ComponentTableDialog({ onClose }: { onClose: () => void }) {
  const components = useSimStore((state) => state.components)
  const applyComponentPlan = useSimStore((state) => state.applyComponentPlan)
  const [rows, setRows] = useState<DraftRow[]>(() => components.map((component) => ({ ...componentToRow(component, components), key: component.id, fromProject: true })).sort((a, b) => a.ref.localeCompare(b.ref, 'pt-PT', { numeric: true })))
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState<{ fileName: string; rows: ParsedComponentRow[]; issues: ImportIssue[] } | null>(null)
  const [notice, setNotice] = useState('')
  const typeOptions = useMemo(() => componentTypeOptions(), [])
  const groups = useMemo(() => [...new Set(typeOptions.map((option) => option.group))], [typeOptions])
  const railRefs = useMemo(() => [...components, ...rows].filter((item) => item.type === 'dinRail15x55').map((item) => item.ref).filter(Boolean), [components, rows])

  const plan = useMemo(() => {
    const planned = planComponentRows(rows.map((row, index) => ({ ...row, row: index + 1 })), components)
    return { ...planned, ...reduceToChanges(planned.items, components) }
  }, [rows, components])
  const created = plan.items.filter((item) => item.action === 'create').length
  const updated = plan.items.length - created
  const errorRows = new Set(plan.issues.filter((issue) => issue.level === 'error').map((issue) => issue.row))
  const visible = rows.map((row, index) => ({ row, index })).filter(({ row }) => !query.trim() || foldText(`${row.ref} ${row.label} ${componentTypeName(row.type)}`).includes(foldText(query)))

  const patch = (key: string, change: Partial<ComponentRow>) => setRows((list) => list.map((row) => (row.key === key ? { ...row, ...change } : row)))
  const addRow = () => { setRows((list) => [...list, { ...emptyComponentRow(), key: nanoid(6), fromProject: false }]); setQuery('') }

  const read = (sheets: RawSheet[], fileName: string) => {
    const parsed = parseComponentSheets(sheets)
    const preview = planComponentRows(parsed.rows, components)
    setPending({ fileName, rows: parsed.rows, issues: [...parsed.issues, ...preview.issues] })
  }

  const mergeImported = () => {
    if (!pending) return
    const usable = new Set(planComponentRows(pending.rows, components).items.map((item) => item.row))
    setRows((list) => {
      let next = [...list]
      for (const incoming of pending.rows.filter((row) => usable.has(row.row))) {
        const index = incoming.ref ? next.findIndex((row) => sameRef(row.ref, incoming.ref)) : -1
        const { sheet: _sheet, row: _row, ...data } = incoming
        if (index >= 0) {
          const current = next[index]
          next[index] = { ...current, label: data.label || current.label, xMm: data.xMm ?? current.xMm, yMm: data.yMm ?? current.yMm, rotation: data.rotation ?? current.rotation, mirrored: data.mirrored ?? current.mirrored, locked: data.locked ?? current.locked, rail: data.rail || current.rail, railOffsetMm: data.railOffsetMm ?? current.railOffsetMm, type: current.fromProject ? current.type : data.type || current.type }
        } else next = [...next, { ...data, key: nanoid(6), fromProject: false }]
      }
      return next
    })
    setNotice('Linhas importadas para o rascunho. Reveja e prima «Aplicar».')
    setPending(null)
  }

  const apply = () => {
    if (!plan.items.length) { setNotice(errorRows.size ? 'Corrija as linhas a vermelho antes de aplicar.' : 'Não há alterações para aplicar.'); return }
    const result = applyComponentPlan(plan.items)
    if (result.created + result.updated > 0) onClose()
  }

  const summary = pending ? (() => {
    const preview = reduceToChanges(planComponentRows(pending.rows, components).items, components)
    const newCount = preview.items.filter((item) => item.action === 'create').length
    return [`${pending.rows.length} linha(s) no ficheiro: ${newCount} a criar, ${preview.items.length - newCount} a atualizar, ${preview.unchanged} sem alterações.`, 'As linhas passam para o rascunho da tabela; só são aplicadas ao projeto em «Aplicar».']
  })() : []

  return (
    <>
      <PropertyDialog open id="component-table" title="Tabela de componentes" subtitle="Crie e posicione equipamentos no Painel 3D por tabela ou Excel." eyebrow="PAINEL 3D · COMPONENTES" saveLabel={`Aplicar${plan.items.length ? ` (${plan.items.length})` : ''}`} saveDisabled={!plan.items.length} onClose={onClose} onSave={apply} className="component-table-dialog">
        <div className="component-table">
          <div className="component-table-tools">
            <input className="dc-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Procurar por ref, nome ou tipo…" aria-label="Procurar componente" data-initial-focus />
            <div className="sheet-bar">
              <button type="button" className="dc-btn" onClick={addRow}>+ Linha</button>
              <SheetTransferBar fileName="componentes-3d" template={componentTemplateSheets} current={() => componentRowsToSheets(rows)} onImport={read} />
            </div>
          </div>
          <div className="component-table-grid">
            <table>
              <thead><tr><th>Ref</th><th>Tipo</th><th>Nome</th><th>X (mm)</th><th>Y (mm)</th><th>Rot.</th><th>Espelh.</th><th>Bloq.</th><th>Calha</th><th>Pos. calha</th><th><span className="sr-only">Remover</span></th></tr></thead>
              <tbody>
                {visible.map(({ row, index }) => {
                  const invalid = errorRows.has(index + 1)
                  return (
                    <tr key={row.key} className={invalid ? 'is-invalid' : row.fromProject ? undefined : 'is-new'}>
                      <td><input className="dc-input is-ref" value={row.ref} onChange={(event) => patch(row.key, { ref: event.target.value })} placeholder="auto" aria-label={`Ref da linha ${index + 1}`} /></td>
                      <td>{row.fromProject ? <span title={row.type}>{componentTypeName(row.type)}</span> : (
                        <select className="dc-input" value={row.type} onChange={(event) => patch(row.key, { type: event.target.value as ComponentRow['type'] })} aria-label={`Tipo da linha ${index + 1}`}>
                          <option value="">Escolha o tipo…</option>
                          {groups.map((group) => <optgroup key={group} label={group}>{typeOptions.filter((option) => option.group === group).map((option) => <option key={option.type} value={option.type}>{option.name}</option>)}</optgroup>)}
                        </select>
                      )}</td>
                      <td><input className="dc-input" value={row.label} onChange={(event) => patch(row.key, { label: event.target.value })} aria-label={`Nome da linha ${index + 1}`} /></td>
                      <td><input className="dc-input is-num" inputMode="decimal" value={row.xMm ?? ''} onChange={(event) => patch(row.key, { xMm: numberValue(event.target.value) })} aria-label={`X da linha ${index + 1}`} placeholder="livre" /></td>
                      <td><input className="dc-input is-num" inputMode="decimal" value={row.yMm ?? ''} onChange={(event) => patch(row.key, { yMm: numberValue(event.target.value) })} aria-label={`Y da linha ${index + 1}`} placeholder="livre" /></td>
                      <td><select className="dc-input is-narrow" value={row.rotation ?? 0} onChange={(event) => patch(row.key, { rotation: Number(event.target.value) })} aria-label={`Rotação da linha ${index + 1}`}>{ROTATIONS.map((angle) => <option key={angle} value={angle}>{angle}°</option>)}</select></td>
                      <td className="text-center"><input type="checkbox" checked={!!row.mirrored} onChange={(event) => patch(row.key, { mirrored: event.target.checked })} aria-label={`Espelhado, linha ${index + 1}`} /></td>
                      <td className="text-center"><input type="checkbox" checked={!!row.locked} onChange={(event) => patch(row.key, { locked: event.target.checked })} aria-label={`Bloqueado, linha ${index + 1}`} /></td>
                      <td><input className="dc-input is-ref" list="component-table-rails" value={row.rail} onChange={(event) => patch(row.key, { rail: event.target.value })} aria-label={`Calha da linha ${index + 1}`} /></td>
                      <td><input className="dc-input is-num" inputMode="decimal" value={row.railOffsetMm ?? ''} onChange={(event) => patch(row.key, { railOffsetMm: numberValue(event.target.value) })} disabled={!row.rail} aria-label={`Posição na calha da linha ${index + 1}`} /></td>
                      <td>{!row.fromProject && <button type="button" className="component-table-remove" onClick={() => setRows((list) => list.filter((item) => item.key !== row.key))} aria-label={`Remover linha ${index + 1}`}>×</button>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <datalist id="component-table-rails">{railRefs.map((ref) => <option key={ref} value={ref} />)}</datalist>
            {!visible.length && <p className="component-table-note" style={{ padding: 12 }}>{rows.length ? `Nenhum componente corresponde a «${query}».` : 'O projeto ainda não tem componentes. Adicione uma linha ou importe um Excel.'}</p>}
          </div>
          <p className={`component-table-status${errorRows.size ? ' is-error' : ''}`} role="status">
            {notice || (errorRows.size ? `${errorRows.size} linha(s) com erro: ${plan.issues.find((issue) => issue.level === 'error')?.message}` : `${created} a criar · ${updated} a atualizar${plan.unchanged ? ` · ${plan.unchanged} sem alterações` : ''}`)}
          </p>
          <p className="component-table-note">X e Y são a posição do centro da peça no Painel 3D, em milímetros a partir do centro do painel. Os componentes existentes mantêm o tipo; para apagar peças ou cabos use o editor.</p>
        </div>
      </PropertyDialog>
      {pending && <ImportPreview title="Importar tabela de componentes" eyebrow="PAINEL 3D · COMPONENTES" fileName={pending.fileName} issues={pending.issues} summary={summary} empty={!pending.rows.length} onClose={() => setPending(null)} onApply={mergeImported} />}
    </>
  )
}
