/**
 * Comentários e textos livres no Esquema IEC (coordenadas do diagrama).
 */
import { useEffect, useRef, useState } from 'react'
import type { CanvasNote, CanvasText } from '../types'
import { useSimStore } from '../store/useSimStore'
import { useCommandsUi } from './commandsUi'
import { snap } from './model'
import { CanvasNoteCard } from '../ui/CanvasNoteCard'
import TextStyleBar from '../ui/TextStyleBar'
import { DEFAULT_TEXT_STYLE_COMMANDS, fontStack, textCss } from '../ui/textStyle'

export function CommandsNotesLayer({
  notes,
  viewX,
  viewY,
  scale,
  openId,
  setOpenId,
  toWorld,
  readOnly,
}: {
  notes: CanvasNote[]
  viewX: number
  viewY: number
  scale: number
  openId: string | null
  setOpenId: (id: string | null) => void
  toWorld: (clientX: number, clientY: number) => { x: number; y: number }
  readOnly: boolean
}) {
  const dragged = useRef(false)
  const cleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanup.current?.(), [])
  if (!notes.length) return null
  return (
    <div className="dc-cmd-notes-layer" aria-label="Comentários do esquema">
      {notes.map((note) => (
        <div
          key={note.id}
          className="dc-cmd-note-anchor"
          style={{ left: viewX + note.x * scale, top: viewY + note.y * scale }}
        >
          <CanvasNoteCard
            note={note}
            open={openId === note.id}
            readOnly={readOnly}
            onToggle={(open) => setOpenId(open ? note.id : null)}
            wasDragged={() => dragged.current}
            onDragStart={(event) => {
              if (readOnly || event.button !== 0) return
              cleanup.current?.()
              event.stopPropagation()
              dragged.current = false
              const start = toWorld(event.clientX, event.clientY)
              const sx = event.clientX
              const sy = event.clientY
              const ox = note.x
              const oy = note.y
              const move = (e: PointerEvent) => {
                if (!dragged.current && Math.hypot(e.clientX - sx, e.clientY - sy) < 4) return
                dragged.current = true
                const point = toWorld(e.clientX, e.clientY)
                useSimStore.getState().updateCanvasNote(note.id, { x: ox + point.x - start.x, y: oy + point.y - start.y })
              }
              const up = () => {
                window.removeEventListener('pointermove', move)
                window.removeEventListener('pointerup', up)
                window.removeEventListener('pointercancel', up)
              }
              cleanup.current = up
              window.addEventListener('pointermove', move)
              window.addEventListener('pointerup', up)
              window.addEventListener('pointercancel', up)
            }}
          />
        </div>
      ))}
    </div>
  )
}

/**
 * Texto livre do Esquema IEC — o mesmo comportamento do GRAFCET (`GrafcetFreeText`): moldura tracejada ao selecionar,
 * arrasto com ajuste à grelha (Alt = livre), duplo clique/duplo toque edita no próprio sítio (a caixa cresce com o
 * texto), Esc ou Ctrl+Enter confirmam e um texto vazio é apagado.
 */
