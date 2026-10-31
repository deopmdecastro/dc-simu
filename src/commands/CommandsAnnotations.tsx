/**
 * Comentários e textos livres no Esquema IEC (coordenadas do diagrama).
 */
import { useEffect, useRef, useState } from 'react'
import type { CanvasNote, CanvasText } from '../types'
import { useSimStore } from '../store/useSimStore'
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

export function CommandsTextsLayer({
  texts,
  viewX,
  viewY,
  scale,
  selectedId,
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
  editingId: string | null
  setSelectedId: (id: string | null) => void
  setEditingId: (id: string | null) => void
  toWorld: (clientX: number, clientY: number) => { x: number; y: number }
  readOnly: boolean
}) {
  const dragged = useRef(false)
  const cleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanup.current?.(), [])
  if (!texts.length) return null
  return (
    <div className="dc-cmd-texts-layer" aria-label="Textos livres do esquema">
      {texts.map((item) => {
        const selected = selectedId === item.id
        const editing = editingId === item.id
        const sizePx = Math.max(10, item.size * scale)
        return (
          <div
            key={item.id}
            className={`dc-cmd-text-anchor${selected ? ' is-selected' : ''}`}
            style={{ left: viewX + item.x * scale, top: viewY + item.y * scale }}
            onPointerDown={(event) => {
              if (readOnly || event.button !== 0) return
              event.stopPropagation()
              setSelectedId(item.id)
              cleanup.current?.()
              dragged.current = false
              const start = toWorld(event.clientX, event.clientY)
              const sx = event.clientX
              const sy = event.clientY
              const ox = item.x
              const oy = item.y
              const move = (e: PointerEvent) => {
                if (!dragged.current && Math.hypot(e.clientX - sx, e.clientY - sy) < 4) return
                dragged.current = true
                const point = toWorld(e.clientX, e.clientY)
                useSimStore.getState().updateCanvasText(item.id, { x: ox + point.x - start.x, y: oy + point.y - start.y })
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
            onDoubleClick={(event) => {
              if (readOnly) return
              event.stopPropagation()
              setSelectedId(item.id)
              setEditingId(item.id)
            }}
          >
            {editing ? (
              <textarea
                className="dc-cmd-text-edit"
                style={{ ...textCss(item, sizePx), fontFamily: fontStack(item.font) }}
                defaultValue={item.text}
                autoFocus
                onPointerDown={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  const value = e.target.value
                  useSimStore.getState().updateCanvasText(item.id, { text: value })
                  setEditingId(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    setEditingId(null)
                  }
                }}
              />
            ) : (
              <div
                className="dc-cmd-text-body"
                style={{
                  ...textCss(item, sizePx),
                  fontFamily: fontStack(item.font),
                  background: item.background || undefined,
                  textDecoration: item.underline ? 'underline' : undefined,
                }}
              >
                {item.text || 'Texto'}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function CommandsTextToolbar({
  text,
  onDone,
}: {
  text: CanvasText
  onDone: () => void
}) {
  return (
    <div className="dc-cmd-text-toolbar">
      <TextStyleBar
        style={text}
        unit="px"
        onChange={(patch) => useSimStore.getState().updateCanvasText(text.id, patch)}
        onDelete={() => {
          useSimStore.getState().removeCanvasText(text.id)
          onDone()
        }}
        onDone={onDone}
        onEdit={() => { /* parent sets editing */ }}
      />
    </div>
  )
}

export { DEFAULT_TEXT_STYLE_COMMANDS }
