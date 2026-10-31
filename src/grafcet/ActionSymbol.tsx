import type { GrafcetAction } from './engine'
import { renderConditionTspans } from './grafcetRender'

/** Qualificadores que ocupam uma célula própria à esquerda da caixa (S, R, D, L). */
export const QUALIFIER_CELL_KINDS = ['S', 'R', 'D', 'L']

export type ActionShape = {
  conditional: boolean
  allocation: 'continuous' | 'activation' | 'deactivation' | 'event' | 'compulsory'
  qualifier: string | null
}

/** Normaliza uma ação nas propriedades que definem o símbolo IEC 60848. */
export function actionShape(action: Pick<GrafcetAction, 'kind' | 'allocation' | 'type' | 'condition'>): ActionShape {
  const kind = action.kind ?? 'N'
  const allocation = action.allocation
    ?? (kind === 'A' ? 'activation' : kind === 'DA' ? 'deactivation' : kind === 'EV' ? 'event' : kind === 'C' ? 'compulsory' : 'continuous')
  const conditional = action.type === 'conditional' || !!(action.condition && action.condition !== '1')
  return { conditional, allocation, qualifier: allocation === 'continuous' && QUALIFIER_CELL_KINDS.includes(kind) ? kind : null }
}

interface ActionSymbolProps {
  x: number
  y: number
  w: number
  h: number
  shape: ActionShape
  label: string
  /** Segunda linha (variável) quando se mostra a descrição. */
  subLabel?: string
  condition?: string
  timeSeconds?: number
  stroke?: string
  strokeWidth?: number
  fill?: string
  textColor?: string
  dashed?: boolean
  qualifierW?: number
  /** Miniatura: só o contorno, sem textos. */
  mini?: boolean
}

/**
 * Símbolo IEC 60848 da ação (partilhado pelo diagrama, ações soltas, modal e miniaturas):
 * simples = retângulo; condicionada = traço com a condição; ↑ ao ativar / ↓ ao desativar = seta
 * na aresta esquerda que sai da caixa; evento = triângulo cheio; comando forçado = retângulo duplo.
 */
export default function ActionSymbol({
  x, y, w, h, shape, label, subLabel, condition, timeSeconds, stroke = '#263d59', strokeWidth = 1.5,
  fill = '#fff', textColor = '#1e293b', dashed, qualifierW = 32, mini,
}: ActionSymbolProps) {
  const { conditional, allocation, qualifier } = shape
  const marker = allocation === 'activation' || allocation === 'deactivation' || allocation === 'event'
  const textX = qualifier ? x + qualifierW + 10 : x + (marker ? 18 : 12)
  const midY = y + h / 2
  const ax = x + 6
  const head = Math.min(5, h / 6)
  return (
    <g>
      {conditional && (
        <g>
          <path d={`M ${x + 16} ${y} V ${y - (mini ? 6 : 10)} H ${x + (mini ? 40 : 85)}`} fill="none" stroke={stroke} strokeWidth={strokeWidth} />
          {!mini && <text x={x + 20} y={y - 13} fill="#2563eb" fontSize="10" fontWeight="700">{renderConditionTspans((condition || '1').length > 17 ? `${(condition || '1').slice(0, 16)}…` : condition || '1')}</text>}
        </g>
      )}
      <rect className="grafcet-action-box" x={x} y={y} width={w} height={h} rx="2.5" fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dashed ? '6 3' : undefined} />
      {allocation === 'compulsory' && <rect x={x + 3} y={y + 3} width={w - 6} height={h - 6} fill="none" stroke={stroke} strokeWidth={Math.max(1, strokeWidth * 0.8)} />}
      {qualifier && (
        <g>
          {!mini && <rect x={x + strokeWidth / 2} y={y + strokeWidth / 2} width={qualifierW - strokeWidth / 2} height={h - strokeWidth} fill={stroke} opacity="0.07" pointerEvents="none" />}
          <line x1={x + qualifierW} y1={y} x2={x + qualifierW} y2={y + h} stroke={stroke} strokeWidth={strokeWidth} />
          {mini ? (
            <text x={x + qualifierW / 2} y={midY + 3.5} textAnchor="middle" fill={stroke} fontSize="10.5" fontWeight="700">{qualifier}</text>
          ) : qualifier === 'D' || qualifier === 'L' ? (
            <>
              <text x={x + qualifierW / 2} y={midY - 5} textAnchor="middle" dominantBaseline="central" fill={stroke} fontSize="10" fontWeight="700">{qualifier}</text>
              <text x={x + qualifierW / 2} y={midY + 7} textAnchor="middle" dominantBaseline="central" fill={stroke} fontSize="8.5" fontWeight="600">{timeSeconds ?? 2}s</text>
            </>
          ) : (
            <text x={x + qualifierW / 2} y={midY} textAnchor="middle" dominantBaseline="central" fill={stroke} fontSize="12.5" fontWeight="700">{qualifier}</text>
          )}
        </g>
      )}
      {allocation === 'activation' && (
        <g stroke={stroke} strokeWidth={Math.max(1.4, strokeWidth)} fill="none" strokeLinecap="round" strokeLinejoin="round">
          <line x1={ax} y1={y + h - 5} x2={ax} y2={y - 7} />
          <path d={`M ${ax - head} ${y - 7 + head + 1} L ${ax} ${y - 8} L ${ax + head} ${y - 7 + head + 1}`} />
        </g>
      )}
      {allocation === 'deactivation' && (
        <g stroke={stroke} strokeWidth={Math.max(1.4, strokeWidth)} fill="none" strokeLinecap="round" strokeLinejoin="round">
          <line x1={ax} y1={y + 5} x2={ax} y2={y + h + 7} />
          <path d={`M ${ax - head} ${y + h + 7 - head - 1} L ${ax} ${y + h + 8} L ${ax + head} ${y + h + 7 - head - 1}`} />
        </g>
      )}
      {allocation === 'event' && <path d={`M ${x} ${midY - 6} L ${x + 9} ${midY} L ${x} ${midY + 6} Z`} fill={stroke} />}
      {!mini && (
        <text x={textX} y={subLabel ? midY - 6 : midY} dominantBaseline="central" fill={textColor} fontSize="12" fontWeight="650" fontFamily={subLabel ? undefined : 'ui-monospace, SFMono-Regular, Menlo, monospace'}>
          {label}
          {subLabel ? <tspan x={textX} y={midY + 8} fill="#64748b" fontSize="9.5" fontWeight="500" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">{subLabel}</tspan> : null}
        </text>
      )}
    </g>
  )
}
