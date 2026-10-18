import { useState, useEffect } from 'react'
import type { GrafcetAction, GrafcetActionKind, GrafcetActionAllocation } from './engine'

interface ActionDialogProps {
  open: boolean
  action: GrafcetAction | null
  availableVariables?: string[]
  onSave: (patch: Partial<GrafcetAction>) => void
  onClose: () => void
  onHelp?: () => void
}

type AssignationType = 'simple' | 'conditional'

export default function ActionDialog({ open, action, availableVariables = [], onSave, onClose, onHelp }: ActionDialogProps) {
  const [assignation, setAssignation] = useState<AssignationType>('simple')
  const [allocation, setAllocation] = useState<GrafcetActionAllocation>('continuous')
  const [kind, setKind] = useState<GrafcetActionKind>('N')
  const [variable, setVariable] = useState('')
  const [condition, setCondition] = useState('1')
  const [description, setDescription] = useState('')
  const [displayDescription, setDisplayDescription] = useState(true)
  const [timeMs, setTimeMs] = useState<number>(2000)

  useEffect(() => {
    if (action) {
      setVariable(action.variable || action.address || 'Q1')
      setDescription(action.description || action.address || '')
      setDisplayDescription(action.displayDescription ?? (!!action.description && action.description !== action.address))
      setCondition(action.condition || '1')
      setTimeMs(action.timeMs || 2000)

      // Infer assignation & allocation
      const actKind = action.kind || 'N'
      setKind(actKind)
      if (action.type) {
        setAssignation(action.type)
      } else if (action.condition && action.condition !== '1') {
        setAssignation('conditional')
      } else {
        setAssignation('simple')
      }

      if (action.allocation) {
        setAllocation(action.allocation)
      } else if (actKind === 'A') {
        setAllocation('activation')
      } else if (actKind === 'DA') {
        setAllocation('deactivation')
      } else if (actKind === 'EV') {
        setAllocation('event')
      } else if (actKind === 'C') {
        setAllocation('compulsory')
      } else {
        setAllocation('continuous')
      }
    }
  }, [action, open])

  // Atalhos de teclado no modal (Enter para salvar, Escape para fechar)
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'Enter' && !e.shiftKey) {
        const target = e.target as HTMLElement | null
        if (target?.tagName === 'TEXTAREA') return
        e.preventDefault()
        handleOk()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, variable, description, displayDescription, condition, kind, allocation, assignation, timeMs])

  if (!open || !action) return null

  const handleOk = () => {
    let effectiveKind: GrafcetActionKind = kind
    if (allocation === 'activation') effectiveKind = 'A'
    else if (allocation === 'deactivation') effectiveKind = 'DA'
    else if (allocation === 'event') effectiveKind = 'EV'
    else if (allocation === 'compulsory') effectiveKind = 'C'

    onSave({
      address: variable.trim() || 'Q1',
      variable: variable.trim() || 'Q1',
      description: description.trim(),
      displayDescription,
      condition: assignation === 'conditional' ? (condition.trim() || '1') : '1',
      kind: effectiveKind,
      type: assignation,
      allocation,
      timeMs: effectiveKind === 'D' || effectiveKind === 'L' ? timeMs : undefined,
    })
    onClose()
  }

  // Label to show in the action preview
  const displayText = displayDescription
    ? (description || variable || 'Ação')
    : (assignation === 'conditional' && condition !== '1'
        ? `${variable} [${condition}]`
        : variable || 'Ação')

  // Render SVG Preview
  const renderPreview = () => {
    const isCompulsory = allocation === 'compulsory' || kind === 'C'
    const isActivation = allocation === 'activation' || kind === 'A'
    const isDeactivation = allocation === 'deactivation' || kind === 'DA'
    const isEvent = allocation === 'event' || kind === 'EV'
    const isConditional = assignation === 'conditional'

    const hasQualifier = kind === 'S' || kind === 'R' || kind === 'D' || kind === 'L' || kind === 'N'
    const qualifierText = kind === 'D' ? `D ${timeMs / 1000}s` : kind === 'L' ? `L ${timeMs / 1000}s` : kind === 'N' ? '' : kind

    const boxW = 160
    const boxH = 40
    const startX = 20
    const startY = isConditional ? 35 : 20

    return (
      <svg width="100%" height="100" viewBox="0 0 200 100" className="grafcet-preview-svg">
        {/* Conditional notch/flag on top */}
        {isConditional && (
          <g>
            <path d={`M ${startX + 18} ${startY} V ${startY - 14} H ${startX + 75}`} fill="none" stroke="#1e293b" strokeWidth="1.6" />
            <text x={startX + 22} y={startY - 18} fontSize="10" fontWeight="700" fill="#2563eb">
              {condition || 'condição'}
            </text>
          </g>
        )}

        {/* Main action rectangle */}
        <rect
          x={startX}
          y={startY}
          width={boxW}
          height={boxH}
          fill="white"
          stroke="#1e293b"
          strokeWidth="1.8"
        />

        {/* Compulsory command double line */}
        {isCompulsory && (
          <rect
            x={startX + 3}
            y={startY + 3}
            width={boxW - 6}
            height={boxH - 6}
            fill="none"
            stroke="#1e293b"
            strokeWidth="1.2"
          />
        )}

        {/* Activation arrow UP on left edge */}
        {isActivation && (
          <g stroke="#1e293b" strokeWidth="1.8" fill="none">
            <line x1={startX + 10} y1={startY + 28} x2={startX + 10} y2={startY + 10} />
            <path d={`M ${startX + 6} ${startY + 15} L ${startX + 10} ${startY + 9} L ${startX + 14} ${startY + 15}`} />
          </g>
        )}

        {/* Deactivation arrow DOWN on left edge */}
        {isDeactivation && (
          <g stroke="#1e293b" strokeWidth="1.8" fill="none">
            <line x1={startX + 10} y1={startY + 10} x2={startX + 10} y2={startY + 28} />
            <path d={`M ${startX + 6} ${startY + 23} L ${startX + 10} ${startY + 29} L ${startX + 14} ${startY + 23}`} />
          </g>
        )}

        {/* Event arrow notch */}
        {isEvent && (
          <g stroke="#1e293b" strokeWidth="1.6" fill="none">
            <path d={`M ${startX + 6} ${startY + 24} L ${startX + 12} ${startY + 12} L ${startX + 16} ${startY + 12}`} />
          </g>
        )}

        {/* IEC Qualifier section (S, R, D, L, N) */}
        {hasQualifier && (
          <g>
            <line x1={startX + 34} y1={startY} x2={startX + 34} y2={startY + boxH} stroke="#1e293b" strokeWidth="1.4" />
            {qualifierText && (
              <text x={startX + 17} y={startY + 24} textAnchor="middle" fontSize="11" fontWeight="700" fill="#2563eb">
                {qualifierText}
              </text>
            )}
          </g>
        )}

        {/* Text inside box */}
        <text
          x={hasQualifier ? startX + 42 : isActivation || isDeactivation || isEvent ? startX + 26 : startX + 16}
          y={startY + 24}
          fontSize="12.5"
          fontWeight="600"
          fill="#0f172a"
        >
          {displayText}
        </text>
      </svg>
    )
  }

  // Suggestion list of variables / outputs
  const commonVars = [
    'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8',
    'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8',
    'KM1', 'KM2', 'KM3',
    'L_Verde', 'L_Amarela', 'L_Vermelha', 'Buzzer',
    'Y0_A+', 'Y1_A-', 'Y2_B+', 'Y3_B-', 'Y4_C+', 'C-', 'Y5_D+', 'Y6_D-',
    'Y7_E+_Vacuo_On', 'Y8_E-_Vacuo_Off',
  ]
  const allVars = [...new Set([...availableVariables, ...commonVars])]

  const quickVarChips = ['Q1', 'Q2', 'Q3', 'M1', 'KM1', 'L_Verde', 'L_Amarela', 'Y0_A+', 'Y1_A-']
  const quickCondChips = ['1HZ', '0.5HZ', '2HZ', 'I1', 'I2', 'b0', 'b1', 'S_Rolamento']

  return (
    <div className="grafcet-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="grafcet-fluidsim-dialog" role="dialog" aria-modal="true" aria-labelledby="action-dialog-title">
        <header className="grafcet-fluidsim-titlebar">
          <span id="action-dialog-title">Action Properties (IEC 60848 / FluidSIM)</span>
          <button className="grafcet-fluidsim-close" onClick={onClose} aria-label="Fechar">✕</button>
        </header>

        <div className="grafcet-fluidsim-body">
          {/* Coluna da esquerda: Tipo (Assignation & Allocation) */}
          <div className="grafcet-fluidsim-col-left">
            <fieldset className="grafcet-fluidsim-group">
              <legend>Type</legend>

              <fieldset className="grafcet-fluidsim-subgroup">
                <legend>Assignation</legend>
                <label className="grafcet-type-radio-label">
                  <svg width="24" height="16" viewBox="0 0 24 16" className="grafcet-dialog-radio-icon">
                    <rect x="1" y="2" width="22" height="12" fill="white" stroke="#263d59" strokeWidth="1.5" />
                  </svg>
                  <input
                    type="radio"
                    name="assignation"
                    checked={assignation === 'simple'}
                    onChange={() => setAssignation('simple')}
                  />
                  <span>Simple action</span>
                </label>
                <label className="grafcet-type-radio-label">
                  <svg width="24" height="18" viewBox="0 0 24 18" className="grafcet-dialog-radio-icon">
                    <line x1="4" y1="4" x2="4" y2="1" stroke="#263d59" strokeWidth="1.2" />
                    <rect x="1" y="4" width="22" height="12" fill="white" stroke="#263d59" strokeWidth="1.5" />
                  </svg>
                  <input
                    type="radio"
                    name="assignation"
                    checked={assignation === 'conditional'}
                    onChange={() => setAssignation('conditional')}
                  />
                  <span>Conditional action</span>
                </label>
              </fieldset>

              <fieldset className="grafcet-fluidsim-subgroup">
                <legend>Allocation</legend>
                <label className="grafcet-type-radio-label">
                  <svg width="24" height="16" viewBox="0 0 24 16" className="grafcet-dialog-radio-icon">
                    <rect x="1" y="1" width="22" height="14" fill="white" stroke="#263d59" strokeWidth="1.2" />
                    <line x1="5" y1="12" x2="5" y2="3" stroke="#263d59" strokeWidth="1.4" />
                    <path d="M 3 6 L 5 3 L 7 6" stroke="#263d59" strokeWidth="1.4" fill="none" />
                  </svg>
                  <input
                    type="radio"
                    name="allocation"
                    checked={allocation === 'activation'}
                    onChange={() => { setAllocation('activation'); setKind('A') }}
                  />
                  <span>Action on activation (↑)</span>
                </label>

                <label className="grafcet-type-radio-label">
                  <svg width="24" height="16" viewBox="0 0 24 16" className="grafcet-dialog-radio-icon">
                    <rect x="1" y="1" width="22" height="14" fill="white" stroke="#263d59" strokeWidth="1.2" />
                    <line x1="5" y1="3" x2="5" y2="12" stroke="#263d59" strokeWidth="1.4" />
                    <path d="M 3 9 L 5 12 L 7 9" stroke="#263d59" strokeWidth="1.4" fill="none" />
                  </svg>
                  <input
                    type="radio"
                    name="allocation"
                    checked={allocation === 'deactivation'}
                    onChange={() => { setAllocation('deactivation'); setKind('DA') }}
                  />
                  <span>Action on deactivation (↓)</span>
                </label>

                <label className="grafcet-type-radio-label">
                  <svg width="24" height="16" viewBox="0 0 24 16" className="grafcet-dialog-radio-icon">
                    <rect x="1" y="1" width="22" height="14" fill="white" stroke="#263d59" strokeWidth="1.2" />
                    <path d="M 3 11 L 6 5 L 9 5" stroke="#263d59" strokeWidth="1.3" fill="none" />
                  </svg>
                  <input
                    type="radio"
                    name="allocation"
                    checked={allocation === 'event'}
                    onChange={() => { setAllocation('event'); setKind('EV') }}
                  />
                  <span>Action on event</span>
                </label>

                <label className="grafcet-type-radio-label">
                  <svg width="24" height="16" viewBox="0 0 24 16" className="grafcet-dialog-radio-icon">
                    <rect x="1" y="1" width="22" height="14" fill="white" stroke="#263d59" strokeWidth="1.2" />
                    <rect x="3" y="3" width="18" height="10" fill="none" stroke="#263d59" strokeWidth="1" />
                  </svg>
                  <input
                    type="radio"
                    name="allocation"
                    checked={allocation === 'compulsory'}
                    onChange={() => { setAllocation('compulsory'); setKind('C') }}
                  />
                  <span>Compulsory command</span>
                </label>
              </fieldset>

              <fieldset className="grafcet-fluidsim-subgroup">
                <legend>IEC Qualifier (opcional)</legend>
                <div className="grafcet-qualifier-row">
                  {(['N', 'S', 'R', 'D', 'L'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      className={`grafcet-qualifier-chip ${kind === k ? 'is-active' : ''}`}
                      onClick={() => { setKind(k); setAllocation('continuous') }}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </fieldset>
            </fieldset>
          </div>

          {/* Coluna da direita: Ação, Descrição, Preview */}
          <div className="grafcet-fluidsim-col-right">
            <fieldset className="grafcet-fluidsim-group">
              <legend>Action</legend>
              <div className="grafcet-fluidsim-field-group">
                <label htmlFor="action-var-input"><strong>Variable / output</strong></label>
                <div className="grafcet-input-with-datalist">
                  <input
                    id="action-var-input"
                    className="dc-input grafcet-fluidsim-input"
                    list="grafcet-action-variables-list"
                    value={variable}
                    onChange={(e) => setVariable(e.target.value.toUpperCase())}
                    placeholder="Q1, Y1_A-, L_Verde"
                    autoFocus
                  />
                  <datalist id="grafcet-action-variables-list">
                    {allVars.map((v) => (
                      <option key={v} value={v} />
                    ))}
                  </datalist>
                </div>

                {/* Chips rápidos de variáveis comuns */}
                <div className="grafcet-quick-chips-row" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                  {quickVarChips.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      className={`grafcet-chip-sm ${variable === chip ? 'is-selected' : ''}`}
                      onClick={() => setVariable(chip)}
                      style={{
                        padding: '1px 6px',
                        fontSize: '10.5px',
                        background: variable === chip ? '#2563eb' : '#f1f5f9',
                        color: variable === chip ? '#ffffff' : '#334155',
                        border: '1px solid #cbd5e1',
                        borderRadius: '3px',
                        cursor: 'pointer',
                      }}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              {assignation === 'conditional' && (
                <div className="grafcet-fluidsim-field-group">
                  <label htmlFor="action-cond-input"><strong>Condition</strong></label>
                  <input
                    id="action-cond-input"
                    className="dc-input grafcet-fluidsim-input"
                    value={condition}
                    onChange={(e) => setCondition(e.target.value.toUpperCase())}
                    placeholder="1HZ, 0.5 HZ, I1"
                  />
                  <div className="grafcet-quick-chips-row" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                    {quickCondChips.map((condChip) => (
                      <button
                        key={condChip}
                        type="button"
                        onClick={() => setCondition(condChip)}
                        style={{
                          padding: '1px 6px',
                          fontSize: '10px',
                          background: condition === condChip ? '#2563eb' : '#f8fafc',
                          color: condition === condChip ? '#ffffff' : '#475569',
                          border: '1px solid #e2e8f0',
                          borderRadius: '3px',
                          cursor: 'pointer',
                        }}
                      >
                        {condChip}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(kind === 'D' || kind === 'L') && (
                <div className="grafcet-fluidsim-field-group">
                  <label htmlFor="action-time-input"><strong>Duration (s)</strong></label>
                  <input
                    id="action-time-input"
                    type="number"
                    step="0.1"
                    min="0.1"
                    className="dc-input grafcet-fluidsim-input"
                    value={timeMs / 1000}
                    onChange={(e) => setTimeMs(Math.max(100, Math.round(Number(e.target.value) * 1000)))}
                  />
                </div>
              )}
            </fieldset>

            <fieldset className="grafcet-fluidsim-group">
              <legend>Description</legend>
              <div className="grafcet-fluidsim-field-group">
                <input
                  className="dc-input grafcet-fluidsim-input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Y1_A-, Y6_D-, C-"
                />
              </div>

              <label className="grafcet-fluidsim-checkbox-label">
                <input
                  type="checkbox"
                  checked={displayDescription}
                  onChange={(e) => setDisplayDescription(e.target.checked)}
                />
                <span>Display description instead of formula</span>
              </label>
            </fieldset>

            <fieldset className="grafcet-fluidsim-group grafcet-preview-group">
              <legend>Preview (IEC 60848)</legend>
              <div className="grafcet-fluidsim-preview-box">
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
