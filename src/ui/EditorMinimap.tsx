import { useId, useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'

export interface EditorMinimapProps {
  /** Extensão total do conteúdo (unidades do diagrama). */
  width: number
  height: number
  /** Origem do conteúdo (se o diagrama não começa em 0,0). */
  originX?: number
  originY?: number
  sourceSvgRef: RefObject<SVGSVGElement | null>
  /** Parte visível neste momento (coordenadas do diagrama). */
  view: { x: number; y: number; w: number; h: number }
  /** Centra a vista num ponto do diagrama. */
  onNavigate: (worldX: number, worldY: number) => void
  title?: string
  className?: string
  stripSelectors?: string
  /**
   * Quando true, remove transform translate/scale do grupo de conteúdo
   * (Esquema IEC guarda pan/zoom no SVG; o minimapa precisa de coordenadas nativas).
   */
  stripViewTransform?: boolean
  /** Esconde o minimapa (botão no canto da barra). */
  onHide?: () => void
}

const MAX_W = 248
const MAX_H = 168
const DEFAULT_STRIP =
  '.grafcet-node-handle, .grafcet-port, .grafcet-step-hover-zone, .schematic-terminal-hit, rect[fill="transparent"], circle[fill="transparent"], path[stroke="transparent"], line[stroke="transparent"]'

/**
 * Minimapa partilhado (GRAFCET, Esquema IEC): clone do SVG do editor, moldura
 * da vista, navegação por clique/arrasto e pré-visualização ampliada.
 */
export default function EditorMinimap({
  width,
  height,
  originX = 0,
  originY = 0,
  sourceSvgRef,
  view,
  onNavigate,
  title = 'Diagrama',
  className = '',
  stripSelectors = DEFAULT_STRIP,
  stripViewTransform = false,
  onHide,
}: EditorMinimapProps) {
  const ref = useRef<SVGSVGElement>(null)
  const graphicRef = useRef<SVGGElement>(null)
  const expandedGraphicRef = useRef<SVGGElement>(null)
  const expandButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const dragging = useRef(false)
  const [expanded, setExpanded] = useState(false)
  const idPrefix = useId().replace(/:/g, '')

  const contentW = Math.max(width, 1)
  const contentH = Math.max(height, 1)
  const k = Math.min(MAX_W / contentW, MAX_H / contentH)
  const w = Math.max(72, Math.round(contentW * k))
  const h = Math.max(52, Math.round(contentH * k))

  useLayoutEffect(() => {
    const source = sourceSvgRef.current
    if (!source) return

    const syncDiagram = () => {
      const targets = [
        { element: graphicRef.current, suffix: 'minimap' },
        { element: expandedGraphicRef.current, suffix: 'expanded' },
      ]
      targets.forEach(({ element, suffix }) => {
        if (!element) return
        const clone = source.cloneNode(true) as SVGSVGElement

        clone.querySelectorAll(stripSelectors).forEach((node) => node.remove())

        if (stripViewTransform) {
          clone.querySelectorAll('g[transform]').forEach((node) => {
            const t = node.getAttribute('transform') || ''
            if (/translate|scale/i.test(t)) node.removeAttribute('transform')
          })
        }

        clone.querySelectorAll<SVGElement>('*').forEach((node) => {
          node.removeAttribute('tabindex')
          node.removeAttribute('role')
          Array.from(node.attributes)
            // data-*-id identifica o elemento real do diagrama: a cópia não pode responder por ele.
            .filter((attribute) => attribute.name.startsWith('aria-') || /^data-(?:.+-id|grafcet-text)$/.test(attribute.name))
            .forEach((attribute) => node.removeAttribute(attribute.name))
        })

        const ids = new Map<string, string>()
        clone.querySelectorAll<SVGElement>('[id]').forEach((node) => {
          const oldId = node.id
          if (!oldId) return
          const nextId = `mm-${suffix}-${idPrefix}-${oldId}`
          ids.set(oldId, nextId)
          node.id = nextId
        })
        clone.querySelectorAll<SVGElement>('*').forEach((node) => {
          Array.from(node.attributes).forEach((attribute) => {
            const value = attribute.value.replace(/url\(#([^)]+)\)/g, (reference, id: string) => {
              const nextId = ids.get(id)
              return nextId ? `url(#${nextId})` : reference
            })
            if (value !== attribute.value) node.setAttribute(attribute.name, value)
          })
        })

        element.replaceChildren(...Array.from(clone.childNodes))
      })
    }

    syncDiagram()
    let frame: number | null = null
    const observer = new MutationObserver(() => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        syncDiagram()
      })
    })
    observer.observe(source, { subtree: true, childList: true, attributes: true, characterData: true })
    return () => {
      observer.disconnect()
      if (frame !== null) window.cancelAnimationFrame(frame)
    }
  }, [expanded, idPrefix, sourceSvgRef, stripSelectors, stripViewTransform, width, height])

  useLayoutEffect(() => {
    if (!expanded) return
    closeButtonRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setExpanded(false)
      window.requestAnimationFrame(() => expandButtonRef.current?.focus())
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [expanded])

  const closeExpanded = () => {
    setExpanded(false)
    window.requestAnimationFrame(() => expandButtonRef.current?.focus())
  }

  const toWorld = (event: PointerEvent<SVGSVGElement>) => {
    const svg = ref.current
    const matrix = svg?.getScreenCTM()
    if (!svg || !matrix) return null
    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    return point.matrixTransform(matrix.inverse())
  }

  const go = (event: PointerEvent<SVGSVGElement>) => {
    const point = toWorld(event)
    if (point) onNavigate(point.x, point.y)
  }

  const visiblePct = Math.min(
    100,
    Math.round(((Math.min(view.w, contentW) * Math.min(view.h, contentH)) / (contentW * contentH)) * 100),
  )

  return (
    <div
      className={`editor-minimap ${className}`.trim()}
      role="group"
      aria-label={`Minimapa: ${title}`}
      data-editor-minimap
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="editor-minimap-toolbar">
        <span className="editor-minimap-label" title={`${Math.round(contentW)} × ${Math.round(contentH)}`}>
          Vista · {Number.isFinite(visiblePct) ? `${visiblePct}%` : '—'}
        </span>
        <div className="editor-minimap-actions">
          <button
            ref={expandButtonRef}
            type="button"
            className="editor-minimap-expand"
            aria-label={`Ampliar pré-visualização: ${title}`}
            title={`Ampliar pré-visualização: ${title}`}
            onClick={() => setExpanded(true)}
          >
            Ampliar
          </button>
          {onHide && (
            <button
              type="button"
              className="editor-minimap-hide"
              aria-label="Esconder minimapa"
              title="Esconder minimapa"
              onClick={(event) => {
                event.stopPropagation()
                onHide()
              }}
            >
              ×
            </button>
          )}
        </div>
      </div>
      <svg
        ref={ref}
        width={w}
        height={h}
        viewBox={`${originX} ${originY} ${contentW} ${contentH}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Pré-visualização: ${title}. Clique ou arraste para navegar.`}
        onPointerDown={(event) => {
          event.stopPropagation()
          dragging.current = true
          event.currentTarget.setPointerCapture(event.pointerId)
          go(event)
        }}
        onPointerMove={(event) => {
          if (dragging.current) go(event)
        }}
        onPointerUp={(event) => {
          dragging.current = false
          try {
            event.currentTarget.releasePointerCapture(event.pointerId)
          } catch {
            /* noop */
          }
        }}
        onPointerCancel={() => {
          dragging.current = false
        }}
      >
        <rect x={originX} y={originY} width={contentW} height={contentH} className="editor-minimap-bg" />
        <g ref={graphicRef} className="editor-minimap-diagram" pointerEvents="none" aria-hidden="true" />
        <rect
          className="editor-minimap-view"
          x={view.x}
          y={view.y}
          width={Math.max(1, view.w)}
          height={Math.max(1, view.h)}
          pointerEvents="none"
        />
      </svg>

      {expanded &&
        createPortal(
          <div className="editor-preview-backdrop" role="presentation" onClick={closeExpanded}>
            <section
              className="editor-preview-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby={`editor-preview-title-${idPrefix}`}
              onClick={(event) => event.stopPropagation()}
            >
              <header className="editor-preview-header">
                <div>
                  <h2 id={`editor-preview-title-${idPrefix}`}>Pré-visualização · {title}</h2>
                  <p>
                    {Math.round(contentW)} × {Math.round(contentH)} · clique no diagrama para centrar a vista
                  </p>
                </div>
                <button
                  ref={closeButtonRef}
                  type="button"
                  className="editor-preview-close"
                  onClick={closeExpanded}
                  aria-label="Fechar pré-visualização"
                >
                  Fechar <span aria-hidden="true">×</span>
                </button>
              </header>
              <div
                className="editor-preview-frame"
                onClick={(event) => {
                  const frame = event.currentTarget.getBoundingClientRect()
                  const scale = Math.min(frame.width / contentW, frame.height / contentH)
                  const ox = (frame.width - contentW * scale) / 2
                  const oy = (frame.height - contentH * scale) / 2
                  const wx = (event.clientX - frame.left - ox) / scale + originX
                  const wy = (event.clientY - frame.top - oy) / scale + originY
                  onNavigate(wx, wy)
                }}
              >
                <svg
                  viewBox={`${originX} ${originY} ${contentW} ${contentH}`}
                  preserveAspectRatio="xMidYMid meet"
                  role="img"
                  aria-label={`${title} completo`}
                >
                  <g ref={expandedGraphicRef} className="editor-minimap-diagram" pointerEvents="none" aria-hidden="true" />
                </svg>
              </div>
              <p className="editor-preview-hint">Escape ou Fechar para voltar · clique centra a vista no editor</p>
            </section>
          </div>,
          document.body,
        )}
    </div>
  )
}
