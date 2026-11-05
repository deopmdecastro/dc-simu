import { useEffect, useState } from 'react'
import { useSimStore } from '../store/useSimStore'
import type { ElectricalComponent } from '../types'

const label = 'dc-field-label'

export default function TerminalStripControls({ c }: { c: ElectricalComponent }) {
  const poleCount = Math.max(1, Math.min(48, Math.floor(Number(c.state.poleCount ?? 1)) || 1))
  const [draft, setDraft] = useState(String(poleCount))
  const [stripCount, setStripCount] = useState(String(Math.max(2, poleCount)))
  useEffect(() => setDraft(String(poleCount)), [poleCount, c.id])

  const applyPoles = () => {
    const n = Math.max(1, Math.min(48, Math.floor(Number(draft)) || 1))
    if (n === poleCount) return
    useSimStore.getState().setTerminalPoleCount(c.id, n)
  }

  return (
    <div className="dc-rail-length rounded-md border border-amber-200 bg-amber-50/60 p-2 space-y-2">
      <label className={label + ' !mb-0'}>Régua de bornes PTI 6 — N.º de bornes/pólos</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={48}
          step={1}
          className="dc-input w-20"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={applyPoles}
          onKeyDown={(e) => { if (e.key === 'Enter') applyPoles() }}
        />
        <span className="text-[10px] text-ink-500">{poleCount} pólo(s) · {poleCount * 2} bornes (1…{poleCount * 2})</span>
        <button className="dc-btn dc-btn-primary ml-auto" onClick={applyPoles}>Aplicar</button>
      </div>
      <div className="flex flex-wrap gap-1">
        {[2, 4, 6, 8, 12].map((n) => (
          <button
            key={n}
            className={`dc-btn !h-6 ${poleCount === n ? '!border-amber-500 !bg-amber-100' : ''}`}
            onClick={() => {
              setDraft(String(n))
              setTimeout(() => useSimStore.getState().setTerminalPoleCount(c.id, n), 0)
            }}
          >
            {n}
          </button>
        ))}
        <span className="text-[10px] text-ink-400 ml-1">1…48 (máx.)</span>
      </div>
      <small className="text-ink-500">
        Este <b>{c.ref}</b> passa a ter <b>{poleCount}× PTI 6</b> lado a lado: largura {(8.15 * poleCount).toFixed(2)} mm · footprint {76 * poleCount}×{c.h}px. Bornes numerados 1…{poleCount * 2} (1-2 = pólo 1). Largura e bornes atualizam no esquema e no 3D (réplicas lado a lado).
      </small>
      <div className="pt-1 border-t border-amber-200/60 space-y-1">
        <label className={label + ' !mb-0'}>Gerar régua X1…Xn (componentes soltos)</label>
        <div className="flex items-center gap-2">
          <input type="number" min={2} max={48} step={1} className="dc-input w-20" value={stripCount} onChange={(e) => setStripCount(e.target.value)} />
          <button
            className="dc-btn"
            onClick={() => {
              const n = Math.max(2, Math.min(48, Math.floor(Number(stripCount)) || 2))
              useSimStore.getState().createTerminalStrip(c.id, n)
            }}
          >
            ＋ Criar X1…Xn
          </button>
        </div>
        <small className="text-ink-400">Cria {stripCount} bornes soltos (X1, X2…) na mesma calha DIN — útil quando cada potencial precisa de TAG próprio no esquema. Use «Centrar e fixar» na calha TR para alinhar.</small>
      </div>
    </div>
  )
}
