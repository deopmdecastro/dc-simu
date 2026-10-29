import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { nanoid } from 'nanoid'
import type { CanvasNote, CanvasNoteView, CanvasText } from '../types'
import { useSimStore } from '../store/useSimStore'
import { getViewer } from '../auth/viewer'
import { uiConfirm } from '../ui/dialogs'
import { IconCheck, IconClose, IconDelete, IconNote, IconPalette, IconSend } from '../ui/icons'
import { NOTE_COLORS, initialsOf, noteTheme, shortWhen, textCss } from '../ui/textStyle'

/**
 * Anotações do Esquema/3D: comentários em nota (título no canvas, conversa ao abrir)
 * e textos livres (tipo de letra, tamanho, cor). Ambos arrastam-se no plano do painel.
 *
 * O conteúdo é HTML posicionado na cena (`Html` do drei): o texto é nítido, usa as
 * fontes da app e edita-se diretamente, sem caixas de diálogo do sistema.
 */

/** 1 mm de texto = 16 px de CSS com `distanceFactor` 0,25 (1 px = 0,000625 unidades = 0,0625 mm). */
const TEXT_DISTANCE_FACTOR = 0.25
const PX_PER_MM = 0.01 / ((TEXT_DISTANCE_FACTOR) / 400)

type V3 = [number, number, number]

/** Arrasto no plano do painel (z constante), com o controlo de órbita suspenso. */
function useDragOnPlane() {
  const { camera, gl, controls, invalidate } = useThree() as unknown as { camera: THREE.Camera; gl: THREE.WebGLRenderer; controls: { enabled: boolean } | null; invalidate: () => void }
  return (event: ReactPointerEvent, origin: V3, onMove: (point: V3) => void, onEnd: (point: V3, moved: boolean) => void) => {
    if (event.button !== 0) return
    event.stopPropagation()
    const dom = gl.domElement
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -origin[2])
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const hitAt = (clientX: number, clientY: number) => {
      const rect = dom.getBoundingClientRect()
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      return raycaster.ray.intersectPlane(plane, new THREE.Vector3())
    }
    const grab = hitAt(event.clientX, event.clientY)
    const offset = grab ? new THREE.Vector3(origin[0] - grab.x, origin[1] - grab.y, 0) : new THREE.Vector3()
    const startX = event.clientX, startY = event.clientY
    let moved = false
    let last: V3 = origin
    const move = (e: PointerEvent) => {
      if (!moved && Math.hypot(e.clientX - startX, e.clientY - startY) < 4) return
      if (!moved && controls) controls.enabled = false
      moved = true
      const hit = hitAt(e.clientX, e.clientY)
      if (!hit) return
      last = [hit.x + offset.x, hit.y + offset.y, origin[2]]
      onMove(last)
      invalidate()
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      if (controls) controls.enabled = true
      onEnd(last, moved)
      invalidate()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }
}

/* ------------------------------------------------------------------ notas */

