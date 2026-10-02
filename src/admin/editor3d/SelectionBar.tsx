import { useEditorStore, selectedPartIds, type Tool } from './editorStore'
import { canSplitSelection, deleteSelection, duplicateSelection, splitSelection, toggleSelectionLocked, toggleSelectionVisible } from './partActions'

const TOOLS: Array<[Tool, string, string]> = [['translate', 'Mover', 'W'], ['rotate', 'Rodar', 'E'], ['scale', 'Escala', 'R']]

/** Barra flutuante sobre o viewport: ações rápidas para a seleção atual. */
export default function SelectionBar() {
  const selection = useEditorStore((s) => s.selection)
  const extra = useEditorStore((s) => s.extraSel)
  const def = useEditorStore((s) => s.def)
  const tool = useEditorStore((s) => s.tool)
  const ribbon = useEditorStore((s) => s.ribbon)
  const mode = useEditorStore((s) => s.mode)
  const set = useEditorStore((s) => s.set)
  const cameraTo = useEditorStore((s) => s.cameraTo)
  if (mode !== 'edit' || ribbon !== 'select' || !selection) return null
  const ids = selectedPartIds({ selection, extraSel: extra })
  const part = selection.kind === 'part' ? def.parts.find((item) => item.id === selection.id) : undefined
  const terminal = selection.kind === 'terminal' ? def.terminals.find((item) => item.id === selection.id) : undefined
  const label = ids.length > 1 ? `${ids.length} peças` : part?.name ?? (terminal ? `Borne ${terminal.label}` : selection.kind === 'light' ? 'Luz' : selection.kind === 'control' ? 'Botão' : 'Ecrã')
  const isPart = selection.kind === 'part'
  const anyHidden = ids.some((id) => !def.parts.find((item) => item.id === id)?.visible)
  const anyLocked = ids.some((id) => def.parts.find((item) => item.id === id)?.locked)
  return <div className="ce-selbar" role="toolbar" aria-label="Ações da seleção" onPointerDown={(event) => event.stopPropagation()}>
    <span className="ce-selbar-name" title={label}>{label}</span>
    {(isPart || terminal) && <div className="ce-selbar-seg" role="group" aria-label="Manipulador">
      {TOOLS.filter(([id]) => isPart || id === 'translate').map(([id, text, key]) => <button key={id} aria-pressed={tool === id} className={tool === id ? 'is-on' : ''} onClick={() => set({ tool: id })} title={`${text} [${key}]`}>{text}</button>)}
    </div>}
    <button onClick={() => cameraTo('fitSel')} title="Enquadrar a seleção [Shift+F]">Enquadrar</button>
    {isPart && <>
      <button onClick={duplicateSelection} title="Duplicar [Ctrl+D]">Duplicar</button>
      {ids.length === 1 && canSplitSelection() && <button onClick={splitSelection} title="Dividir o modelo CAD em peças">Dividir</button>}
      <button onClick={() => toggleSelectionVisible()} title="Ocultar / mostrar [Shift+H]">{anyHidden ? 'Mostrar' : 'Ocultar'}</button>
      <button onClick={toggleSelectionLocked} title="Bloquear / desbloquear [L]">{anyLocked ? 'Desbloquear' : 'Bloquear'}</button>
    </>}
    <button className="is-danger" onClick={deleteSelection} title="Eliminar [Del]">Eliminar</button>
    <button className="ce-selbar-x" aria-label="Limpar seleção" title="Limpar seleção [Esc]" onClick={() => useEditorStore.getState().select(null)}>✕</button>
  </div>
}
