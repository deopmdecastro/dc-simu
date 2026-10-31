/**
 * Ligação entre páginas do Esquema IEC (conectores pageRef → / pageRefIn ←).
 * O mesmo nome de rede une electricamente os conectores de páginas diferentes.
 * Mesma estrutura das janelas de propriedades do GRAFCET (campos + pré-visualização).
 */
import { useMemo, useState } from 'react'
import { nanoid } from 'nanoid'
import PropertyDialog from '../ui/PropertyDialog'
import { useSimStore } from '../store/useSimStore'
import { emptyCommands, partBox, type CmdPart } from './model'
import { commitDiagram } from './editing'
import { addPage, pageIdOf, pagesOf } from './pages'
import { useCommandsUi } from './commandsUi'

const NEW_PAGE = '__new__'
const isLink = (p: CmdPart) => p.kind === 'pageRef' || p.kind === 'pageRefIn'
const cleanName = (value: string) => value.trim().toUpperCase().replace(/\s+/g, '')

export default function PageLinkDialog({
  partId,
  onClose,
  onGoPage,
}: {
  partId: string
  onClose: () => void
  /** Abre a página e (se indicado) seleciona e centra esse conector. */
  onGoPage: (pageId: string, focusPartId?: string) => void
}) {
  const diagram = useSimStore((s) => s.commands) ?? emptyCommands()
  const part = diagram.parts.find((p) => p.id === partId)
  const pages = pagesOf(diagram)
  const firstPage = pages[0]?.id
  const currentPage = pageIdOf(part, firstPage)
  const currentPageName = pages.find((p) => p.id === currentPage)?.name ?? 'esta página'
  const [name, setName] = useState(() => cleanName(part?.tag || 'X1'))
  const [kind, setKind] = useState<CmdPart['kind']>(() => part?.kind ?? 'pageRef')
  const otherPages = pages.filter((p) => p.id !== currentPage)
  const net = cleanName(name)

  /** Conectores com o mesmo nome noutras páginas (a ligação real). */
  const peers = useMemo(() => diagram.parts
    .filter((p) => isLink(p) && p.id !== partId && cleanName(p.tag) === net)
    .map((p) => ({ part: p, page: pages.find((pg) => pg.id === pageIdOf(p, firstPage)) }))
    .filter((p): p is { part: CmdPart; page: { id: string; name: string } } => !!p.page), [diagram, partId, net, pages, firstPage])
  const remotePeers = peers.filter((p) => p.page.id !== currentPage)
  const samePagePeers = peers.filter((p) => p.page.id === currentPage)
  /** Nomes de rede já usados (sugestões). */
  const knownNames = useMemo(() => [...new Set(diagram.parts.filter((p) => isLink(p) && p.id !== partId).map((p) => cleanName(p.tag)).filter(Boolean))].sort(), [diagram, partId])

  const [target, setTarget] = useState(() => remotePeers[0]?.page.id ?? otherPages[0]?.id ?? NEW_PAGE)
  const targetPeer = remotePeers.find((p) => p.page.id === target)

  if (!part || !isLink(part)) return null

  const pairKind: CmdPart['kind'] = kind === 'pageRef' ? 'pageRefIn' : 'pageRef'
  const nameError = !net ? 'Indique o nome da rede (ex.: X1, 24V, L1).' : ''
  const outgoing = kind === 'pageRef'

  /** Grava o nome e o sentido deste conector (sem fechar). */
  const withThis = (parts: CmdPart[]) => parts.map((p) => (p.id === part.id ? { ...p, tag: net, kind } : p))

  const save = () => {
    if (nameError) return
    commitDiagram({ ...diagram, parts: withThis(diagram.parts) })
    onClose()
  }

  /** Cria (se preciso) a página e o conector espelho, e abre-o. */
  const createPair = () => {
    if (nameError) return
    let next = { ...diagram, parts: withThis(diagram.parts) }
    let pageId = target
    if (target === NEW_PAGE) {
      const before = new Set(pagesOf(next).map((p) => p.id))
      next = addPage(next)
      pageId = pagesOf(next).find((p) => !before.has(p.id))!.id
    }
    const existing = next.parts.find((p) => isLink(p) && cleanName(p.tag) === net && pageIdOf(p, firstPage) === pageId && p.id !== part.id)
    if (existing) { commitDiagram(next); onGoPage(pageId, existing.id); return }
    // Mesmo sítio da página de origem, ou o primeiro lugar livre abaixo.
    const occupied = next.parts.filter((p) => pageIdOf(p, firstPage) === pageId).map(partBox)
    let y = part.y
    const peerAt = (yy: number) => partBox({ ...part, id: 'probe', kind: pairKind, y: yy })
    const overlaps = (yy: number) => { const b = peerAt(yy); return occupied.some((o) => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y) }
    for (let i = 0; i < 30 && overlaps(y); i++) y += 40
    const peer: CmdPart = { id: nanoid(8), kind: pairKind, x: part.x, y, rot: part.rot, tag: net, page: pageId }
    commitDiagram({ ...next, parts: [...next.parts, peer] })
    useCommandsUi.getState().select({ type: 'part', id: peer.id })
    onGoPage(pageId, peer.id)
  }

  return (
    <PropertyDialog
      open
      id="cmd-page-link"
      className="dc-cmd-link-dialog"
      eyebrow="Esquema IEC · ligação entre páginas"
      title={`Ligação ${net || '…'}`}
      subtitle={outgoing ? `Leva a corrente de «${currentPageName}» para as páginas com o mesmo nome de rede.` : `Traz para «${currentPageName}» a corrente das páginas com o mesmo nome de rede.`}
      onClose={onClose}
      onSave={save}
      saveDisabled={!!nameError}
      saveLabel="Guardar"
      closeLabel="Cancelar"
    >
      <div className="grafcet-property-grid">
        <section className="grafcet-property-fields" aria-label="Definições da ligação">
          <div className="grafcet-property-field">
            <label htmlFor="cmd-link-name">Nome da rede <span className="grafcet-required">obrigatório</span></label>
            <input id="cmd-link-name" data-initial-focus className="dc-input" value={name} list="cmd-link-names" maxLength={16}
              onChange={(e) => setName(e.target.value.toUpperCase().replace(/\s+/g, ''))}
              placeholder="Ex.: X1, 24V, L1" aria-invalid={!!nameError} aria-describedby="cmd-link-name-help" />
            <datalist id="cmd-link-names">{knownNames.map((n) => <option key={n} value={n} />)}</datalist>
            {nameError
              ? <p className="grafcet-field-error" role="alert">{nameError}</p>
              : <p id="cmd-link-name-help" className="grafcet-property-note">O mesmo nome nas duas páginas une a corrente — como um fio que continua noutra folha.</p>}
            {!!knownNames.length && <div className="grafcet-property-chips" aria-label="Nomes já usados">{knownNames.slice(0, 8).map((n) => <button key={n} type="button" aria-pressed={n === net} onClick={() => setName(n)}>{n}</button>)}</div>}
          </div>

          <fieldset className="grafcet-property-section dc-cmd-link-direction">
            <legend>Sentido</legend>
            <div className="dc-cmd-link-toggle" role="radiogroup" aria-label="Sentido da ligação">
              <button type="button" role="radio" aria-checked={outgoing} className={outgoing ? 'is-on' : ''} onClick={() => setKind('pageRef')}><b>Saída →</b><small>vai para outra página</small></button>
              <button type="button" role="radio" aria-checked={!outgoing} className={!outgoing ? 'is-on' : ''} onClick={() => setKind('pageRefIn')}><b>← Entrada</b><small>vem de outra página</small></button>
            </div>
          </fieldset>

          <div className="grafcet-property-field">
            <span className="grafcet-property-label">Ligado a</span>
            {remotePeers.length ? (
              <ul className="dc-cmd-link-peers" aria-label="Conectores com o mesmo nome">
                {remotePeers.map(({ part: p, page }) => (
                  <li key={p.id}>
                    <span className={`dc-cmd-link-dot ${p.kind === 'pageRef' ? 'is-out' : 'is-in'}`} aria-hidden="true" />
                    <span><b>{page.name}</b><small>{p.kind === 'pageRef' ? 'saída →' : '← entrada'}</small></span>
                    <button type="button" className="dc-btn" onClick={() => { commitDiagram({ ...diagram, parts: withThis(diagram.parts) }); onGoPage(page.id, p.id) }}>Abrir</button>
                  </li>
                ))}
              </ul>
            ) : <p className="grafcet-property-warning" role="status">Ainda sem par noutra página — a corrente não passa enquanto não existir um conector «{net || '…'}» noutra folha.</p>}
            {samePagePeers.length > 0 && <p className="grafcet-property-note">Há {samePagePeers.length} conector(es) «{net}» nesta mesma página: ficam unidos, mas para mudar de folha use outra página.</p>}
          </div>

          <div className="grafcet-property-field dc-cmd-link-create">
            <label htmlFor="cmd-link-target">{targetPeer ? 'Abrir o par em' : 'Criar o par em'}</label>
            <div className="grafcet-var-row">
              <select id="cmd-link-target" className="dc-input" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Página do conector par">
                {otherPages.map((p) => <option key={p.id} value={p.id}>{p.name}{remotePeers.some((r) => r.page.id === p.id) ? ' · já ligada' : ''}</option>)}
                <option value={NEW_PAGE}>+ Nova página</option>
              </select>
              <button type="button" className="dc-btn dc-btn-primary" disabled={!!nameError} onClick={createPair}>
                {targetPeer ? 'Abrir página' : target === NEW_PAGE ? 'Criar página e par' : 'Criar par e abrir'}
              </button>
            </div>
            <p className="grafcet-property-note">{targetPeer ? 'O conector já existe nessa página: abre-a e seleciona-o.' : `Cria um conector de ${outgoing ? 'entrada ←' : 'saída →'} com o nome «${net || '…'}» no mesmo sítio da outra página.`}</p>
          </div>
        </section>

        <aside className="grafcet-property-preview dc-cmd-link-preview" aria-label="Pré-visualização da ligação">
          <span className="grafcet-property-preview-label">Pré-visualização</span>
          <svg viewBox="0 0 220 120" role="img" aria-label={`${currentPageName} ${outgoing ? '→' : '←'} ${remotePeers.map((p) => p.page.name).join(', ') || 'outra página'}`}>
            <rect x="6" y="18" width="88" height="84" rx="8" className="dc-cmd-link-sheet" />
            <rect x="126" y="18" width="88" height="84" rx="8" className={`dc-cmd-link-sheet ${remotePeers.length ? '' : 'is-missing'}`} />
            <text x="50" y="36" textAnchor="middle" className="dc-cmd-link-sheet-name">{currentPageName.slice(0, 12)}</text>
            <text x="170" y="36" textAnchor="middle" className="dc-cmd-link-sheet-name">{(targetPeer?.page.name ?? remotePeers[0]?.page.name ?? (target === NEW_PAGE ? 'Nova página' : otherPages.find((p) => p.id === target)?.name ?? '—')).slice(0, 12)}</text>
            <line x1="30" y1="70" x2="74" y2="70" className="dc-cmd-link-wire" />
            <rect x="74" y="60" width="16" height="20" rx="2" className="dc-cmd-link-box" />
            <line x1="146" y1="70" x2="190" y2="70" className={`dc-cmd-link-wire ${remotePeers.length ? '' : 'is-missing'}`} />
            <rect x="130" y="60" width="16" height="20" rx="2" className={`dc-cmd-link-box ${remotePeers.length ? '' : 'is-missing'}`} />
            <path d={outgoing ? 'M 96 70 L 124 70 M 118 64 L 124 70 L 118 76' : 'M 124 70 L 96 70 M 102 64 L 96 70 L 102 76'} className="dc-cmd-link-arrow" />
            <text x="110" y="60" textAnchor="middle" className="dc-cmd-link-net">{net || '…'}</text>
          </svg>
          <p className="grafcet-property-preview-value">{remotePeers.length ? `${remotePeers.length} página(s) ligada(s)` : 'Sem par'}</p>
        </aside>
      </div>
    </PropertyDialog>
  )
}