function NoteCard({ note, open, readOnly, onToggle, onDragStart, wasDragged }: {
  note: CanvasNote
  open: boolean
  readOnly: boolean
  /** O clique que fecha um arrasto não abre nem fecha a nota. */
  wasDragged: () => boolean
  onToggle: (open: boolean) => void
  onDragStart: (event: ReactPointerEvent) => void
}) {
  const update = useSimStore((s) => s.updateCanvasNote)
  const remove = useSimStore((s) => s.removeCanvasNote)
  const theme = noteTheme(note.color)
  const messages = note.messages ?? []
  const [title, setTitle] = useState(note.text)
  const [draft, setDraft] = useState('')
  const [palette, setPalette] = useState(false)
  const listRef = useRef<HTMLOListElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const draftRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => setTitle(note.text), [note.text])
  useEffect(() => {
    if (!open) return
    // Nota acabada de criar: começa pelo título; senão, pela resposta.
    window.requestAnimationFrame(() => { (note.text ? draftRef.current : titleRef.current)?.focus() })
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [open])

  const commitTitle = () => { const next = title.trim(); if (next !== note.text) update(note.id, { text: next }) }
  const send = () => {
    const text = draft.trim()
    if (!text) return
    const viewer = getViewer()
    update(note.id, { text: note.text || title.trim() || text.split('\n')[0].slice(0, 60), messages: [...messages, { id: nanoid(8), text, author: viewer.name, authorId: viewer.id, createdAt: new Date().toISOString() }] })
    setDraft('')
    window.requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }))
  }
  const close = () => {
    commitTitle()
    // Nota vazia (sem título nem mensagens) não fica a sujar o canvas.
    if (!title.trim() && !messages.length && !draft.trim()) { remove(note.id); return }
    if (draft.trim()) send()
    onToggle(false)
  }
  const destroy = async () => {
    if (await uiConfirm('Eliminar este comentário e toda a conversa?', { title: 'Eliminar comentário', confirmLabel: 'Eliminar', cancelLabel: 'Cancelar', danger: true })) remove(note.id)
  }
  const style = { '--note-paper': theme.paper, '--note-ink': theme.ink, '--note-edge': theme.edge, '--note-tab': note.color ?? NOTE_COLORS[0].id } as CSSProperties

  return <div className={`cnote${open ? ' is-open' : ''}${note.resolved ? ' is-resolved' : ''}`} style={style}
    onWheel={(event) => open && event.stopPropagation()} onContextMenu={(event) => event.preventDefault()}>
    <button type="button" className="cnote-chip" onPointerDown={readOnly ? undefined : onDragStart} onClick={() => { if (wasDragged()) return; if (open) close(); else onToggle(true) }}
      title={readOnly ? note.text : `${note.text || 'Comentário'} — clique abre a conversa · arraste para mover`} aria-expanded={open}>
      <span className="cnote-pin" aria-hidden="true"><IconNote size={11} /></span>
      <span className="cnote-title">{note.text || 'Novo comentário'}</span>
      {messages.length > 0 && <em className="cnote-count" aria-label={`${messages.length} mensagens`}>{messages.length}</em>}
      {note.resolved && <IconCheck size={10} className="cnote-done" />}
    </button>
    {open && <section className="cnote-card" role="dialog" aria-label={`Comentário: ${note.text || 'novo'}`} onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Escape') close() }}>
      <header className="cnote-head">
        <input ref={titleRef} className="cnote-title-input" value={title} placeholder="Título do comentário" maxLength={80} readOnly={readOnly}
          onChange={(event) => setTitle(event.target.value)} onBlur={commitTitle} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitTitle(); draftRef.current?.focus() } }} aria-label="Título do comentário" />
        {!readOnly && <>
          <button type="button" className="cnote-icon" aria-pressed={palette} onClick={() => setPalette((value) => !value)} title="Cor da nota" aria-label="Cor da nota"><IconPalette size={12} /></button>
          <button type="button" className={`cnote-icon${note.resolved ? ' is-on' : ''}`} aria-pressed={!!note.resolved} onClick={() => update(note.id, { resolved: !note.resolved })} title={note.resolved ? 'Reabrir' : 'Marcar como resolvido'} aria-label={note.resolved ? 'Reabrir' : 'Marcar como resolvido'}><IconCheck size={12} /></button>
          <button type="button" className="cnote-icon is-danger" onClick={() => void destroy()} title="Eliminar comentário" aria-label="Eliminar comentário"><IconDelete size={12} /></button>
        </>}
        <button type="button" className="cnote-icon" onClick={close} title="Fechar (Esc)" aria-label="Fechar"><IconClose size={12} /></button>
      </header>
      {palette && <div className="cnote-colors" role="radiogroup" aria-label="Cor da nota">
        {NOTE_COLORS.map((item) => <button key={item.id} type="button" role="radio" aria-checked={(note.color ?? NOTE_COLORS[0].id) === item.id} title={item.label} aria-label={item.label}
          style={{ background: item.paper, borderColor: item.edge }} onClick={() => { update(note.id, { color: item.id }); setPalette(false) }} />)}
      </div>}
      <ol className="cnote-list" ref={listRef} aria-label="Mensagens">
        {messages.length === 0 && <li className="cnote-empty">Escreva a primeira mensagem — fica guardada no projeto, junto a este ponto do desenho.</li>}
        {messages.map((message) => {
          const mine = !!message.authorId && message.authorId === getViewer().id
          return <li key={message.id} className={`cnote-msg${mine ? ' is-mine' : ''}`}>
            <span className="cnote-avatar" aria-hidden="true">{initialsOf(message.author ?? 'Eu')}</span>
            <div>
              <span className="cnote-meta"><b>{mine ? 'Eu' : message.author ?? 'Eu'}</b><time dateTime={message.createdAt}>{shortWhen(message.createdAt)}</time></span>
              <p>{message.text}</p>
            </div>
            {!readOnly && (mine || !message.authorId) && <button type="button" className="cnote-msg-del" onClick={() => update(note.id, { messages: messages.filter((item) => item.id !== message.id) })} title="Apagar mensagem" aria-label="Apagar mensagem"><IconClose size={9} /></button>}
          </li>
        })}
      </ol>
      {!readOnly && <form className="cnote-compose" onSubmit={(event) => { event.preventDefault(); send() }}>
        <textarea ref={draftRef} value={draft} rows={2} maxLength={1000} placeholder={messages.length ? 'Responder… (Ctrl+Enter)' : 'Mensagem… (Ctrl+Enter)'}
          onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); send() } }} aria-label="Nova mensagem" />
        <button type="submit" className="cnote-send" disabled={!draft.trim()} title="Enviar (Ctrl+Enter)" aria-label="Enviar"><IconSend size={12} /></button>
      </form>}
    </section>}
  </div>
}

/* ----------------------------------------------------------- textos livres */

