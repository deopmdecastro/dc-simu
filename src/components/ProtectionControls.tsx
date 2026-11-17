import { useRef } from 'react'
import type { ElectricalComponent } from '../types'
import { useSimStore } from '../store/useSimStore'
import { importedComponentInfo } from '../electrical/importedComponents'
import Select from '../ui/Select'
import {
  EASY9_INA_OPTIONS,
  ECB_INA_OPTIONS,
  ECB_VOLTAGE_OPTIONS,
  FUSE_10X38_INA_OPTIONS,
  FUSE_8X31_INA_OPTIONS,
  FUSE_CLASS_OPTIONS,
  FUSE_GENERIC_INA_OPTIONS,
  GV2ME_RANGES,
  MCB_CURVE_OPTIONS,
  MCB_ICN_OPTIONS,
  MCB_INA_OPTIONS,
  PKZM_RANGES,
  RCD_INA_OPTIONS,
  RCD_SENS_MA_OPTIONS,
  RCD_TYPE_OPTIONS,
  SPW02_IMAX_OPTIONS,
  SPW02_UC_OPTIONS,
  SPW12_IMAX_OPTIONS,
  SPW12_UC_OPTIONS,
  STECK_INA_OPTIONS,
  easy9CatalogCode,
  formatAmpPt,
  hagerRcdCatalogCode,
  protectionControlKindOf,
  readProtectionRatings,
} from '../electrical/protectionSpecs'

function withCurrentValue(options: readonly number[], current: number): number[] {
  return options.includes(current) ? [...options] : [...options, current].sort((a, b) => a - b)
}

/**
 * Painel unificado do Inspetor para dispositivos de proteção:
 *  · Seletores normalizados de amperagem (In), curva, poder de corte, sensibilidade IΔn, classe de fusível e gama térmica;
 *  · Manobra física direta (Ligar/Desligar, Abrir/Fechar porta-fusível, Botão T de teste diferencial, Rearme e Substituição de fusível);
 *  · Sincronização imediata com a serigrafia 3D, o Esquema 2D e o motor de continuidade elétrica.
 */
