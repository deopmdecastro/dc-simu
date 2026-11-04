import type { RefObject } from 'react'
import EditorMinimap from '../ui/EditorMinimap'

interface Props {
  width: number
  height: number
  sourceSvgRef: RefObject<SVGSVGElement | null>
  view: { x: number; y: number; w: number; h: number }
  onNavigate: (worldX: number, worldY: number) => void
  onHide?: () => void
}

/** Minimapa GRAFCET — delega no minimapa partilhado dos editores. */
export default function GrafcetMinimap(props: Props) {
  return (
    <EditorMinimap
      width={props.width}
      height={props.height}
      sourceSvgRef={props.sourceSvgRef}
      view={props.view}
      onNavigate={props.onNavigate}
      onHide={props.onHide}
      title="GRAFCET"
      className="grafcet-minimap"
    />
  )
}
