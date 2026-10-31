/** Modal de linkagem entre páginas do esquema IEC (conectores pageRef / pageRefIn). */
import { useMemo, useState } from 'react'
import { nanoid } from 'nanoid'
import PropertyDialog from '../ui/PropertyDialog'
import { useSimStore } from '../store/useSimStore'
import { emptyCommands, type CmdPart } from './model'
import { commitDiagram } from './editing'
import { pageIdOf, pageRefPeers, pagesOf } from './pages'
import { useCommandsUi } from './commandsUi'

export default function PageLinkDialog({
  partId,
  onClose,
  onGoPage,
}: {
  partId: string
  onClose: () => void
  onGoPage: (pageId: string) => void
}) {
  const diagram = useSimStore((s) => s.commands) ?? emptyCommands()
  const part = diagram.parts.find((p) => p.id === partId)
  const pages = pagesOf(diagram)
  const [tag, setTag] = useState(() => (part?.tag || 'X1').toUpperCase())
  const currentPage = pageIdOf(part, pages[0]?.id)
  const [targetPage, setTargetPage] = useState(() => {
    const peers = part ? pageRefPeers(diagram, part.tag, currentPage) : []
    return peers[0]?.id ?? pages.find((p) => p.id !== currentPage)?.id ?? pages[0]?.id ?? ''
  })

  const peers = useMemo(() => pageRefPeers(diagram, tag, currentPage), [diagram, tag, currentPage])
  const otherPages = pages.filter((p) => p.id !== currentPage)

  if (!part || (part.kind !== 'pageRef' && part.kind !== 'pageRefIn')) {
    return null
  }

  const pairKind: CmdPart['kind'] = part.kind === 'pageRef' ? 'pageRefIn' : 'pageRef'

  const save = () => {
    const nextTag = tag.trim().toUpperCase().replace(/\s+/g, '') || part.tag
    commitDiagram({
      ...diagram,
      parts: diagram.parts.map((p) => (p.id === part.id ? { ...p, tag: nextTag } : p)),
    })
    onClose()
  }

  const createPeer = () => {
    if (!targetPage) return
    const nextTag = tag.trim().toUpperCase().replace(/\s+/g, '') || part.tag
    // Actualiza o tag local e cria o par na página destino (se ainda não existir).
    const hasPeer = diagram.parts.some(
      (p) => (p.kind === 'pageRef' || p.kind === 'pageRefIn') && p.tag.trim() === nextTag && pageIdOf(p, pages[0].id) === targetPage,
    )
    const parts = diagram.parts.map((p) => (p.id === part.id ? { ...p, tag: nextTag } : p))
    if (!hasPeer) {
      const peer: CmdPart = {
        id: nanoid(8),
        kind: pairKind,
        x: part.x,
        y: part.y,
        rot: 0,
        tag: nextTag,
        page: targetPage,
      }
      parts.push(peer)
    }
    commitDiagram({ ...diagram, parts })
    useCommandsUi.getState().select({ type: 'part', id: part.id })
    onGoPage(targetPage)
  }

  return (
    <PropertyDialog
      open
      id="cmd-page-link"
      eyebrow="Esquema IEC"
      title={`Ligação ${part.tag || 'X…'}`}
      subtitle="Une a corrente entre páginas com o mesmo nome de rede"
      onClose={onClose}
      onSave={save}
      saveLabel="Guardar nome"
      closeLabel="Fechar"
    >
      <label className="dc-cmd-field">
        <span>Nome da ligação (rede)</span>
        <input
          className="dc-input"
          value={tag}
          onChange={(e) => setTag(e.target.value.toUpperCase().replace(/\s+/g, ''))}
          placeholder="Ex.: X1, 24V, L1"
          aria-label="Nome da ligação entre páginas"
          autoFocus
        />
      </label>

      <p className="dc-cmd-muted" style={{ margin: '4px 0 8px' }}>
        {peers.length
          ? <>Ligado a: {peers.map((p) => p.name).join(', ')}</>
          : <>Ainda sem par noutra página. Escolha a página destino e crie o conector espelho.</>}
      </p>

      {otherPages.length > 0 ? (
        <label className="dc-cmd-field">
          <span>Página destino</span>
          <select className="dc-input" value={targetPage} onChange={(e) => setTargetPage(e.target.value)} aria-label="Página destino da ligação">
            {otherPages.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      ) : (
        <p className="dc-cmd-muted">Crie outra página no separador superior para poder linkar.</p>
      )}

      <div className="dc-cmd-actions" style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className="dc-btn" disabled={!targetPage || otherPages.length === 0} onClick={createPeer}>
          Criar par na página e ir
        </button>
        {peers.map((p) => (
          <button key={p.id} type="button" className="dc-btn" onClick={() => onGoPage(p.id)}>
            Ir a {p.name}
          </button>
        ))}
      </div>
    </PropertyDialog>
  )
}
