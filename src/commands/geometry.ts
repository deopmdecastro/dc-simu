import { terminalAt, wirePoints, type CmdPart, type CmdWire, type CommandsDiagram, type Pt } from './model'
import { expandPolyline, simplifyOrthogonal, beginSegmentDrag, applySegmentDrag, interiorBends, type SegmentDrag } from '../grafcet/links'

/** One path for editor, hit-test, geometry editing and static PDF export. */
export function commandWirePoints(wire: CmdWire, parts: ReadonlyMap<string, CmdPart>): Pt[] {
  const a=parts.get(wire.a.part),b=parts.get(wire.b.part)
  if(!a||!b)return []
  const start=terminalAt(a,wire.a.term),end=terminalAt(b,wire.b.term)
  return wire.bends?.length ? simplifyOrthogonal(expandPolyline([start,...wire.bends,end])) : wirePoints(start,end,wire.mid)
}
export function commandSegmentDrag(wire:CmdWire,parts:ReadonlyMap<string,CmdPart>,leg:number):SegmentDrag|null {
  return beginSegmentDrag(commandWirePoints(wire,parts),leg)
}
export function moveCommandSegment(wire:CmdWire,drag:SegmentDrag,delta:number):CmdWire {
  const {mid:_mid,...rest}=wire
  return {...rest,bends:interiorBends(applySegmentDrag(drag,delta))}
}
/** Only internal routes translate with a group. External links retain their
 * endpoint identities and are re-orthogonalized from the current terminals. */
export function moveCommandsSelection(diagram:CommandsDiagram,partIds:readonly string[],labelIds:readonly string[],dx:number,dy:number):CommandsDiagram {
  const parts=new Set(partIds),labels=new Set(labelIds)
  return {...diagram,
    parts:diagram.parts.map(p=>parts.has(p.id)?{...p,x:p.x+dx,y:p.y+dy}:p),
    texts:diagram.texts?.map(t=>labels.has(t.id)?{...t,x:t.x+dx,y:t.y+dy}:t),
    wires:diagram.wires.map(w=>parts.has(w.a.part)&&parts.has(w.b.part)?{...w,
      ...(w.bends?{bends:w.bends.map(p=>({x:p.x+dx,y:p.y+dy}))}:{}),
      ...(w.mid===undefined?{}:{mid:w.mid+dy})}:w),
  }
}
