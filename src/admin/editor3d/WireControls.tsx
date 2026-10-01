import { ConductorIcon, WireEndIcon, WIRE_END_OPTIONS } from '../../schematic/wireEnds'
import type { WireColor, WireEndType, WireFlexibility } from '../../types'
import { WIRE_COLOR_HEX, WIRE_COLOR_LABEL } from './wireStyle'

/** Paleta de cores de cabo (as mesmas 13 do simulador). */
export function ColorSwatches({ value, onChange, disabled }: { value: WireColor; onChange: (color: WireColor) => void; disabled?: boolean }) {
  return <div className="ce-wsws" role="radiogroup" aria-label="Cor do cabo">
    {(Object.keys(WIRE_COLOR_HEX) as WireColor[]).map((name) => <button key={name} type="button" role="radio" aria-checked={value === name} disabled={disabled}
      title={WIRE_COLOR_LABEL[name]} aria-label={WIRE_COLOR_LABEL[name]} className={`ce-wsw${value === name ? ' is-on' : ''}`} style={{ background: WIRE_COLOR_HEX[name] }} onClick={() => onChange(name)} />)}
  </div>
}

/** Terminações (ponteira, olhal, forquilha…) com pré-visualização. */
export function EndChooser({ value, onChange, color, label }: { value: WireEndType; onChange: (type: WireEndType) => void; color: string; label: string }) {
  return <div className="ce-endgrid" role="radiogroup" aria-label={label}>
    {WIRE_END_OPTIONS.map((option) => <button key={option.id} type="button" role="radio" aria-checked={value === option.id} className={`ce-endopt${value === option.id ? ' is-on' : ''}`} title={option.hint} onClick={() => onChange(option.id)}>
      <WireEndIcon type={option.id} color={color} size={38} /><span>{option.label}</span>
    </button>)}
  </div>
}

export function ConductorChooser({ value, onChange, color }: { value: WireFlexibility; onChange: (value: WireFlexibility) => void; color: string }) {
  return <div className="ce-conductor" role="radiogroup" aria-label="Condutor">
    {([['flexible', 'Flexível', 'multifilar · curvas suaves'], ['rigid', 'Rígido', 'fio sólido · segmentos retos']] as const).map(([id, name, hint]) =>
      <button key={id} type="button" role="radio" aria-checked={value === id} className={`ce-endopt${value === id ? ' is-on' : ''}`} onClick={() => onChange(id)}>
        <ConductorIcon flexible={id === 'flexible'} color={color} size={44} /><span>{name}</span><small>{hint}</small>
      </button>)}
  </div>
}