export default function ProtectionControls({ component: c }: { component: ElectricalComponent }) {
  const kind = protectionControlKindOf(c.type)
  const testHeld = useRef(false)
  if (!kind) return null

  const r = readProtectionRatings(c.type, c.state)
  const locked = !!c.locked
  const setState = (patch: Record<string, unknown>) => useSimStore.getState().setComponentState(c.id, patch)
  const isImported = !!importedComponentInfo(c.type)

  const pressRcdTest = (down: boolean) => {
    if (testHeld.current === down || locked) return
    testHeld.current = down
    if (isImported) {
      useSimStore.getState().actuateImported(c.id, down, 'test')
    } else if (down) {
      if (r.closed && !r.tripped) setState({ testPressed: true, tripped: true, closed: false, tripReason: 'test' })
      else setState({ testPressed: true })
    } else {
      setState({ testPressed: false })
    }
  }

  // ------------------------------------------------------------------ Disjuntores modulares (MCB)
  if (kind === 'mcb') {
    const inOptions = withCurrentValue(
      c.type === 'breaker1p' || c.type === 'breaker2p' || c.type === 'breaker3p'
        ? EASY9_INA_OPTIONS
        : c.type === 'breakerSteckSdC25'
          ? STECK_INA_OPTIONS
          : MCB_INA_OPTIONS,
      r.inA,
    )
    const isOn = r.closed && !r.tripped
    const applyMcb = (patch: Partial<{ inA: number; curve: string; icn: string }>) => {
      const nextIn = patch.inA ?? r.inA
      const nextCurve = patch.curve ?? r.curve
      const nextIcn = patch.icn ?? r.icn
      const code =
        c.type === 'breaker1p' || c.type === 'breaker2p' || c.type === 'breaker3p'
          ? easy9CatalogCode(r.poles, nextCurve, nextIn)
          : c.type === 'breakerSteckSdC25'
            ? `SD ${nextCurve}${formatAmpPt(nextIn)} 1P`
            : undefined
      setState({ ...patch, icn: nextIcn, ...(code ? { code } : {}) })
    }
    return (
      <div className="flex flex-col gap-2" data-protection-controls="mcb">
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className={`dc-btn flex-1 ${isOn ? 'dc-btn-primary' : ''}`}
            disabled={locked}
            onClick={() => setState({ closed: true, tripped: false, tripReason: '' })}
          >
            I · Ligado
          </button>
          <button
            type="button"
            className={`dc-btn flex-1 ${!r.closed && !r.tripped ? 'dc-btn-primary' : ''}`}
            disabled={locked}
            onClick={() => setState({ closed: false, tripped: false, tripReason: '' })}
          >
            O · Desligado
          </button>
          <button
            type="button"
            className={`dc-btn ${r.tripped ? 'dc-btn-danger' : ''}`}
            disabled={locked}
            onClick={() => setState(r.tripped ? { tripped: false, closed: false, tripReason: '' } : { tripped: true, closed: false, tripReason: 'manual' })}
            title={r.tripped ? 'Rearmar alavanca do disjuntor' : 'Simular disparo termomagnético'}
          >
            {r.tripped ? 'Rearmar' : 'Disparar'}
          </button>
        </div>
        <label className="dc-inspector-state-row">
          <span className="dc-inspector-state-label">Corrente nominal (In)</span>
          <Select
            className="dc-input dc-inspector-state-input"
            aria-label="Corrente nominal (A)"
            value={String(r.inA)}
            disabled={locked}
            onChange={(e) => applyMcb({ inA: Number(e.target.value) })}
          >
            {inOptions.map((amp) => (
              <option key={amp} value={String(amp)}>{formatAmpPt(amp)} A</option>
            ))}
          </Select>
        </label>
        <label className="dc-inspector-state-row">
          <span className="dc-inspector-state-label">Curva de disparo</span>
          <Select
            className="dc-input dc-inspector-state-input"
            aria-label="Curva de disparo"
            value={r.curve}
            disabled={locked}
            onChange={(e) => applyMcb({ curve: e.target.value })}
          >
            {MCB_CURVE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>
        </label>
        <label className="dc-inspector-state-row">
          <span className="dc-inspector-state-label">Poder de corte (Icn)</span>
          <Select
            className="dc-input dc-inspector-state-input"
            aria-label="Poder de corte (Icn)"
            value={r.icn}
            disabled={locked}
            onChange={(e) => applyMcb({ icn: e.target.value })}
          >
            {MCB_ICN_OPTIONS.map((icn) => (
              <option key={icn} value={icn}>{icn}</option>
            ))}
          </Select>
        </label>
      </div>
    )
  }

  // ------------------------------------------------------------------ Diferencial (Hager CFC225P / DR)
  if (kind === 'rcd') {
    const inOptions = withCurrentValue(RCD_INA_OPTIONS, r.inA)
    const sensOptions = withCurrentValue(RCD_SENS_MA_OPTIONS, r.sensmA)
    const isOn = r.closed && !r.tripped
    const applyRcd = (patch: Partial<{ inA: number; sensmA: number; rcdType: string }>) => {
      const nextIn = patch.inA ?? r.inA
      const nextSens = patch.sensmA ?? r.sensmA
      const nextType = patch.rcdType ?? r.rcdType
      const code = c.type === 'residualBreakerHagerCfc225p' ? hagerRcdCatalogCode(nextIn, nextSens, nextType) : undefined
      setState({ ...patch, ...(code ? { code } : {}) })
    }
    const statusText = r.tripped
      ? r.tripReason === 'earth'
        ? `Disparado por fuga à terra (> ${r.sensmA} mA) — polos 1–2 e N abertos. Rearme antes de ligar.`
        : 'Disparado pelo botão de teste (T) — polos 1–2 e N seccionados. Prima Rearmar para voltar a O·OFF.'
      : isOn
        ? `Em serviço (I · ON) — continuidade ativa em fase e neutro. Prima T para testar o disparo diferencial.`
        : 'Seccionado (O · OFF) — polos 1–2 e N abertos. Ligue (I · ON) para ensaiar o disparo com o botão T.'
    return (
      <div className="flex flex-col gap-2" data-protection-controls="rcd">
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className={`dc-btn flex-1 ${isOn ? 'dc-btn-primary' : ''}`}
            disabled={locked || r.testPressed}
            onClick={() => setState({ closed: true, tripped: false, tripReason: '' })}
          >
            I · Ligar
          </button>
          <button
            type="button"
            className={`dc-btn flex-1 ${!r.closed && !r.tripped ? 'dc-btn-primary' : ''}`}
            disabled={locked || r.testPressed}
            onClick={() => setState({ closed: false, tripped: false, tripReason: '' })}
          >
            O · Desligar
          </button>
          <button
            type="button"
            className="dc-btn"
            style={{
              background: r.testPressed ? '#004b87' : '#0067b8',
              color: '#ffffff',
              borderColor: '#004b87',
              fontWeight: 700,
            }}
            aria-label={`Testar diferencial ${c.ref} (botão T)`}
            aria-pressed={r.testPressed}
            disabled={locked}
            onPointerDown={(event) => {
              if (event.button !== 0) return
              event.preventDefault()
              event.currentTarget.setPointerCapture(event.pointerId)
              pressRcdTest(true)
            }}
            onPointerUp={() => pressRcdTest(false)}
            onPointerCancel={() => pressRcdTest(false)}
            onLostPointerCapture={() => pressRcdTest(false)}
            onBlur={() => pressRcdTest(false)}
            onKeyDown={(event) => {
              if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); pressRcdTest(true) }
            }}
            onKeyUp={(event) => {
              if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); pressRcdTest(false) }
            }}
            title="Premir botão azul T de ensaio diferencial (também clicável diretamente no modelo 3D)"
          >
            T · Testar
          </button>
          {r.tripped && (
            <button
              type="button"
              className="dc-btn"
              disabled={locked || r.testPressed}
              aria-label={`Rearmar ${c.ref}`}
              onClick={() => (isImported ? useSimStore.getState().actuateImported(c.id, true, 'reset') : setState({ tripped: false, closed: false, tripReason: '' }))}
            >
              Rearmar
            </button>
          )}
        </div>
        <div
          className={`rounded-md border px-2 py-1.5 text-[10px] leading-4 ${
            r.tripped
              ? 'border-amber-300 bg-amber-50 text-amber-900'
              : isOn
                ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
                : 'border-slate-200 bg-slate-50 text-slate-700'
          }`}
        >
          {statusText}
        </div>
        <label className="dc-inspector-state-row">
          <span className="dc-inspector-state-label">Corrente nominal (In)</span>
          <Select
            className="dc-input dc-inspector-state-input"
            aria-label="Corrente nominal (A)"
            value={String(r.inA)}
            disabled={locked}
            onChange={(e) => applyRcd({ inA: Number(e.target.value) })}
          >
            {inOptions.map((amp) => (
              <option key={amp} value={String(amp)}>{formatAmpPt(amp)} A</option>
            ))}
          </Select>
        </label>
        <label className="dc-inspector-state-row">
          <span className="dc-inspector-state-label">Sensibilidade (IΔn)</span>
          <Select
            className="dc-input dc-inspector-state-input"
            aria-label="Sensibilidade diferencial (IΔn)"
            value={String(r.sensmA)}
            disabled={locked}
            onChange={(e) => applyRcd({ sensmA: Number(e.target.value) })}
          >
            {sensOptions.map((ma) => (
              <option key={ma} value={String(ma)}>
                {ma} mA ({(ma / 1000).toFixed(2).replace('.', ',')} A){ma <= 30 ? ' · pessoas' : ' · incêndio/seletivo'}
              </option>
            ))}
          </Select>
        </label>
        <label className="dc-inspector-state-row">
          <span className="dc-inspector-state-label">Tipo diferencial</span>
          <Select
            className="dc-input dc-inspector-state-input"
            aria-label="Tipo diferencial"
            value={r.rcdType}
            disabled={locked}
            onChange={(e) => applyRcd({ rcdType: e.target.value })}
          >
            {RCD_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>
        </label>
      </div>
    )
  }

  // ------------------------------------------------------------------ Porta-fusíveis e fusíveis
  if (kind === 'fuseHolder' || kind === 'fuse') {
    const rawOpts =
      c.type === 'fuseHolderSchneiderDf81n' ? FUSE_8X31_INA_OPTIONS
      : c.type === 'fuseHolderSchneiderDf101v' || c.type === 'fuseHolderSchneiderDf103nv' ? FUSE_10X38_INA_OPTIONS
      : FUSE_GENERIC_INA_OPTIONS
    const inOptions = withCurrentValue(rawOpts, r.inA)
    const hasNeutral = c.type === 'fuseHolderSchneiderDf81n' || c.type === 'fuseHolderSchneiderDf103nv'
    const statusNote =
      kind === 'fuseHolder' && !r.closed
        ? `Gaveta aberta — circuito seccionado${hasNeutral ? ' (fases e neutro N isolados)' : ''}; cartucho acessível no 3D.`
        : r.blown
          ? `Fusível fundido — polo(s) de fase aberto(s)${hasNeutral ? '; tubo de neutro N mantém continuidade com gaveta fechada' : ''}.`
          : `Em continuidade — cartucho ${formatAmpPt(r.inA)} A (${r.fuseClass}) íntegro${kind === 'fuseHolder' ? ' e gaveta fechada' : ''}.`
    return (
      <div className="flex flex-col gap-2" data-protection-controls={kind}>
        {kind === 'fuseHolder' && (
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              className={`dc-btn flex-1 ${r.closed ? 'dc-btn-primary' : ''}`}
              aria-label={`Fechar gaveta de ${c.ref}`}
              disabled={locked}
              onClick={() => setState({ closed: true })}
            >
              Fechar gaveta
            </button>
            <button
              type="button"
              className={`dc-btn flex-1 ${!r.closed ? 'dc-btn-primary' : ''}`}
              aria-label={`Abrir gaveta de ${c.ref}`}
              disabled={locked}
              onClick={() => setState({ closed: false })}
            >
              Abrir gaveta
            </button>
          </div>
        )}
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className={`dc-btn flex-1 ${!r.blown ? 'dc-btn-primary' : ''}`}
            disabled={locked}
            onClick={() => setState({ blown: false })}
          >
            {r.blown ? 'Substituir fusível' : 'Cartucho intacto'}
          </button>
          <button
            type="button"
            className={`dc-btn flex-1 ${r.blown ? 'dc-btn-danger' : ''}`}
            disabled={locked}
            onClick={() => setState({ blown: !r.blown })}
          >
            {r.blown ? 'Fundido' : 'Simular fusão'}
          </button>
        </div>
        <div
          className={`rounded-md border px-2 py-1.5 text-[10px] leading-4 ${
            r.blown
              ? 'border-red-200 bg-red-50 text-red-900'
              : !r.closed && kind === 'fuseHolder'
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
          }`}
        >
          {statusNote}
        </div>
        <label className="dc-inspector-state-row">
          <span className="dc-inspector-state-label">Calibre do fusível (In)</span>
          <Select
            className="dc-input dc-inspector-state-input"
            aria-label="Calibre do fusível (A)"
            value={String(r.inA)}
            disabled={locked}
            onChange={(e) => setState({ inA: Number(e.target.value) })}
          >
            {inOptions.map((amp) => (
              <option key={amp} value={String(amp)}>{formatAmpPt(amp)} A</option>
            ))}
          </Select>
        </label>
        <label className="dc-inspector-state-row">
          <span className="dc-inspector-state-label">Classe de serviço</span>
          <Select
            className="dc-input dc-inspector-state-input"
            aria-label="Classe do fusível"
            value={r.fuseClass}
            disabled={locked}
            onChange={(e) => setState({ fuseClass: e.target.value })}
          >
            {FUSE_CLASS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>
        </label>
      </div>
    )
  }

  // ------------------------------------------------------------------ Disjuntor-motor (GV2ME / PKZM)
  if (kind === 'motorBreaker') {
    const ranges = c.type === 'motorBreakerSchneiderGv2me' ? GV2ME_RANGES : PKZM_RANGES
    const activeRange = ranges.find((item) => item.rangeA === r.rangeA) ?? ranges[5]
    const isOn = r.closed && !r.tripped
    // Gerar 5 degraus de regulação dentro da faixa térmica escolhida.
    const dialSteps = Array.from({ length: 5 }, (_, idx) => {
      const val = activeRange.minA + ((activeRange.maxA - activeRange.minA) * idx) / 4
      return Math.round(val * 100) / 100
    })
    const stepList = withCurrentValue(dialSteps, r.inA)
    return (
      <div className="flex flex-col gap-2" data-protection-controls="motorBreaker">
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className={`dc-btn flex-1 ${isOn ? 'dc-btn-primary' : ''}`}
            disabled={locked}
            onClick={() => setState({ closed: true, tripped: false })}
          >
            I · Marcha
          </button>
          <button
            type="button"
            className={`dc-btn flex-1 ${!r.closed && !r.tripped ? 'dc-btn-primary' : ''}`}
            disabled={locked}
            onClick={() => setState({ closed: false, tripped: false })}
          >
            O · Paragem
          </button>
          <button
            type="button"
            className={`dc-btn ${r.tripped ? 'dc-btn-danger' : ''}`}
            disabled={locked}
            onClick={() => setState(r.tripped ? { tripped: false, closed: false } : { tripped: true, closed: false })}
          >
            {r.tripped ? 'Rearmar' : 'Disparar'}
          </button>
        </div>
        <label className="dc-inspector-state-row">
          <span className="dc-inspector-state-label">Faixa térmica (calibre)</span>
          <Select
            className="dc-input dc-inspector-state-input"
            aria-label="Faixa térmica do disjuntor-motor"
            value={activeRange.rangeA}
            disabled={locked}
            onChange={(e) => {
              const next = ranges.find((item) => item.rangeA === e.target.value)
              if (!next) return
              setState({
                rangeA: next.rangeA,
                inA: next.defaultInA,
                magnetic: next.magneticA,
                ...(c.type !== 'motorBreaker' ? { code: next.code } : {}),
              })
            }}
          >
            {ranges.map((item) => (
              <option key={item.code} value={item.rangeA}>{item.rangeA} ({item.code})</option>
            ))}
          </Select>
        </label>
        <label className="dc-inspector-state-row">
          <span className="dc-inspector-state-label">Regulação Ir (A)</span>
          <Select
            className="dc-input dc-inspector-state-input"
            aria-label="Regulação térmica Ir (A)"
            value={String(r.inA)}
            disabled={locked}
            onChange={(e) => setState({ inA: Number(e.target.value) })}
          >
            {stepList.map((amp) => (
              <option key={amp} value={String(amp)}>{formatAmpPt(amp)} A</option>
            ))}
          </Select>
        </label>
      </div>
    )
  }

  // ------------------------------------------------------------------ Disjuntor eletrónico Phoenix EC-E1
  if (kind === 'ecb') {
    const inOptions = withCurrentValue(ECB_INA_OPTIONS, r.inA)
    const isOn = r.closed && !r.tripped
    return (
      <div className="flex flex-col gap-2" data-protection-controls="ecb">
        <div className="flex flex-wrap gap-1">
          <button type="button" className={`dc-btn flex-1 ${isOn ? 'dc-btn-primary' : ''}`} disabled={locked} onClick={() => setState({ closed: true, tripped: false })}>Armado</button>
          <button type="button" className={`dc-btn flex-1 ${!r.closed && !r.tripped ? 'dc-btn-primary' : ''}`} disabled={locked} onClick={() => setState({ closed: false, tripped: false })}>Aberto</button>
          <button type="button" className={`dc-btn ${r.tripped ? 'dc-btn-danger' : ''}`} disabled={locked} onClick={() => setState(r.tripped ? { tripped: false, closed: true } : { tripped: true, closed: false })}>{r.tripped ? 'Reset' : 'Disparar'}</button>
        </div>
        <label className="dc-inspector-state-row">
          <span className="dc-inspector-state-label">Corrente nominal (In)</span>
          <Select
            className="dc-input dc-inspector-state-input"
            aria-label="Corrente nominal (A)"
            value={String(r.inA)}
            disabled={locked}
            onChange={(e) => setState({ inA: Number(e.target.value), code: `EC-E1 ${formatAmpPt(Number(e.target.value))}A` })}
          >
            {inOptions.map((amp) => (
              <option key={amp} value={String(amp)}>{formatAmpPt(amp)} A</option>
            ))}
          </Select>
        </label>
        <label className="dc-inspector-state-row">
          <span className="dc-inspector-state-label">Tensão nominal</span>
          <Select
            className="dc-input dc-inspector-state-input"
            aria-label="Tensão nominal CC"
            value={r.ueDc}
            disabled={locked}
            onChange={(e) => setState({ ueDc: e.target.value })}
          >
            {ECB_VOLTAGE_OPTIONS.map((ue) => (
              <option key={ue} value={ue}>{ue}</option>
            ))}
          </Select>
        </label>
      </div>
    )
  }

  // ------------------------------------------------------------------ DPS (WEG SPW02 / SPW12 / genérico)
  const isPv = c.type === 'surgeProtectorWegSpw12'
  const isWeg = isPv || c.type === 'surgeProtectorWegSpw02'
  const ucOptions = withCurrentValue(isPv ? SPW12_UC_OPTIONS : SPW02_UC_OPTIONS, r.ucV)
  const imaxOptions = withCurrentValue(isPv ? SPW12_IMAX_OPTIONS : SPW02_IMAX_OPTIONS, r.imaxKa)
  return (
    <div className="flex flex-col gap-2" data-protection-controls="spd">
      <div className="flex flex-wrap gap-1">
        <button type="button" className={`dc-btn flex-1 ${!r.failed ? 'dc-btn-primary' : ''}`} disabled={locked} onClick={() => setState({ failed: false })}>
          {r.failed ? 'Substituir cartucho' : 'OK (verde)'}
        </button>
        <button type="button" className={`dc-btn flex-1 ${r.failed ? 'dc-btn-danger' : ''}`} disabled={locked} onClick={() => setState({ failed: !r.failed })}>
          {r.failed ? 'Fim de vida' : 'Simular avaria'}
        </button>
      </div>
      {isWeg ? (
        <>
          <label className="dc-inspector-state-row">
            <span className="dc-inspector-state-label">{isPv ? 'Tensão máx. (Ucpv)' : 'Tensão máx. (Uc)'}</span>
            <Select
              className="dc-input dc-inspector-state-input"
              aria-label="Tensão máxima de serviço (Uc)"
              value={String(r.ucV)}
              disabled={locked}
              onChange={(e) => {
                const ucV = Number(e.target.value)
                setState({ ucV, code: isPv ? `SPW12-${ucV}-${r.imaxKa}` : `SPW02-${ucV}-${r.imaxKa}` })
              }}
            >
              {ucOptions.map((v) => (
                <option key={v} value={String(v)}>{v} {isPv ? 'V DC' : 'V~'}</option>
              ))}
            </Select>
          </label>
          <label className="dc-inspector-state-row">
            <span className="dc-inspector-state-label">Descarga máx. (Imax)</span>
            <Select
              className="dc-input dc-inspector-state-input"
              aria-label="Corrente máxima de descarga (Imax)"
              value={String(r.imaxKa)}
              disabled={locked}
              onChange={(e) => {
                const imaxKa = Number(e.target.value)
                setState({ imaxKa, code: isPv ? `SPW12-${r.ucV}-${imaxKa}` : `SPW02-${r.ucV}-${imaxKa}` })
              }}
            >
              {imaxOptions.map((ka) => (
                <option key={ka} value={String(ka)}>{ka} kA (8/20 µs)</option>
              ))}
            </Select>
          </label>
        </>
      ) : (
        <label className="dc-inspector-state-row">
          <span className="dc-inspector-state-label">Nível de proteção (Up)</span>
          <Select
            className="dc-input dc-inspector-state-input"
            value={String(r.upKv)}
            disabled={locked}
            onChange={(e) => setState({ upKv: Number(e.target.value) })}
          >
            {[1.0, 1.2, 1.5, 1.8, 2.5].map((kv) => (
              <option key={kv} value={String(kv)}>{formatAmpPt(kv)} kV</option>
            ))}
          </Select>
        </label>
      )}
    </div>
  )
}
