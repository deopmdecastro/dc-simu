import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useSimStore } from '../store/useSimStore'
import { groupOf } from '../ui/selectionGroups'
import {
  IconChevronDown, IconChevronUp, IconClose, IconCopy, IconDelete, IconGroup, IconLayers, IconLock, IconMore,
  IconOrganize, IconRotateLeft, IconRotateRight, IconSwap, IconTools, IconUngroup, IconUnlock,
} from '../ui/icons'

type MenuItem = { key: string; label: string; hint?: string; icon: ReactNode; run: () => void; disabled?: boolean; danger?: boolean; narrowOnly?: boolean }

/**
 * Barra contextual flutuante da seleção (Esquema). Ações principais sempre visíveis;
 * agrupar/desagrupar ficam junto da seleção; ordem e apresentação ficam no menu «Mais», que em ecrãs
 * estreitos recebe também as ações que deixam de caber — nunca há ações escondidas
 * atrás de deslocamento horizontal. Setas ←/→ percorrem os botões (padrão toolbar).
 */
export default function SelectionBar() {
  const demoMode = useSimStore((s) => s.demoMode)
  const ids = useSimStore((s) => s.selectedComponentIds)
  const wireId = useSimStore((s) => s.selectedWireId)
  const wireIds = useSimStore((s) => s.selectedWireIds)
  const terminalId = useSimStore((s) => s.selectedTerminalId)
  const multiSelectMode = useSimStore((s) => s.multiSelectMode)
  const toggleMultiSelectMode = useSimStore((s) => s.toggleMultiSelectMode)
  const lockedCount = useSimStore((s) => s.components.filter((c) => ids.includes(c.id) && c.locked).length)
  const first = useSimStore((s) => s.components.find((c) => c.id === ids[0]))
  const wires = useSimStore((s) => s.wires)
  const groups = useSimStore((s) => s.selectionGroups)
  const runState = useSimStore((s) => s.sim.runState)
  const [menuOpen, setMenuOpen] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)

  const selectionKey = `${ids.join(',')}|${wireId ?? ''}|${wireIds.join(',')}|${terminalId ?? ''}`
  useEffect(() => { setMenuOpen(false) }, [selectionKey])
  useEffect(() => {
    if (!menuOpen) return
    // Foco no primeiro item visível (os itens só-estreitos ficam ocultos em ecrãs largos).
    const items = barRef.current?.querySelectorAll<HTMLButtonElement>('.dc-selection-menu [role="menuitem"]') ?? []
    ;[...items].find((item) => !item.disabled && item.offsetParent !== null)?.focus()
    const close = (event: PointerEvent) => { if (!barRef.current?.contains(event.target as Node)) setMenuOpen(false) }
    const esc = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setMenuOpen(false); moreRef.current?.focus() } }
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', esc, true)
    return () => { window.removeEventListener('pointerdown', close, true); window.removeEventListener('keydown', esc, true) }
  }, [menuOpen])

  const hasComponents = ids.length > 0
  if (demoMode || (!hasComponents && !wireId && !terminalId)) return null

  const st = useSimStore.getState
  const multiWires = wireIds.length > 1 ? wireIds : (wireId ? [wireId] : [])
  const selectedWires = wires.filter((w) => multiWires.includes(w.id))
  const allWiresLocked = selectedWires.length > 0 && selectedWires.every((w) => w.locked)
  const anyWireLocked = selectedWires.some((w) => w.locked)
  const anyBundled = selectedWires.some((w) => w.bundleId)
  const simBusy = runState === 'running' || runState === 'paused'
  const allLocked = hasComponents && lockedCount === ids.length
  const anyLocked = lockedCount > 0
  const single = ids.length === 1
  const grouped = hasComponents && ids.some((id) => groupOf(groups, 'schematic', id))
  const exactGroup = hasComponents && groups.some((g) => g.view === 'schematic' && g.members.length === ids.length && g.members.every((id) => ids.includes(id)))

  const singleWire = multiWires.length === 1 ? selectedWires[0] : undefined
  const label = hasComponents
    ? (ids.length > 1 ? `${ids.length} objetos` : first?.ref || 'Objeto')
    : multiWires.length > 1 ? `${multiWires.length} cabos` : singleWire ? (singleWire.number || 'Cabo') : wireId ? 'Cabo' : 'Borne'
  const kindLabel = hasComponents ? (ids.length > 1 ? 'objetos' : 'objeto') : multiWires.length ? (multiWires.length > 1 ? 'cabos' : 'cabo') : 'borne'
  const clear = () => { st().selectComponents([]); st().selectWire(null); st().selectTerminal(null) }
  const lockHint = anyLocked ? 'Desbloqueie para mover, rodar ou espelhar' : undefined

  const menu: MenuItem[] = hasComponents ? [
    { key: 'rotl', label: 'Rodar 90° à esquerda', hint: 'Shift+R', icon: <IconRotateLeft size={14} />, run: () => st().rotateComponents(ids, -90), disabled: anyLocked, narrowOnly: true },
    ...(single ? [{ key: 'mirror', label: 'Espelhar', icon: <IconSwap size={14} />, run: () => st().mirrorComponent(ids[0]), disabled: anyLocked, narrowOnly: true }] : []),
    { key: 'front', label: 'Trazer para a frente', hint: 'Ctrl+]', icon: <IconChevronUp size={14} />, run: () => st().reorderComponents(ids, 'front') },
    { key: 'back', label: 'Enviar para trás', hint: 'Ctrl+[', icon: <IconChevronDown size={14} />, run: () => st().reorderComponents(ids, 'back') },
    ...(single ? [{ key: 'edit', label: 'Editar apresentação…', icon: <IconTools size={14} />, run: () => st().openViewOrientationEditor(ids[0]) }] : []),
  ] : multiWires.length ? [
    { key: 'organize', label: 'Organizar cabos', hint: 'Ctrl+Z desfaz', icon: <IconOrganize size={14} />, run: () => st().organizeWires(multiWires), disabled: allWiresLocked, narrowOnly: true },
  ] : []

  /** Setas percorrem os botões visíveis da barra (e do menu aberto). */
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
    const inMenu = (event.target as HTMLElement).closest('.dc-selection-menu')
    const scope = inMenu ?? barRef.current
    if (!scope) return
    const buttons = [...scope.querySelectorAll<HTMLButtonElement>(inMenu ? '[role="menuitem"]' : ':scope > .dc-sel-group > button, :scope > button')]
      .filter((b) => !b.disabled && b.offsetParent !== null)
    if (!buttons.length) return
    const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown'
    if (!inMenu && vertical) return
    if (inMenu && !vertical && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (at + step + buttons.length) % buttons.length
    buttons[next].focus()
  }

  const btn = (props: { label: string; title?: string; onClick: () => void; icon: ReactNode; disabled?: boolean; pressed?: boolean; className?: string; text?: string }) => (
    <button type="button" className={[props.className, props.pressed ? 'is-on' : ''].filter(Boolean).join(' ') || undefined}
      onClick={props.onClick} title={props.title ?? props.label} aria-label={props.label} disabled={props.disabled}
      aria-pressed={props.pressed === undefined ? undefined : props.pressed}>
      {props.icon}
      {props.text && <span className="dc-selection-action-label">{props.text}</span>}
    </button>
  )

  return (
    <div ref={barRef} className="dc-selection-bar" role="toolbar" aria-label={`Ações para ${kindLabel} selecionado${ids.length > 1 || multiWires.length > 1 ? 's' : ''}`}
      onPointerDown={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
      <span className="dc-selection-label" title={label}>
        {(ids.length > 1 || multiWires.length > 1) && <b className="dc-selection-count">{ids.length || multiWires.length}</b>}
        <span>{ids.length > 1 ? 'objetos' : multiWires.length > 1 ? 'cabos' : label}</span>
        {allLocked && <IconLock size={10} className="dc-selection-lockmark" title="Bloqueado" />}
      </span>

      <div className="dc-sel-group">
        <button type="button" className={`dc-selection-multi${multiSelectMode ? ' is-on' : ''}`} onClick={() => toggleMultiSelectMode()}
          title={multiSelectMode ? 'Seleção múltipla ativa — toque noutros objetos para juntar (Shift também serve)' : 'Ativar seleção múltipla — toque noutros objetos para juntar à seleção'}
          aria-label="Seleção múltipla" aria-pressed={multiSelectMode}>
          <IconLayers size={14} />
          <span className="dc-selection-multi-label">Multi</span>
        </button>
      </div>

      {hasComponents && <>
        {(ids.length > 1 || grouped) && <div className="dc-sel-group" data-selection-group-actions>
          {btn({ label: 'Agrupar', title: simBusy ? 'Pare a simulação para agrupar' : exactGroup ? 'Os elementos já formam um grupo' : 'Agrupar elementos selecionados (Ctrl+G)', onClick: () => st().groupSelection(), icon: <IconGroup size={14} />, disabled: simBusy || ids.length < 2 || exactGroup, className: 'dc-selection-action', text: 'Agrupar' })}
          {btn({ label: 'Desagrupar', title: simBusy ? 'Pare a simulação para desagrupar' : !grouped ? 'Selecione um grupo para o desagrupar' : 'Desagrupar elementos (Ctrl+Shift+G)', onClick: () => st().ungroupSelection(), icon: <IconUngroup size={14} />, disabled: simBusy || !grouped, className: 'dc-selection-action', text: 'Desagrupar' })}
        </div>}
        <div className="dc-sel-group">
          {btn({ label: 'Rodar 90° à esquerda', title: lockHint ?? 'Rodar 90° à esquerda (Shift+R)', onClick: () => st().rotateComponents(ids, -90), icon: <IconRotateLeft size={14} />, disabled: anyLocked, className: 'dc-sel-wide' })}
          {btn({ label: 'Rodar 90° à direita', title: lockHint ?? 'Rodar 90° à direita (R)', onClick: () => st().rotateComponents(ids, 90), icon: <IconRotateRight size={14} />, disabled: anyLocked })}
          {single && btn({ label: 'Espelhar', title: lockHint ?? 'Espelhar horizontalmente', onClick: () => st().mirrorComponent(ids[0]), icon: <IconSwap size={14} />, disabled: anyLocked, className: 'dc-sel-wide' })}
        </div>
        <div className="dc-sel-group">
          {btn({ label: 'Duplicar', title: simBusy ? 'Pare a simulação para duplicar' : 'Duplicar (Ctrl+D)', onClick: () => st().duplicateComponents(ids), icon: <IconCopy size={14} />, disabled: simBusy })}
          {btn({
            label: allLocked ? 'Desbloquear' : 'Bloquear',
            title: allLocked ? 'Desbloquear posição' : anyLocked ? 'Bloquear todos os selecionados' : 'Bloquear posição',
            onClick: () => st().setComponentsLocked(ids, !allLocked),
            icon: allLocked ? <IconUnlock size={14} /> : <IconLock size={14} />, pressed: allLocked,
          })}
        </div>
      </>}

      {!hasComponents && multiWires.length > 0 && <>
        <div className="dc-sel-group">
          {btn({ label: 'Duplicar cabos', title: 'Duplicar cabos (Ctrl+D)', onClick: () => st().duplicateWires(multiWires), icon: <IconCopy size={14} /> })}
          {btn({ label: 'Organizar cabos selecionados', title: 'Organizar cabos selecionados no Esquema e 3D (Ctrl+Z desfaz)', onClick: () => st().organizeWires(multiWires), icon: <IconOrganize size={14} />, disabled: allWiresLocked, className: 'dc-sel-wide' })}
          {btn({ label: allWiresLocked ? 'Desbloquear cabos selecionados' : 'Bloquear cabos selecionados', onClick: () => st().setWiresLocked(!allWiresLocked, multiWires), icon: allWiresLocked ? <IconUnlock size={14} /> : <IconLock size={14} />, pressed: allWiresLocked })}
        </div>
        <div className="dc-sel-group">
          {btn({ label: 'Filaçar', title: multiWires.length < 2 ? 'Selecione pelo menos dois cabos para os filaçar' : anyWireLocked ? 'Desbloqueie os cabos selecionados para os filaçar' : 'Filaçar cabos selecionados (chicote)', onClick: () => st().laceWires(multiWires), icon: <IconGroup size={14} />, disabled: multiWires.length < 2 || anyWireLocked, className: 'dc-selection-action', text: 'Filaçar' })}
          {btn({ label: 'Desfilaçar', title: !anyBundled ? 'Selecione cabos que pertencem a um chicote para os desfilaçar' : anyWireLocked ? 'Desbloqueie os cabos selecionados para os desfilaçar' : 'Desfazer chicote', onClick: () => st().unlaceWires(multiWires), icon: <IconUngroup size={14} />, disabled: !anyBundled || anyWireLocked, className: 'dc-selection-action', text: 'Desfilaçar' })}
        </div>
      </>}

      {menu.length > 0 && (
        <div className={`dc-sel-group dc-sel-more${menu.every((item) => item.narrowOnly) ? ' is-narrow-only' : ''}`}>
          <button ref={moreRef} type="button" className={menuOpen ? 'is-on' : ''} onClick={() => setMenuOpen((open) => !open)}
            title="Mais ações" aria-label="Mais ações" aria-haspopup="menu" aria-expanded={menuOpen}>
            <IconMore size={14} />
          </button>
          {menuOpen && (
            <div className="dc-selection-menu" role="menu" aria-label="Mais ações">
              {menu.map((item) => (
                <button key={item.key} type="button" role="menuitem" disabled={item.disabled}
                  className={[item.narrowOnly ? 'dc-sel-narrow' : '', item.danger ? 'is-danger' : ''].filter(Boolean).join(' ') || undefined}
                  title={item.disabled && anyLocked ? lockHint : undefined}
                  onClick={() => { item.run(); setMenuOpen(false) }}>
                  {item.icon}<span>{item.label}</span>{item.hint && <kbd>{item.hint}</kbd>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="dc-sel-group dc-sel-end">
        {btn({ label: 'Apagar', title: allLocked ? 'Desbloqueie para apagar' : simBusy && hasComponents ? 'Pare a simulação para apagar' : 'Apagar (Del)', onClick: () => st().deleteSelection(), icon: <IconDelete size={14} />, disabled: (!hasComponents && allWiresLocked) || (hasComponents && simBusy), className: 'is-danger' })}
        {btn({ label: 'Limpar seleção', title: 'Limpar seleção (Esc)', onClick: clear, icon: <IconClose size={13} /> })}
      </div>
    </div>
  )
}
