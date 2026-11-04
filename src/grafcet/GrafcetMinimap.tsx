import type { RefObject } from 'react'
import EditorMinimap from '../ui/EditorMinimap'

interface Props {
  width: number
  height: number
  sourceSvgRef: RefObject<SVGSVGElement | null>
  view: { x: number; y: number; w: number; h: number }
  onNavigate: (worldX: number, worldY: number) => void
}

/** Minimapa GRAFCET — delega no minimapa partilhado dos editores. */
export default function GrafcetMinimap(props: Props) {
  return (
    <EditorMinimap
      {...props}
      title="GRAFCET"
      className="grafcet-minimap"
    />
  )
}
