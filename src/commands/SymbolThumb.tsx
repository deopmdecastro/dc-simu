// Miniatura do símbolo IEC (a mesma geometria do esquema, em repouso) — partilhada pela biblioteca e pela lista de Objetos.
import { partBox, type CmdKind } from './model'
import { NC_KINDS, symbolBody } from './symbols'

export default function SymbolThumb({ kind, lines: given, size = 58 }: { kind: CmdKind; lines?: string[]; size?: number }) {
  const lines = kind === 'supply' ? (given?.length ? given : ['L1', 'L2', 'L3']) : undefined
  const box = partBox({ id: 'pv', kind, x: 0, y: 0, rot: 0, tag: '', lines })
  const side = Math.max(box.w, box.h) + 24
  const cx = box.x + box.w / 2
  // A alimentação tem as legendas L1 L2 L3 por cima do borne: sobe um pouco o centro.
  const cy = box.y + box.h / 2 - (kind === 'supply' ? 4 : 0)
  return <svg width={size} height={size} viewBox={`${cx - side / 2} ${cy - side / 2} ${side} ${side}`} aria-hidden="true">
    <g fill="none" stroke="#1e293b" strokeWidth={Math.max(1.6, side / 52)} strokeLinecap="round" strokeLinejoin="round">{symbolBody({ kind, lines, color: 'green' }, { idle: true, closed: NC_KINDS.has(kind) ? true : undefined })}</g>
  </svg>
}
