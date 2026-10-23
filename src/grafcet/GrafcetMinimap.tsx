import { useRef, type PointerEvent } from 'react'

export interface MinimapNode {
  x: number
  y: number
  active: boolean
  selected: boolean
  identifier?: string
  label?: string
}

export interface MinimapLink {
  from: { x: number; y: number }
  to: { x: number; y: number }
}

interface Props {
  /** Tamanho total do diagrama (coordenadas do diagrama). */
  width: number
  height: number
  nodes: MinimapNode[]
  links: MinimapLink[]
  /** Parte do diagrama visível neste momento. */
  view: { x: number; y: number; w: number; h: number }
  /** Centra a vista num ponto do diagrama. */
  onNavigate: (worldX: number, worldY: number) => void
}

const MAX_W = 220
const MAX_H = 150
const NODE_W = 64
const NODE_H = 54

/**
 * Minimapa do diagrama: mostra todas as etapas, a zona visível e permite saltar
 * para qualquer ponto com um clique ou arrastando o retângulo da vista.
 */
export default function GrafcetMinimap({ width, height, nodes, links, view, onNavigate }: Props) {
  const ref = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)
  const k = Math.min(MAX_W / Math.max(width, 1), MAX_H / Math.max(height, 1))
  const w = Math.max(60, Math.round(width * k))
  const h = Math.max(40, Math.round(height * k))
  const scaleX = w / Math.max(width, 1)
  const scaleY = h / Math.max(height, 1)
  const nodeWidth = Math.max(
    NODE_W,
    ...nodes.map((node) => Math.max(10, (node.identifier?.length ?? 0) * 5 + 4) / scaleX),
  )
  const nodeHeight = Math.max(NODE_H, 8 / scaleY)
  const labelFontSize = 7 / scaleX

  const toWorld = (event: PointerEvent<SVGSVGElement>) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return null
    return { x: ((event.clientX - rect.left) / rect.width) * width, y: ((event.clientY - rect.top) / rect.height) * height }
  }

  const go = (event: PointerEvent<SVGSVGElement>) => {
    const point = toWorld(event)
    if (point) onNavigate(point.x, point.y)
  }

  return (
    <div className="grafcet-minimap" role="group" aria-label="Minimapa do diagrama" onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
      <svg
        ref={ref}
        width={w}
        height={h}
        viewBox={`0 0 ${width} ${height}`}
        onPointerDown={(event) => {
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
        {links.map((link, index) => (
          <line
            key={index}
            x1={link.from.x}
            y1={link.from.y + NODE_H / 2}
            x2={link.to.x}
            y2={link.to.y + NODE_H / 2}
            className="grafcet-minimap-link"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {nodes.map((node, index) => {
          const label = `${node.label ?? 'Etapa'}${node.active ? ' · ativa' : ''}${node.selected ? ' · selecionada' : ''}`
          return (
            <g key={index} role="img" aria-label={label}>
              <title>{label}</title>
              <rect
                x={node.x - nodeWidth / 2}
                y={node.y + NODE_H / 2 - nodeHeight / 2}
                width={nodeWidth}
                height={nodeHeight}
                rx={6}
                className={`grafcet-minimap-node${node.active ? ' is-active' : ''}${node.selected ? ' is-selected' : ''}`}
              />
            </g>
          )
        })}
        <rect className="grafcet-minimap-view" x={view.x} y={view.y} width={Math.max(view.w, 1)} height={Math.max(view.h, 1)} vectorEffect="non-scaling-stroke" />
        {nodes.map((node, index) => node.identifier ? (
          <text
            key={index}
            x={node.x}
            y={node.y + NODE_H / 2}
            className="grafcet-minimap-node-label"
            fontSize={labelFontSize}
            aria-hidden="true"
          >
            {node.identifier}
          </text>
        ) : null)}
      </svg>
    </div>
  )
}
