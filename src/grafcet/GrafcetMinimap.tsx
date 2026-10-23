import { useId, useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  /** Tamanho total do diagrama (coordenadas do diagrama). */
  width: number
  height: number
  sourceSvgRef: RefObject<SVGSVGElement>
  /** Parte do diagrama visível neste momento. */
  view: { x: number; y: number; w: number; h: number }
  /** Centra a vista num ponto do diagrama. */
  onNavigate: (worldX: number, worldY: number) => void
}

const MAX_W = 220
const MAX_H = 150

/**
 * Minimapa do diagrama: reutiliza os mesmos elementos SVG do editor e mantém a
 * zona visível como moldura clicável/arrastável.
 */
export default function GrafcetMinimap({ width, height, sourceSvgRef, view, onNavigate }: Props) {
  const ref = useRef<SVGSVGElement>(null)
  const graphicRef = useRef<SVGGElement>(null)
  const expandedGraphicRef = useRef<SVGGElement>(null)
  const expandButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const dragging = useRef(false)
  const [expanded, setExpanded] = useState(false)
  const idPrefix = useId().replace(/:/g, '')
  const k = Math.min(MAX_W / Math.max(width, 1), MAX_H / Math.max(height, 1))
  const w = Math.max(60, Math.round(width * k))
  const h = Math.max(40, Math.round(height * k))

  useLayoutEffect(() => {
    const source = sourceSvgRef.current
    if (!source || !graphicRef.current) return

    const syncDiagram = () => {
      const targets = [
        { element: graphicRef.current, suffix: 'minimap' },
        { element: expandedGraphicRef.current, suffix: 'expanded' },
      ]
      targets.forEach(({ element, suffix }) => {
        if (!element) return
        const clone = source.cloneNode(true) as SVGSVGElement

        clone.querySelectorAll(
          '.grafcet-node-handle, .grafcet-port, .grafcet-step-hover-zone, rect[fill="transparent"], circle[fill="transparent"], path[stroke="transparent"], line[stroke="transparent"]',
        ).forEach((node) => node.remove())

        clone.querySelectorAll<SVGElement>('*').forEach((node) => {
          node.removeAttribute('tabindex')
          node.removeAttribute('role')
          Array.from(node.attributes)
            .filter((attribute) => attribute.name.startsWith('aria-'))
            .forEach((attribute) => node.removeAttribute(attribute.name))
        })

        const ids = new Map<string, string>()
        clone.querySelectorAll<SVGElement>('[id]').forEach((node) => {
          const oldId = node.id
          const nextId = `grafcet-${suffix}-${idPrefix}-${oldId}`
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
  }, [expanded, idPrefix, sourceSvgRef])

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

  return (
    <div
      className="grafcet-minimap"
      role="group"
      aria-label="Minimapa do diagrama"
      onWheel={(event) => event.stopPropagation()}
    >
      <button
        ref={expandButtonRef}
        type="button"
        className="grafcet-minimap-expand"
        aria-label="Ampliar pré-visualização do GRAFCET"
        title="Ampliar pré-visualização do GRAFCET"
        onClick={() => setExpanded(true)}
      >
        Ampliar
      </button>
      <svg
        ref={ref}
        width={w}
        height={h}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Pré-visualização do GRAFCET real"
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
        <g ref={graphicRef} className="grafcet-minimap-diagram" pointerEvents="none" aria-hidden="true" />
        <rect
          className="grafcet-minimap-view"
          x={view.x}
          y={view.y}
          width={Math.max(view.w, 1)}
          height={Math.max(view.h, 1)}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      </svg>
      {expanded && createPortal(
        <div
          className="grafcet-preview-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeExpanded()
          }}
        >
          <section
            className="grafcet-preview-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`grafcet-preview-title-${idPrefix}`}
          >
            <header className="grafcet-preview-header">
              <div>
                <h2 id={`grafcet-preview-title-${idPrefix}`}>Pré-visualização do GRAFCET</h2>
                <p>Diagrama real · {width} × {height} unidades</p>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                className="grafcet-preview-close"
                onClick={closeExpanded}
                aria-label="Fechar pré-visualização"
              >
                Fechar <span aria-hidden="true">×</span>
              </button>
            </header>
            <div className="grafcet-preview-frame">
              <svg
                viewBox={`0 0 ${width} ${height}`}
                preserveAspectRatio="xMidYMid meet"
                role="img"
                aria-label="Diagrama GRAFCET completo em tamanho ampliado"
              >
                <g ref={expandedGraphicRef} className="grafcet-minimap-diagram" pointerEvents="none" aria-hidden="true" />
              </svg>
            </div>
            <p className="grafcet-preview-hint">Use Escape ou Fechar para voltar ao editor.</p>
          </section>
        </div>,
        document.body,
      )}
    </div>
  )
}
