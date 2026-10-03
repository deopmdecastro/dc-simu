import { useSimStore } from '../store/useSimStore'
import { IconChevronDown, IconChevronUp, IconClose, IconCopy, IconDelete, IconLock, IconRotate, IconTools } from '../ui/icons'

/**
 * Barra contextual flutuante: aparece quando há um objeto selecionado e dá acesso
 * direto (toque ou rato) a apagar, rodar, duplicar, bloquear e limpar a seleção.
 */
export default function SelectionBar() {
  const ids = useSimStore((s) => s.selectedComponentIds)
  const wireId = useSimStore((s) => s.selectedWireId)
  const terminalId = useSimStore((s) => s.selectedTerminalId)
  const locked = useSimStore((s) => s.components.some((c) => ids.includes(c.id) && c.locked))
  const rotate = useSimStore((s) => s.rotateComponents)
  const duplicate = useSimStore((s) => s.duplicateComponents)
  const toggleLock = useSimStore((s) => s.toggleLock)
  const remove = useSimStore((s) => s.deleteSelection)
  const selectComponents = useSimStore((s) => s.selectComponents)
  const selectWire = useSimStore((s) => s.selectWire)
  const selectTerminal = useSimStore((s) => s.selectTerminal)
  const reorder = useSimStore((s) => s.reorderComponents)
  const openEditor = useSimStore((s) => s.openViewOrientationEditor)
  const first = useSimStore((s) => s.components.find((c) => c.id === ids[0]))

  const hasComponents = ids.length > 0
  if (!hasComponents && !wireId && !terminalId) return null

  // Mostra a referência real do componente em vez de «Objeto».
  const label = hasComponents
    ? (ids.length > 1 ? `${ids.length} objetos` : first?.ref || 'Objeto')
    : wireId ? 'Cabo' : 'Borne'
  const clear = () => { selectComponents([]); selectWire(null); selectTerminal(null) }

  return (
    <div className="dc-selection-bar" role="toolbar" aria-label={`Ações para ${label.toLowerCase()} selecionado`} onPointerDown={(e) => e.stopPropagation()}>
      <span className="dc-selection-label">{label}</span>
      {hasComponents && <>
        <button type="button" onClick={() => rotate(ids, -90)} title="Rodar 90° para a esquerda (Shift+R)" aria-label="Rodar para a esquerda" disabled={locked}><IconRotate size={15} className="flip-x" /></button>
        <button type="button" onClick={() => rotate(ids, 90)} title="Rodar 90° (R)" aria-label="Rodar 90 graus" disabled={locked}><IconRotate size={15} /></button>
        <button type="button" onClick={() => duplicate(ids)} title="Duplicar (Ctrl+D)" aria-label="Duplicar"><IconCopy size={15} /></button>
        <button type="button" onClick={() => reorder(ids, 'front')} title="Trazer para a frente (Ctrl+])" aria-label="Trazer para a frente"><IconChevronUp size={15} /></button>
        <button type="button" onClick={() => reorder(ids, 'back')} title="Enviar para trás (Ctrl+[)" aria-label="Enviar para trás"><IconChevronDown size={15} /></button>
        {ids.length === 1 && <button type="button" className={locked ? 'is-on' : ''} onClick={() => toggleLock(ids[0])} title={locked ? 'Desbloquear' : 'Bloquear posição'} aria-label="Bloquear" aria-pressed={locked}><IconLock size={15} /></button>}
        {ids.length === 1 && <button type="button" onClick={() => openEditor(ids[0])} title="Editar apresentação do componente" aria-label="Editar componente"><IconTools size={15} /></button>}
      </>}
      <button type="button" className="is-danger" onClick={remove} title="Apagar (Del)" aria-label="Apagar"><IconDelete size={15} /></button>
      <button type="button" onClick={clear} title="Limpar seleção (Esc)" aria-label="Limpar seleção"><IconClose size={14} /></button>
    </div>
  )
}
