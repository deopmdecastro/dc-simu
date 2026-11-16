import { useRef } from 'react'
import type { ElectricalComponent } from '../types'
import { useSimStore } from '../store/useSimStore'
import { IconRotate } from '../ui/icons'
import { requestThermalResetTurn, type ThermalResetDirection } from '../three/thermalResetControl'

/** Alternativa de teclado/toque aos comandos do CAD, dentro do inspetor existente. */
export default function ThermalRelayControls({ component: c }: { component: ElectricalComponent }) {
  const held = useRef(false)
  const actuate = useSimStore((s) => s.actuateImported)
  const test = (pressed: boolean) => {
    if (held.current === pressed) return
    held.current = pressed
    actuate(c.id, pressed, 'test')
  }
  const reset = (direction: ThermalResetDirection) => { requestThermalResetTurn(c.id, direction); actuate(c.id, true, 'reset') }
  const canReset = !!c.state.tripped && !c.state.testPressed && !c.state.stopPressed && !c.locked
  return <div className="flex flex-col gap-2" data-thermal-controls>
    <span className="dc-field-label">Manobra · rearme manual (M)</span>
    <div className="flex flex-wrap gap-1">
      <button type="button" className="dc-btn" aria-label={`TEST ${c.ref} — manter premido`} aria-pressed={!!c.state.testPressed} disabled={c.locked}
        onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); test(true) }}
        onPointerUp={() => test(false)} onPointerCancel={() => test(false)} onLostPointerCapture={() => test(false)} onBlur={() => test(false)}
        onKeyDown={(event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); test(true) } }}
        onKeyUp={(event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); test(false) } }}>
        TEST · manter premido
      </button>
      <button type="button" className="dc-btn" aria-label={`RESET ${c.ref} — rodar à esquerda`} disabled={!canReset} onClick={() => reset('left')}><span aria-hidden style={{ display: 'inline-flex', transform: 'scaleX(-1)' }}><IconRotate size={12} /></span> RESET · esquerda</button>
      <button type="button" className="dc-btn" aria-label={`RESET ${c.ref} — rodar à direita`} disabled={!canReset} onClick={() => reset('right')}><IconRotate size={12} /> RESET · direita</button>
    </div>
    <small className="text-ink-400">No 3D, rode o RESET azul arrastando-o para a direita ou para a esquerda; os botões fazem o mesmo movimento. TEST mantém o disparo ao largar: liberte-o, rode RESET e prima START. O gesto não altera M/A nem ativa rearme automático.</small>
  </div>
}