function FreeText({ item, selected, editing, readOnly, onSelect, onEdit, onDragStart }: {
  item: CanvasText
  selected: boolean
  editing: boolean
  readOnly: boolean
  onSelect: () => void
  onEdit: (editing: boolean) => void
  onDragStart: (event: ReactPointerEvent) => void
}) {
  const update = useSimStore((s) => s.updateCanvasText)
  const remove = useSimStore((s) => s.removeCanvasText)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = ref.current
    if (!editing || !node) return
    node.focus()
    const range = document.createRange()
    range.selectNodeContents(node)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }, [editing])
  const commit = () => {
    const text = (ref.current?.innerText ?? '').replace(/\n$/, '')
    onEdit(false)
    if (!text.trim()) { remove(item.id); return }
    if (text !== item.text) update(item.id, { text })
  }
  const shift = item.align === 'center' ? '-50%' : item.align === 'right' ? '-100%' : '0'
  return <div
    ref={ref}
    className={`ctext${selected ? ' is-selected' : ''}${editing ? ' is-editing' : ''}`}
    style={{ ...textCss(item, item.size * PX_PER_MM), transform: `translate(${shift}, 0)`, padding: item.background ? `${0.2 * item.size * PX_PER_MM}px ${0.35 * item.size * PX_PER_MM}px` : undefined, borderRadius: item.background ? 0.25 * item.size * PX_PER_MM : undefined }}
    contentEditable={editing}
    suppressContentEditableWarning
    spellCheck={editing}
    onPointerDown={readOnly || editing ? (event) => event.stopPropagation() : (event) => { onSelect(); onDragStart(event) }}
    onDoubleClick={readOnly ? undefined : (event) => { event.stopPropagation(); onEdit(true) }}
    onBlur={editing ? commit : undefined}
    onKeyDown={editing ? (event) => { event.stopPropagation(); if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) { event.preventDefault(); (event.currentTarget as HTMLDivElement).blur() } } : undefined}
    title={readOnly ? undefined : 'Arraste para mover · duplo clique edita'}
  >{item.text}</div>
}

/* ------------------------------------------------------------------ camada */

export default function CanvasAnnotations3D({ view, readOnly, openNoteId, setOpenNoteId, selectedTextId, setSelectedTextId, editingTextId, setEditingTextId, placingText, onPlaceText, placeZ }: {
  view: CanvasNoteView
  readOnly: boolean
  openNoteId: string | null
  setOpenNoteId: (id: string | null) => void
  selectedTextId: string | null
  setSelectedTextId: (id: string | null) => void
  editingTextId: string | null
  setEditingTextId: (id: string | null) => void
  placingText: boolean
  onPlaceText: (point: V3) => void
  placeZ: number
}) {
  const notes = useSimStore((s) => s.canvasNotes)
  const texts = useSimStore((s) => s.canvasTexts)
  const updateNote = useSimStore((s) => s.updateCanvasNote)
  const updateText = useSimStore((s) => s.updateCanvasText)
  const dragOnPlane = useDragOnPlane()
  const [live, setLive] = useState<{ id: string; point: V3 } | null>(null)
  const gl = useThree((state) => state.gl)
  useEffect(() => {
    if (!placingText) return
    const previous = gl.domElement.style.cursor
    gl.domElement.style.cursor = 'text'
    return () => { gl.domElement.style.cursor = previous }
  }, [gl, placingText])
  const dragged = useRef<string | null>(null)
  const markDragged = (id: string) => { dragged.current = id; window.setTimeout(() => { if (dragged.current === id) dragged.current = null }, 0) }
  const at = (id: string, x: number, y: number, z: number): V3 => (live?.id === id ? live.point : [x, y, z])

  return <>
    {placingText && <mesh position={[0, 0, placeZ]} onClick={(event) => { event.stopPropagation(); onPlaceText([event.point.x, event.point.y, placeZ]) }} userData={{ noSnapshot: true, noPick: true }}>
      <planeGeometry args={[400, 400]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>}

    {texts.filter((item) => item.view === view).map((item) => {
      const position = at(item.id, item.x, item.y, item.z ?? placeZ)
      return <Html key={item.id} position={position} transform distanceFactor={TEXT_DISTANCE_FACTOR} zIndexRange={[24, 12]}>
        <FreeText item={item} readOnly={readOnly} selected={selectedTextId === item.id} editing={editingTextId === item.id}
          onSelect={() => setSelectedTextId(item.id)}
          onEdit={(editing) => setEditingTextId(editing ? item.id : null)}
          onDragStart={(event) => dragOnPlane(event, position, (point) => setLive({ id: item.id, point }), (point, moved) => {
            setLive(null)
            if (moved) updateText(item.id, { x: point[0], y: point[1], z: point[2] })
          })} />
      </Html>
    })}

    {notes.filter((note) => note.view === view).map((note) => {
      const position = at(note.id, note.x, note.y, note.z ?? 0.3)
      return <Html key={note.id} position={position} zIndexRange={[30, 25]}>
        <NoteCard note={note} readOnly={readOnly} open={openNoteId === note.id}
          onToggle={(open) => setOpenNoteId(open ? note.id : null)}
          wasDragged={() => dragged.current === note.id}
          onDragStart={(event) => dragOnPlane(event, position, (point) => setLive({ id: note.id, point }), (point, moved) => {
            setLive(null)
            if (moved) { markDragged(note.id); updateNote(note.id, { x: point[0], y: point[1], z: point[2] }) }
          })} />
      </Html>
    })}
  </>
}
