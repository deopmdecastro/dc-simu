import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { GrafcetComment } from './engine'
import { fontStack } from '../ui/textStyle'

/** Largura média de um carácter por família (em múltiplos do tamanho), para a moldura e o editor. */
const CHAR_WIDTH: Record<string, number> = { sans: 0.56, serif: 0.52, mono: 0.62, rounded: 0.58, hand: 0.6 }

export function freeTextBox(comment: GrafcetComment) {
  const size = comment.fontSize ?? 13
  const lines = (comment.text || ' ').split('\n')
  const longest = Math.max(1, ...lines.map((line) => line.length))
  const width = longest * size * (CHAR_WIDTH[comment.font ?? 'sans'] ?? 0.56) * (Number(comment.fontWeight ?? 600) >= 600 ? 1.04 : 1)
  const height = lines.length * size * 1.22
  const left = comment.align === 'center' ? comment.x - width / 2 : comment.align === 'right' ? comment.x - width : comment.x
  return { left, top: comment.y, width, height, size, lines }
}

/**
 * Texto livre do GRAFCET: arrasta-se com a ferramenta Selecionar, duplo clique edita
 * no próprio desenho (sem caixa do sistema) e a barra de formatação muda o estilo.
 */
export default function GrafcetFreeText({ comment, selected, editing, interactive, touchEdit, toWorld, snap, onSelect, onEdit, onMove, onText, onContextMenu, onGroupDown }: {
  comment: GrafcetComment
  selected: boolean
  editing: boolean
  interactive: boolean
  /** Telemóvel: 1.º toque seleciona, toque num texto já selecionado (ou duplo toque) pede a edição. */
  touchEdit?: boolean
  toWorld: (clientX: number, clientY: number) => { x: number; y: number }
  snap: (point: { x: number; y: number }, free: boolean) => { x: number; y: number }
  onSelect: () => void
  onEdit: (editing: boolean) => void
  onMove: (x: number, y: number) => void
  onText: (text: string) => void
  onContextMenu: (event: React.MouseEvent) => void
  /** Ctrl/Shift+clique ou texto de um grupo/multi-seleção: o editor trata (seleção e arrasto em conjunto). */
  onGroupDown?: (comment: GrafcetComment, event: ReactPointerEvent<SVGGElement>) => boolean
}) {
  const [live, setLive] = useState<{ x: number; y: number } | null>(null)
  const drag = useRef<{ dx: number; dy: number; sx: number; sy: number; moved: boolean; wasSelected: boolean } | null>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const discardRef = useRef(false)
  const [draft, setDraft] = useState(comment.text)
  useEffect(() => { if (editing) { setDraft(comment.text); discardRef.current = false; window.requestAnimationFrame(() => { editorRef.current?.focus(); editorRef.current?.select() }) } }, [editing])
  useEffect(() => {
    if (!editing) return
    const onCancel = () => {
      discardRef.current = true
      setDraft(comment.text)
      editorRef.current?.blur()
      onEdit(false)
    }
    const onConfirm = () => { editorRef.current?.blur() }
    window.addEventListener('dcsimu:text-cancel', onCancel)
    window.addEventListener('dcsimu:text-confirm', onConfirm)
    return () => {
      window.removeEventListener('dcsimu:text-cancel', onCancel)
      window.removeEventListener('dcsimu:text-confirm', onConfirm)
    }
  }, [editing, comment.text, onEdit])

  const shown = live ? { ...comment, x: live.x, y: live.y } : comment
  const editingBox = editing ? freeTextBox({ ...shown, text: draft }) : null
  const box = editingBox ?? freeTextBox(shown)
  const anchor = comment.align === 'center' ? 'middle' : comment.align === 'right' ? 'end' : 'start'
  const pad = Math.max(touchEdit ? 12 : 3, box.size * (touchEdit ? 0.55 : 0.3))
  const bold = Number(comment.fontWeight ?? 600) >= 600

  const down = (event: ReactPointerEvent<SVGGElement>) => {
    if (!interactive || editing || event.button !== 0) return
    event.stopPropagation()
    if (onGroupDown?.(comment, event)) return
    onSelect()
    const point = toWorld(event.clientX, event.clientY)
    drag.current = { dx: comment.x - point.x, dy: comment.y - point.y, sx: event.clientX, sy: event.clientY, moved: false, wasSelected: selected }
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* noop */ }
  }
  const move = (event: ReactPointerEvent<SVGGElement>) => {
    const current = drag.current
    if (!current) return
    if (!current.moved && Math.hypot(event.clientX - current.sx, event.clientY - current.sy) < (touchEdit ? 8 : 3)) return
    current.moved = true
    const point = toWorld(event.clientX, event.clientY)
    setLive(snap({ x: point.x + current.dx, y: point.y + current.dy }, event.altKey))
  }
  const up = () => {
    const current = drag.current
    drag.current = null
    if (current?.moved && live) onMove(Math.round(live.x), Math.round(live.y))
    // Clique/toque sem arrastar: seleciona (barra de formatação) e abre já a escrita.
    else if (current && !current.moved && interactive && (!touchEdit || current.wasSelected)) onEdit(true)
    setLive(null)
  }
  const commit = () => {
    const discard = discardRef.current
    discardRef.current = false
    onEdit(false)
    if (!discard && draft !== comment.text) onText(draft)
  }

  return <g className={`grafcet-free-text${selected ? ' is-selected' : ''}`} data-grafcet-text={comment.id}
    onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
    onDoubleClick={(event) => { if (!interactive) return; event.stopPropagation(); onSelect(); onEdit(true) }}
    onContextMenu={onContextMenu}
    style={{ cursor: interactive ? (editing ? 'text' : 'move') : 'default', pointerEvents: 'auto' }}>
    <rect className="grafcet-free-text-frame" x={box.left - pad} y={box.top - pad} width={box.width + pad * 2} height={box.height + pad * 2} rx={Math.min(6, pad)}
      style={comment.background ? { fill: comment.background, stroke: selected ? undefined : 'transparent' } : undefined} />
    {editing && editingBox ? <foreignObject x={box.left - 2} y={box.top - 2} width={Math.max(box.width, box.size * 4) + 8} height={box.height + 6}>
      <textarea ref={editorRef} className="grafcet-text-editor" value={draft} spellCheck
        style={{ fontFamily: fontStack(comment.font), fontSize: box.size, lineHeight: 1.22, fontWeight: bold ? 700 : 450, fontStyle: comment.italic ? 'italic' : 'normal', textDecoration: comment.underline ? 'underline' : 'none', textAlign: comment.align ?? 'left', color: comment.color ?? '#334155' }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Escape') {
            event.preventDefault()
            discardRef.current = true
            setDraft(comment.text)
            event.currentTarget.blur()
            return
          }
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            event.currentTarget.blur()
          }
        }}
        aria-label="Editar texto do GRAFCET" />
    </foreignObject>
      : <text
        className="grafcet-comment"
        x={shown.x}
        y={box.top}
        fontSize={box.size}
        fontFamily={fontStack(comment.font)}
        fontWeight={bold ? 700 : 450}
        fontStyle={comment.italic ? 'italic' : 'normal'}
        textDecoration={comment.underline ? 'underline' : undefined}
        textAnchor={anchor}
        fill={comment.color ?? '#334155'}
        style={{ userSelect: 'none' }}
      >
        <title>{interactive ? 'Arraste para mover · clique para escrever · botão direito: opções' : comment.text}</title>
        {box.lines.map((line, index) => <tspan key={index} x={shown.x} dy={index === 0 ? box.size * 0.92 : box.size * 1.22}>{line || ' '}</tspan>)}
      </text>}
  </g>
}
