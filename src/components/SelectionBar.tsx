import { useSimStore } from '../store/useSimStore'
import { IconChevronDown, IconChevronUp, IconClose, IconCopy, IconDelete, IconGroup, IconLock, IconUnlock, IconOrganize, IconRotate, IconTools, IconLayers, IconUngroup } from '../ui/icons'

/**
 * Barra contextual flutuante: aparece quando há um objeto selecionado e dá acesso
 * direto (toque ou rato) a apagar, rodar, duplicar, bloquear e limpar a seleção.
 * Inclui atalho para modo de seleção múltipla (equivalente a manter Shift).
 */
export default function SelectionBar() {
  const demoMode = useSimStore((s) => s.demoMode)
  const ids = useSimStore((s) => s.selectedComponentIds)
  const wireId = useSimStore((s) => s.selectedWireId)
  const wireIds = useSimStore((s) => s.selectedWireIds)
  const terminalId = useSimStore((s) => s.selectedTerminalId)
  const multiSelectMode = useSimStore((s) => s.multiSelectMode)
  const toggleMultiSelectMode = useSimStore((s) => s.toggleMultiSelectMode)
  const locked = useSimStore((s) => s.components.some((c) => ids.includes(c.id) && c.locked))
  const rotate = useSimStore((s) => s.rotateComponents)
  const duplicate = useSimStore((s) => s.duplicateComponents)
  const duplicateWires = useSimStore((s) => s.duplicateWires)
  const toggleLock = useSimStore((s) => s.toggleLock)
  const remove = useSimStore((s) => s.deleteSelection)
  const selectComponents = useSimStore((s) => s.selectComponents)
  const selectWire = useSimStore((s) => s.selectWire)
  const selectTerminal = useSimStore((s) => s.selectTerminal)
  const laceWires = useSimStore((s) => s.laceWires)
  const unlaceWires = useSimStore((s) => s.unlaceWires)
  const reorder = useSimStore((s) => s.reorderComponents)
  const openEditor = useSimStore((s) => s.openViewOrientationEditor)
  const first = useSimStore((s) => s.components.find((c) => c.id === ids[0]))
  const multiWires = wireIds.length > 1 ? wireIds : (wireId ? [wireId] : [])
  const wires = useSimStore((s) => s.wires)
  const selectedWires = wires.filter(w => multiWires.includes(w.id))
  const allWiresLocked = selectedWires.length > 0 && selectedWires.every(w => w.locked)
  const anyWireLocked = selectedWires.some(w => w.locked)
  const anyBundled = multiWires.some((id) => wires.find((w) => w.id === id)?.bundleId)
  const laceTitle = multiWires.length < 2
    ? 'Selecione pelo menos dois cabos para os filaçar'
    : anyWireLocked ? 'Desbloqueie os cabos selecionados para os filaçar' : 'Filaçar cabos selecionados (chicote)'
  const unlaceTitle = !anyBundled
    ? 'Selecione cabos que pertencem a um chicote para os desfilaçar'
    : anyWireLocked ? 'Desbloqueie os cabos selecionados para os desfilaçar' : 'Desfazer chicote'

  const hasComponents = ids.length > 0
  if (demoMode || (!hasComponents && !wireId && !terminalId)) return null

  const label = hasComponents
    ? (ids.length > 1 ? `${ids.length} objetos` : first?.ref || 'Objeto')
    : multiWires.length > 1 ? `${multiWires.length} cabos` : wireId ? 'Cabo' : 'Borne'
  const clear = () => { selectComponents([]); selectWire(null); selectTerminal(null) }

  return (
    <div className="dc-selection-bar" role="toolbar" aria-label={`Ações para ${label.toLowerCase()} selecionado`} onPointerDown={(e) => e.stopPropagation()}>
      <span className="dc-selection-label" title={label}>{label}</span>
      <button
        type="button"
        className={multiSelectMode ? 'is-on' : ''}
        onClick={() => toggleMultiSelectMode()}
        title={multiSelectMode ? 'Seleção múltipla ativa — clique noutros objetos para juntar (Shift também serve)' : 'Ativar seleção múltipla — clique noutros objetos para juntar à seleção'}
        aria-label="Seleção múltipla"
        aria-pressed={multiSelectMode}
      >
        <IconLayers size={15} />
        <span className="dc-selection-multi-label">{multiSelectMode ? 'Multi' : 'Multi'}</span>
      </button>
      {hasComponents && <>
        <button type="button" onClick={() => rotate(ids, -90)} title="Rodar 90° para a esquerda (Shift+R)" aria-label="Rodar para a esquerda" disabled={locked}><IconRotate size={15} className="flip-x" /></button>
        <button type="button" onClick={() => rotate(ids, 90)} title="Rodar 90° (R)" aria-label="Rodar 90 graus" disabled={locked}><IconRotate size={15} /></button>
        <button type="button" onClick={() => duplicate(ids)} title="Duplicar (Ctrl+D)" aria-label="Duplicar"><IconCopy size={15} /></button>
        <button type="button" onClick={() => reorder(ids, 'front')} title="Trazer para a frente (Ctrl+])" aria-label="Trazer para a frente"><IconChevronUp size={15} /></button>
        <button type="button" onClick={() => reorder(ids, 'back')} title="Enviar para trás (Ctrl+[)" aria-label="Enviar para trás"><IconChevronDown size={15} /></button>
        {ids.length === 1 && <button type="button" className={locked ? 'is-on' : ''} onClick={() => toggleLock(ids[0])} title={locked ? 'Desbloquear' : 'Bloquear posição'} aria-label="Bloquear" aria-pressed={locked}><IconLock size={15} /></button>}
        {ids.length === 1 && <button type="button" onClick={() => openEditor(ids[0])} title="Editar apresentação do componente" aria-label="Editar componente"><IconTools size={15} /></button>}
      </>}
      {!hasComponents && multiWires.length > 0 && <>
        <button type="button" onClick={() => duplicateWires(multiWires)} title="Duplicar cabos (Ctrl+D)" aria-label="Duplicar cabos"><IconCopy size={15} /></button>
        <button type="button" onClick={() => useSimStore.getState().organizeWires(multiWires)} title="Organizar cabos selecionados no Esquema e 3D (Ctrl+Z desfaz)" aria-label="Organizar cabos selecionados" disabled={allWiresLocked}><IconOrganize size={15} /></button>
        <button type="button" className={allWiresLocked ? 'is-on' : ''} aria-pressed={allWiresLocked} aria-label={allWiresLocked ? 'Desbloquear cabos selecionados' : 'Bloquear cabos selecionados'} title={allWiresLocked ? 'Desbloquear cabos selecionados' : 'Bloquear cabos selecionados'} onClick={() => useSimStore.getState().setWiresLocked(!allWiresLocked, multiWires)}>{allWiresLocked ? <IconUnlock size={15} /> : <IconLock size={15} />}</button>
        <button type="button" className="dc-selection-action" onClick={() => laceWires(multiWires)} title={laceTitle} aria-label="Filaçar" disabled={multiWires.length < 2 || anyWireLocked}>
          <IconGroup size={15} />
          <span className="dc-selection-action-label">Filaçar</span>
        </button>
        <button type="button" className="dc-selection-action" onClick={() => unlaceWires(multiWires)} title={unlaceTitle} aria-label="Desfilaçar" disabled={!anyBundled || anyWireLocked}>
          <IconUngroup size={15} />
          <span className="dc-selection-action-label">Desfilaçar</span>
        </button>
      </>}
      <button type="button" className="is-danger" onClick={remove} title="Apagar (Del)" aria-label="Apagar" disabled={!hasComponents && allWiresLocked}><IconDelete size={15} /></button>
      <button type="button" onClick={clear} title="Limpar seleção (Esc)" aria-label="Limpar seleção"><IconClose size={14} /></button>
    </div>
  )
}
