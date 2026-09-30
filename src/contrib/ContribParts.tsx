import { lazy, Suspense, useEffect, useState } from 'react'
import { TEMPLATES } from '../electrical/factory'
import type { ComponentType } from '../types'
import { contribApi, downloadContribution } from './contribApi'
import { KIND_LABEL, STATUS_LABEL, type Contribution, type ContributionStatus } from './types'

export const GlbPreview = lazy(() => import('./GlbPreview'))

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Opções do simulador: tipo de componente → nome da paleta (ordenado). */
export const COMPONENT_OPTIONS: Array<{ type: ComponentType; label: string; group: string }> = (Object.entries(TEMPLATES) as Array<[ComponentType, { paletteName: string; group: string }]>)
  .map(([type, template]) => ({ type, label: template.paletteName, group: template.group }))
  .sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label))

export function componentLabel(item: Pick<Contribution, 'componentType' | 'customName'>) {
  if (!item.componentType) return `${item.customName || 'Componente novo'} (novo)`
  return TEMPLATES[item.componentType]?.paletteName ?? item.componentType
}

export function StatusChip({ status }: { status: ContributionStatus }) {
  return <span className={`cb-status is-${status}`}>{STATUS_LABEL[status]}</span>
}

export function formatDate(value: string) {
  try { return new Date(value).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }) } catch { return value }
}

/** Obtém o ficheiro de uma contribuição como URL de blob (libertado ao desmontar). */
export function useContributionUrl(item: Contribution | null) {
  const [state, setState] = useState<{ url: string | null; error: string }>({ url: null, error: '' })
  useEffect(() => {
    if (!item) { setState({ url: null, error: '' }); return }
    let active = true
    let created: string | null = null
    setState({ url: null, error: '' })
    contribApi.file(item.id)
      .then((blob) => {
        if (!active) return
        created = URL.createObjectURL(blob)
        setState({ url: created, error: '' })
      })
      .catch((error) => { if (active) setState({ url: null, error: error instanceof Error ? error.message : 'Não foi possível obter o ficheiro.' }) })
    return () => { active = false; if (created) URL.revokeObjectURL(created) }
  }, [item?.id, item?.updatedAt])
  return state
}

/** Pré-visualização: PDF abre no visualizador do navegador; GLB mostra-se em 3D. */
export function ContributionPreview({ item }: { item: Contribution }) {
  const { url, error } = useContributionUrl(item)
  if (error) return <p className="cb-note is-error" role="alert">{error}</p>
  if (!url) return <p className="cb-note">A carregar o ficheiro…</p>
  if (item.kind === 'datasheet') {
    return <div className="cb-pdf">
      <object data={url} type="application/pdf" aria-label={`Pré-visualização de ${item.fileName}`}><a className="dx-btn dx-btn-secondary dx-btn-sm" href={url} target="_blank" rel="noopener noreferrer">Abrir PDF ↗</a></object>
    </div>
  }
  return <Suspense fallback={<p className="cb-note">A preparar a pré-visualização 3D…</p>}><GlbPreview url={url} /></Suspense>
}

/** Linha de contribuição; as ações dependem de quem a vê. */
export function ContributionRow({ item, expanded, onToggle, actions, showAuthor = false }: {
  item: Contribution
  expanded: boolean
  onToggle: () => void
  actions?: React.ReactNode
  showAuthor?: boolean
}) {
  const [error, setError] = useState('')
  return <article className={`cb-row ${expanded ? 'is-open' : ''}`}>
    <header>
      <button type="button" className="cb-row-main" onClick={onToggle} aria-expanded={expanded}>
        <span className={`cb-kind is-${item.kind}`} aria-hidden>{item.kind === 'datasheet' ? 'PDF' : 'GLB'}</span>
        <span className="cb-row-title"><strong>{item.title}</strong><small>{componentLabel(item)} · {item.fileName} · {formatBytes(item.size)}{showAuthor ? ` · ${item.authorName}` : ''} · {formatDate(item.updatedAt)}</small></span>
        <StatusChip status={item.status} />
      </button>
    </header>
    {expanded && <div className="cb-row-body">
      {item.description && <p className="cb-desc">{item.description}</p>}
      {item.glb && <p className="cb-note">GLB {item.glb.version}.0 · {item.glb.meshes} malha(s) · {item.glb.nodes} nó(s) · {item.glb.materials} material(is){item.glb.generator ? ` · ${item.glb.generator}` : ''}</p>}
      {item.reviewNote && <p className={`cb-note ${item.status === 'rejected' ? 'is-error' : ''}`}><strong>{item.reviewedBy ? `${item.reviewedBy}: ` : ''}</strong>{item.reviewNote}</p>}
      <ContributionPreview item={item} />
      {error && <p className="cb-note is-error" role="alert">{error}</p>}
      <div className="cb-actions">
        <button type="button" className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => downloadContribution(item).catch((cause) => setError(cause instanceof Error ? cause.message : 'Falha ao descarregar'))}>↓ Descarregar {KIND_LABEL[item.kind].split(' ')[0]}</button>
        {actions}
      </div>
    </div>}
  </article>
}
