import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { CanvasNoteCard } from '../ui/CanvasNoteCard'
import type { CanvasNoteView, CanvasText } from '../types'
import { useSimStore } from '../store/useSimStore'
import { textCss } from '../ui/textStyle'

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
        <CanvasNoteCard note={note} readOnly={readOnly} open={openNoteId === note.id}
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
