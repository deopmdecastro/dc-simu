import { useState, useEffect, useRef } from 'react'
import type { GrafcetTransition, GrafcetStep } from './engine'

interface TransitionDialogProps {
  open: boolean
  transition: GrafcetTransition | null
  transitionIndex?: number
  availableSteps?: GrafcetStep[]
  availableVariables?: string[]
  onSave: (patch: Partial<GrafcetTransition>) => void
  onClose: () => void
  onHelp?: () => void
}

export default function TransitionDialog({
  open,
  transition,
  transitionIndex = 0,
  availableSteps = [],
  availableVariables = [],
  onSave,
  onClose,
  onHelp,
}: TransitionDialogProps) {
  const [name, setName] = useState('')
  const [condition, setCondition] = useState('1')
  const [description, setDescription] = useState('')
  const [displayDescription, setDisplayDescription] = useState(false)
  const [targetInfo, setTargetInfo] = useState('')
  const [showVarPicker, setShowVarPicker] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (transition) {
      setName(transition.name || `T${transitionIndex + 1}`)
      setCondition(transition.condition || '1')
      setDescription(transition.description || transition.comment || '')
      setDisplayDescription(!!transition.displayDescription)
      setTargetInfo(transition.targetInfo || '')
    }
  }, [transition, transitionIndex, open])

  if (!open || !transition) return null

  const insertToken = (token: string) => {
    const input = inputRef.current
    if (!input) {
      setCondition((c) => (c === '1' ? token : `${c} ${token}`))
      return
    }
    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? input.value.length
    const text = input.value
    const next = text.slice(0, start) + token + text.slice(end)
    setCondition(next)
    setTimeout(() => {
      input.focus()
      input.setSelectionRange(start + token.length, start + token.length)
    }, 10)
  }

  const handleOk = () => {
    onSave({
      name: name.trim() || `T${transitionIndex + 1}`,
      condition: condition.trim() || '1',
      description: description.trim(),
      comment: description.trim(),
      displayDescription,
      targetInfo: targetInfo.trim(),
    })
    onClose()
  }

  const displayText = displayDescription ? (description || condition) : (condition || '1')

  const renderPreview = () => {
    return (
      <svg width="100%" height="150" viewBox="0 0 200 150" className="grafcet-preview-svg">
        <g transform="translate(80, 75)">
          {/* Vertical flow line */}
          <line x1="0" y1="-50" x2="0" y2="50" stroke="#1e293b" strokeWidth="2.5" />

          {/* Horizontal transition cross tick */}
          <line x1="-16" y1="0" x2="16" y2="0" stroke="#1e293b" strokeWidth="3.5" />

          {/* Receptivity condition text to the right */}
          <text x="24" y="5" fontSize="13" fontWeight="600" fill="#0f172a">
            {displayText}
          </text>

          {/* Jump / Target connection info below */}
          {targetInfo && (
            <g transform="translate(0, 48)">
              <text x="0" y="0" textAnchor="middle" fontSize="13" fontWeight="700" fill="#2563eb">
                {targetInfo}
              </text>
            </g>
          )}
        </g>
      </svg>
    )
  }

  const commonVars = [
    'B_Start', 'B_Stop_NF', 'In_Man', 'B_Reset', 'Int_Emerg_NF', 'Emerg_NF',
    'fc_a0', 'fc_a1', 'fc_b0', 'fc_b1', 'b0', 'b1', 'a0', 'a1', 'S_Rolamento',
    'I1', 'I2', 'I3', 'I4', 'G0X3', 'G0X5', 'G1X75', 'G1X11', 'G2X135',
  ]
  const allVars = [...new Set([...availableVariables, ...commonVars])]

  return (
    <div className="grafcet-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="grafcet-fluidsim-dialog" role="dialog" aria-modal="true" aria-labelledby="trans-dialog-title">
        <header className="grafcet-fluidsim-titlebar">
          <span id="trans-dialog-title">Transition</span>
          <button className="grafcet-fluidsim-close" onClick={onClose} aria-label="Fechar">✕</button>
        </header>

        <div className="grafcet-fluidsim-body">
          {/* Coluna da esquerda: Nome, Condição, Descrição, Destino de salto */}
          <div className="grafcet-fluidsim-col-left">
            <div className="grafcet-fluidsim-field-group">
              <label htmlFor="trans-name-input"><strong>Name</strong></label>
              <input
                id="trans-name-input"
                className="dc-input grafcet-fluidsim-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: T1"
              />
            </div>

            <fieldset className="grafcet-fluidsim-group">
              <legend>Condition</legend>

              {/* Botões rápidos FluidSim */}
              <div className="grafcet-trans-toolbar">
                <button
                  type="button"
                  className="grafcet-trans-tool-btn"
                  onClick={() => insertToken('/')}
                  title="NOT (barra superior / negação)"
                >
                  <span style={{ textDecoration: 'overline' }}>NOT</span>
                </button>
                <button
                  type="button"
                  className="grafcet-trans-tool-btn"
                  onClick={() => insertToken('^')}
                  title="Flanco ascendente"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="grafcet-trans-tool-btn"
                  onClick={() => insertToken('\\')}
                  title="Flanco descendente"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="grafcet-trans-tool-btn"
                  onClick={() => insertToken(' * ')}
                  title="AND (multiplicação booleana)"
                >
                  AND
                </button>
                <button
                  type="button"
                  className="grafcet-trans-tool-btn"
                  onClick={() => insertToken(' + ')}
                  title="OR (soma booleana)"
                >
                  OR
                </button>
                <div className="grafcet-var-picker-anchor" style={{ position: 'relative', display: 'inline-block' }}>
                  <button
                    type="button"
                    className="grafcet-trans-tool-btn"
                    onClick={() => setShowVarPicker((v) => !v)}
                    title="Inserir variável do sistema"
                  >
                    Variable...
                  </button>
                  {showVarPicker && (
                    <div className="grafcet-var-picker-popover">
                      <div className="grafcet-var-picker-head">
                        <span>Variáveis e Entradas</span>
                        <button type="button" onClick={() => setShowVarPicker(false)}>✕</button>
                      </div>
                      <div className="grafcet-var-picker-list">
                        {allVars.map((v) => (
                          <button
                            key={v}
                            type="button"
                            className="grafcet-var-picker-item"
                            onClick={() => {
                              insertToken(v)
                              setShowVarPicker(false)
                            }}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="grafcet-trans-tool-btn"
                  onClick={() => insertToken('1s/X')}
                  title="Temporização padrão IEC (t1/X/t2)"
                >
                  t₁/X/t₂
                </button>
              </div>

              <div className="grafcet-fluidsim-field-group" style={{ marginTop: '8px' }}>
                <input
                  ref={inputRef}
                  className="dc-input grafcet-fluidsim-input"
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  placeholder="Ex: 1s/X45, b0 * /S_Rolamento, B_Start * B_Stop_NF"
                  autoFocus
                />
              </div>

              <fieldset className="grafcet-fluidsim-subgroup" style={{ marginTop: '10px' }}>
                <legend>Description</legend>
                <input
                  className="dc-input grafcet-fluidsim-input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descrição opcional"
                />
                <label className="grafcet-fluidsim-checkbox-label" style={{ marginTop: '6px' }}>
                  <input
                    type="checkbox"
                    checked={displayDescription}
                    onChange={(e) => setDisplayDescription(e.target.checked)}
                  />
                  <span>Display description instead of formula</span>
                </label>
              </fieldset>
            </fieldset>

            <fieldset className="grafcet-fluidsim-group">
              <legend>Connection ID / target information</legend>
              <div className="grafcet-input-with-datalist">
                <input
                  className="dc-input grafcet-fluidsim-input"
                  list="grafcet-target-steps-list"
                  value={targetInfo}
                  onChange={(e) => setTargetInfo(e.target.value)}
                  placeholder="Ex: 1, 11, 51 (salto para etapa)"
                />
                <datalist id="grafcet-target-steps-list">
                  {availableSteps.map((s, idx) => (
                    <option key={s.id} value={s.name || String(idx)}>
                      Etapa {s.name || idx} {s.description ? `(${s.description})` : ''}
                    </option>
                  ))}
                </datalist>
              </div>
            </fieldset>
          </div>

          {/* Coluna da direita: Preview */}
          <div className="grafcet-fluidsim-col-right">
            <fieldset className="grafcet-fluidsim-group grafcet-preview-group" style={{ height: '100%' }}>
              <legend>Preview</legend>
              <div className="grafcet-fluidsim-preview-box" style={{ minHeight: '220px' }}>
                {renderPreview()}
              </div>
            </fieldset>
          </div>
        </div>

        <footer className="grafcet-fluidsim-actions">
          <button className="grafcet-fluidsim-btn primary" onClick={handleOk}>OK</button>
          <button className="grafcet-fluidsim-btn" onClick={onClose}>Cancel</button>
          <button className="grafcet-fluidsim-btn" onClick={onHelp ?? onClose}>Help</button>
        </footer>
      </div>
    </div>
  )
}