function CommandsFreeText({ item, scale, selected, editing, readOnly, toWorld, onSelect, onEdit }: {
  item: CanvasText
  scale: number
  selected: boolean
  editing: boolean
  readOnly: boolean
  toWorld: (clientX: number, clientY: number) => { x: number; y: number }
  onSelect: () => void
  onEdit: (editing: boolean) => void
}) {
  const [draft, setDraft] = useState(item.text)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const drag = useRef<{ dx: number; dy: number; sx: number; sy: number; moved: boolean } | null>(null)
  const lastTap = useRef(0)
  const sizePx = Math.max(10, item.size * scale)
  const fixedWidth = item.width == null ? undefined : Math.max(60, item.width * scale)

  useEffect(() => {
    if (!editing) return
    setDraft(item.text)
    window.requestAnimationFrame(() => { editorRef.current?.focus(); editorRef.current?.select() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])
  // A caixa de edição acompanha o conteúdo (como no GRAFCET): sem barras de deslocação nem tamanho fixo.
  useEffect(() => {
    const el = editorRef.current
    if (!editing || !el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  }, [draft, editing, sizePx])

  const commit = () => {
    onEdit(false)
    if (draft === item.text) return
    if (draft.trim()) useSimStore.getState().updateCanvasText(item.id, { text: draft })
    else useSimStore.getState().removeCanvasText(item.id)
  }

  const down = (event: React.PointerEvent<HTMLDivElement>) => {
    if (readOnly || editing || event.button !== 0) return
    event.stopPropagation()
    onSelect()
    // Duplo toque (o duplo clique não é fiável no ecrã tátil).
    if (event.pointerType === 'touch') {
      const now = Date.now()
      if (now - lastTap.current < 350) { lastTap.current = 0; onEdit(true); return }
      lastTap.current = now
    }
    const start = toWorld(event.clientX, event.clientY)
    drag.current = { dx: item.x - start.x, dy: item.y - start.y, sx: event.clientX, sy: event.clientY, moved: false }
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* noop */ }
  }
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = drag.current
    if (!current) return
    if (!current.moved && Math.hypot(event.clientX - current.sx, event.clientY - current.sy) < 4) return
    // Início do arrasto: um passo de Desfazer com a posição original.
    if (!current.moved) useSimStore.getState().commitHistory()
    current.moved = true
    const point = toWorld(event.clientX, event.clientY)
    const x = point.x + current.dx
    const y = point.y + current.dy
    useSimStore.getState().updateCanvasText(item.id, event.altKey ? { x: Math.round(x), y: Math.round(y) } : { x: snap(x), y: snap(y) })
  }
  const up = () => { drag.current = null }

  const textStyle = { ...textCss(item, sizePx), fontFamily: fontStack(item.font), width: fixedWidth }
  return (
    <div
      className={`dc-cmd-text-anchor${selected ? ' is-selected' : ''}${editing ? ' is-editing' : ''}`}
      data-cmd-text={item.id}
      style={{ transform: `rotate(${item.rotation ?? 0}deg)`, transformOrigin: 'top left' }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onDoubleClick={(event) => { if (readOnly) return; event.stopPropagation(); onSelect(); onEdit(true) }}
      onContextMenu={(event) => { if (readOnly) return; event.preventDefault(); event.stopPropagation(); onSelect() }}
      title={readOnly ? item.text : 'Arraste para mover · duplo clique edita · Enter/F2 edita · Ctrl+B/I/U formata'}
    >
      {editing ? (
        <textarea
          ref={editorRef}
          className="dc-cmd-text-edit"
          value={draft}
          rows={1}
          spellCheck
          aria-label="Editar texto do esquema IEC"
          style={{ ...textStyle, width: fixedWidth ?? `${Math.max(4, ...draft.split('\n').map((line) => line.length + 1))}ch` }}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) { event.preventDefault(); event.currentTarget.blur() }
          }}
        />
      ) : (
        <div className="dc-cmd-text-body" style={textStyle}>{item.text || 'Texto'}</div>
      )}
    </div>
  )
}

export function CommandsTextsLayer({
  texts,
  viewX,
  viewY,
  scale,
  selectedId,
  groupIds = [],
  editingId,
  setSelectedId,
  setEditingId,
  toWorld,
  readOnly,
}: {
  texts: CanvasText[]
  viewX: number
  viewY: number
  scale: number
  selectedId: string | null
  /** Textos selecionados em grupo (marquee / Ctrl+A). */
  groupIds?: string[]
  editingId: string | null
  setSelectedId: (id: string | null) => void
  setEditingId: (id: string | null) => void
  toWorld: (clientX: number, clientY: number) => { x: number; y: number }
  readOnly: boolean
}) {
  if (!texts.length) return null
  return (
    <div className="dc-cmd-texts-layer" aria-label="Textos livres do esquema">
      {texts.map((item) => (
        <div key={item.id} className="dc-cmd-text-pos" style={{ left: viewX + item.x * scale, top: viewY + item.y * scale }}>
          <CommandsFreeText
            item={item}
            scale={scale}
            selected={selectedId === item.id || groupIds.includes(item.id)}
            editing={editingId === item.id}
            readOnly={readOnly}
            toWorld={toWorld}
            onSelect={() => { setSelectedId(item.id); useCommandsUi.getState().select({ type: 'text', id: item.id }) }}
            onEdit={(on) => setEditingId(on ? item.id : null)}
          />
        </div>
      ))}
    </div>
  )
}

export function CommandsTextToolbar({
  text,
  onDone,
  onEdit,
}: {
  text: CanvasText
  onDone: () => void
  onEdit: () => void
}) {
  return (
    <div className="dc-cmd-text-toolbar">
      <TextStyleBar
        style={text}
        unit="px"
        onChange={(patch) => useSimStore.getState().updateCanvasText(text.id, patch)}
        rotation={text.rotation}
        onRotationChange={(rotation) => useSimStore.getState().updateCanvasText(text.id, { rotation })}
        width={text.width}
        onWidthChange={(width) => useSimStore.getState().updateCanvasText(text.id, { width })}
        onDelete={() => {
          useSimStore.getState().removeCanvasText(text.id)
          onDone()
        }}
        onDone={onDone}
        onEdit={onEdit}
      />
    </div>
  )
}

export { DEFAULT_TEXT_STYLE_COMMANDS }
