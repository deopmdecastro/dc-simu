import type { WireColor, WireDefaults, WireEndType, WireFlexibility } from '../types'
import { ConductorIcon, WIRE_END_OPTIONS, WireEndIcon } from '../schematic/wireEnds'
import { WIRE_COLOR_HEX, WIRE_COLOR_LABEL, WIRE_GAUGES } from '../admin/editor3d/wireStyle'

/**
 * Opções dos cabos novos (cor, secção, condutor e terminação das pontas) num
 * bloco desenhado para o painel lateral esquerdo.
 *
 * Vive em `ui/` porque é o mesmo bloco em dois sítios: no inspetor do simulador
 * (painel lateral do Esquema/3D, quando a ferramenta Cabo está ativa) e no
 * painel esquerdo do editor de componentes. Assim a UI/UX do cabo — com o
 * ícone da ponteira e o ícone do condutor rígido/flexível — é exatamente a
 * mesma nos dois editores e deixa de haver um cartão sobre o canvas.
 *
 * Só apresenta valores e devolve alterações: quem chama guarda o estado
 * (store do simulador ou `wireDefaults` do editor de componentes).
 */

export type WireOptionPatch = Partial<WireDefaults>

const COLOR_ORDER: WireColor[] = ['red', 'blue', 'green-yellow', 'black', 'orange', 'grey', 'brown', 'white', 'pink', 'violet', 'green', 'yellow', 'lightblue']

const CONDUCTORS: Array<{ id: WireFlexibility; name: string; hint: string }> = [
  { id: 'flexible', name: 'Flexível', hint: 'Multifilar · precisa de ponteira' },
  { id: 'rigid', name: 'Rígido', hint: 'Fio sólido · entra direto no borne' },
]

export function WireOptionsFields({ value, onChange, compact = false }: {
  value: WireDefaults
  onChange: (patch: WireOptionPatch) => void
  /** Painel estreito: os campos passam a uma coluna para não apertar os ícones. */
  compact?: boolean
}) {
  const endColor = value.autoColor ? '#ef4444' : WIRE_COLOR_HEX[value.color]
  const selectedEnd = WIRE_END_OPTIONS.find((option) => option.id === value.endType)

  return <div className={`wo-fields${compact ? ' is-compact' : ''}`}>
    <div className="wo-group wo-colors">
      <div className="wo-label">
        <span>Cor do cabo</span>
        <button
          type="button"
          className={`wo-auto${value.autoColor ? ' is-on' : ''}`}
          aria-pressed={value.autoColor}
          onClick={() => onChange({ autoColor: !value.autoColor })}
          title="Cor automática pela função do cabo (força preto, comando vermelho, neutro azul, PE verde-amarelo…)"
        >AUTO</button>
      </div>
      <div className="wo-swatches" role="radiogroup" aria-label="Cor do cabo">
        {COLOR_ORDER.map((name) => <button
          key={name}
          type="button"
          role="radio"
          aria-checked={!value.autoColor && value.color === name}
          aria-label={WIRE_COLOR_LABEL[name]}
          title={WIRE_COLOR_LABEL[name]}
          className={`wo-swatch${!value.autoColor && value.color === name ? ' is-on' : ''}${value.autoColor ? ' is-dim' : ''}`}
          style={{ background: name === 'green-yellow' ? 'repeating-linear-gradient(45deg,#84cc16 0 4px,#eab308 4px 8px)' : WIRE_COLOR_HEX[name] }}
          onClick={() => onChange({ color: name, autoColor: false })}
        />)}
      </div>
      <small className="wo-note">{value.autoColor ? 'Cor automática pela função (IEC 60204-1).' : `Cor fixa: ${WIRE_COLOR_LABEL[value.color]}.`}</small>
    </div>

    <div className="wo-group">
      <div className="wo-label"><span>Condutor</span></div>
      <div className="wo-choices" role="radiogroup" aria-label="Condutor">
        {CONDUCTORS.map((conductor) => <button
          key={conductor.id}
          type="button"
          role="radio"
          aria-checked={value.flexibility === conductor.id}
          aria-label={`Condutor ${conductor.name}`}
          title={`${conductor.name} — ${conductor.hint}`}
          className={`wo-choice${value.flexibility === conductor.id ? ' is-on' : ''}`}
          onClick={() => onChange({ flexibility: conductor.id })}
        >
          <ConductorIcon flexible={conductor.id === 'flexible'} color={value.autoColor ? '#1f2937' : WIRE_COLOR_HEX[value.color]} size={40} />
          <strong>{conductor.name}</strong>
          <small>{conductor.hint}</small>
        </button>)}
      </div>
    </div>

    <div className="wo-group">
      <div className="wo-label"><span>Secção</span><em>{value.gauge}</em></div>
      <div className="wo-gauges" role="radiogroup" aria-label="Secção do cabo">
        {WIRE_GAUGES.map((gauge) => <button
          key={gauge}
          type="button"
          role="radio"
          aria-checked={value.gauge === gauge}
          aria-label={`Secção ${gauge}`}
          className={`wo-gauge${value.gauge === gauge ? ' is-on' : ''}`}
          onClick={() => onChange({ gauge })}
        >{gauge.replace('mm²', '')}<i>mm²</i></button>)}
      </div>
    </div>

    <div className="wo-group">
      <div className="wo-label"><span>Terminal das pontas</span><em>{selectedEnd?.label ?? ''}</em></div>
      <div className="wo-ends" role="radiogroup" aria-label="Terminal das pontas do cabo">
        {WIRE_END_OPTIONS.map((option) => <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value.endType === option.id}
          aria-label={option.label}
          title={option.hint}
          className={`wo-end${value.endType === option.id ? ' is-on' : ''}`}
          onClick={() => onChange({ endType: option.id as WireEndType })}
        >
          <WireEndIcon type={option.id} color={endColor} size={34} />
          <span>{option.label}</span>
        </button>)}
      </div>
      <small className="wo-note">{selectedEnd?.hint}</small>
    </div>
  </div>
}
