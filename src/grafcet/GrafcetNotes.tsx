import { useEffect, useRef } from 'react'
import type { CanvasNote } from '../types'
import { useSimStore } from '../store/useSimStore'
import { CanvasNoteCard } from '../ui/CanvasNoteCard'

/** Notas em coordenadas do diagrama, com o cartão legível em qualquer zoom. */
export function GrafcetNotes({ notes, position, scale, openId, setOpenId, toWorld, readOnly }: {
  notes: CanvasNote[]; position: { x: number; y: number }; scale: number
  openId: string | null; setOpenId: (id: string | null) => void
  toWorld: (x: number, y: number) => { x: number; y: number }; readOnly: boolean
}) {
  const dragged = useRef(false)
  const cleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanup.current?.(), [])
  return <div className="grafcet-notes-layer">
    {notes.map(note => <div key={note.id} data-grafcet-note={note.id} className="grafcet-note-anchor"
      style={{ left: position.x + note.x * scale, top: position.y + note.y * scale }}>
      <CanvasNoteCard note={note} open={openId === note.id} readOnly={readOnly}
        onToggle={open => setOpenId(open ? note.id : null)} wasDragged={() => dragged.current}
        onDragStart={event => {
          if (event.button !== 0) return
          cleanup.current?.()
          event.stopPropagation(); dragged.current = false
          const start = toWorld(event.clientX, event.clientY), sx = event.clientX, sy = event.clientY
          const move = (e: PointerEvent) => {
            if (!dragged.current && Math.hypot(e.clientX - sx, e.clientY - sy) < 4) return
            dragged.current = true
            const point = toWorld(e.clientX, e.clientY)
            useSimStore.getState().updateCanvasNote(note.id, { x: note.x + point.x - start.x, y: note.y + point.y - start.y })
          }
          const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up) }
          cleanup.current = up
          window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up)
        }} />
    </div>)}
  </div>
}
