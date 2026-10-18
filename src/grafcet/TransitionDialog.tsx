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

type VarCategory = 'all' | 'inputs' | 'outputs' | 'steps' | 'timers'

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
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerCategory, setPickerCategory] = useState<VarCategory>('all')

  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (transition) {
      setName(transition.name || `T${transitionIndex + 1}`)
      setCondition(transition.condition || '1')
      setDescription(transition.description || transition.comment || '')
      setDisplayDescription(!!transition.displayDescription)
      setTargetInfo(transition.targetInfo || '')
      setShowVarPicker(false)
      setPickerSearch('')
    }
  }, [transition, transitionIndex, open])

  // Atalhos de teclado no modal (Enter para salvar, Escape para fechar)
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (showVarPicker) {
          setShowVarPicker(false)
        } else {
          onClose()
        }
      } else if (e.key === 'Enter' && !e.shiftKey) {
        const target = e.target as HTMLElement | null
        if (target?.tagName === 'TEXTAREA') return
        e.preventDefault()
        handleOk()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, showVarPicker, name, condition, description, displayDescription, targetInfo])

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

  const transLabel = name.trim() || `T${transitionIndex + 1}`
  const displayText = displayDescription ? (description || condition) : (condition || '1')

  const renderPreview = () => {
    return (
      <svg width="100%" height="150" viewBox="0 0 200 150" className="grafcet-preview-svg">
        <g transform="translate(85, 75)">
          {/* Vertical flow line */}
          <line x1="0" y1="-50" x2="0" y2="50" stroke="#1e293b" strokeWidth="2.5" />

          {/* Horizontal transition cross tick */}
          <line x1="-15" y1="0" x2="15" y2="0" stroke="#1e293b" strokeWidth="3.5" />

          {/* Transition name / index badge à esquerda */}
          <text x="-20" y="4" textAnchor="end" fontSize="11" fontWeight="700" fill="#64748b">
            {transLabel}
          </text>

          {/* Receptivity condition text to the right */}
          <text x="22" y="5" fontSize="13" fontWeight="600" fill="#0f172a">
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

  const stepNames = availableSteps.map((s, idx) => s.name || String(idx))
  const stepVars = stepNames.map((n) => `X${n}`)
  const stepTimerVars = stepNames.flatMap((n) => [`1s/X${n}`, `2s/X${n}`, `5s/X${n}`])

  const defaultInputs = [
    'I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8',
    'B_Start', 'B_Stop_NF', 'In_Man', 'B_Reset', 'Int_Emerg_NF', 'Emerg_NF',
    'fc_a0', 'fc_a1', 'fc_b0', 'fc_b1', 'b0', 'b1', 'a0', 'a1', 'S_Rolamento',
  ]

  const defaultOutputs = [
    'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'M1', 'M2', 'M3', 'M4',
    'KM1', 'KM2', 'KM3', '1HZ', '0.5HZ', '2HZ',
  ]

  const allVars = Array.from(new Set([
    ...availableVariables,
    ...defaultInputs,
    ...defaultOutputs,
    ...stepVars,
    ...stepTimerVars,
  ]))

  // Filtragem por busca e categoria
  const filteredVars = allVars.filter((v) => {
    if (pickerSearch && !v.toLowerCase().includes(pickerSearch.toLowerCase())) {
      return false
    }
    if (pickerCategory === 'inputs') {
      return v.startsWith('I') || v.startsWith('fc_') || v.startsWith('B_') || v.startsWith('b') || v.startsWith('a') || v.includes('Emerg')
    }
    if (pickerCategory === 'outputs') {
      return v.startsWith('Q') || v.startsWith('M') || v.startsWith('KM') || v.startsWith('Y') || v.startsWith('L_')
    }
    if (pickerCategory === 'steps') {
      return /^X\w+/.test(v)
    }
    if (pickerCategory === 'timers') {
      return v.includes('/X')
    }
    return true
  })

  const quickCondChips = ['=1', '1', 'B_Start', 'B_Stop_NF', 'fc_a1', 'fc_b1', '1s/X', '1HZ']

  return (
    <div className="grafcet-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="grafcet-fluidsim-dialog" role="dialog" aria-modal="true" aria-labelledby="trans-dialog-title">
        <header className="grafcet-fluidsim-titlebar">
          <span id="trans-dialog-title">Transition Properties (IEC 60848 / FluidSIM)</span>
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
              <legend>Condition Formula</legend>

              {/* Botões rápidos FluidSim */}
              <div className="grafcet-trans-toolbar">
                <button
                  type="button"
                  className="grafcet-trans-tool-btn"
                  onClick={() => insertToken('/')}
                  title="NOT (barra superior / negação normalizada)"
                >
                  <span style={{ textDecoration: 'overline', fontWeight: 'bold' }}>NOT</span>
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
                    style={{ background: showVarPicker ? '#2563eb' : undefined, color: showVarPicker ? '#fff' : undefined }}
                  >
                    Variable... ▾
                  </button>
                  {showVarPicker && (
                    <div className="grafcet-var-picker-popover" style={{ width: '260px', maxHeight: '280px' }}>
                      <div className="grafcet-var-picker-head">
                        <span>Variáveis e Sinais</span>
                        <button type="button" onClick={() => setShowVarPicker(false)}>✕</button>
                      </div>

                      {/* Campo de pesquisa rápida */}
                      <div style={{ padding: '4px 6px', borderBottom: '1px solid #e2e8f0' }}>
                        <input
                          type="text"
                          className="dc-input"
                          style={{ fontSize: '11px', padding: '3px 6px', width: '100%' }}
                          placeholder="Pesquisar variável..."
                          value={pickerSearch}
                          onChange={(e) => setPickerSearch(e.target.value)}
                          autoFocus
                        />
                      </div>

                      {/* Filtros de categoria */}
                      <div style={{ display: 'flex', gap: '3px', padding: '4px 6px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', overflowX: 'auto' }}>
                        {(['all', 'inputs', 'outputs', 'steps', 'timers'] as const).map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setPickerCategory(cat)}
                            style={{
                              padding: '1px 5px',
                              fontSize: '9.5px',
                              fontWeight: 600,
                              background: pickerCategory === cat ? '#2563eb' : '#ffffff',
                              color: pickerCategory === cat ? '#ffffff' : '#64748b',
                              border: '1px solid #cbd5e1',
                              borderRadius: '3px',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {cat === 'all' ? 'Todas' : cat === 'inputs' ? 'Entradas' : cat === 'outputs' ? 'Saídas' : cat === 'steps' ? 'Etapas' : 'Timers'}
                          </button>
                        ))}
                      </div>

                      {/* Lista de variáveis */}
                      <div className="grafcet-var-picker-list" style={{ maxHeight: '160px', overflowY: 'auto' }}>
                        {filteredVars.map((v) => (
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
                        {!filteredVars.length && (
                          <div style={{ padding: '8px', fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>
                            Nenhuma variável encontrada
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="grafcet-trans-tool-btn"
                  onClick={() => {
                    const firstStep = availableSteps[0]?.name || '0'
                    insertToken(`1s/X${firstStep}`)
                  }}
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
                  placeholder="Ex: 1s/X0, b0 * /S_Rolamento, B_Start * B_Stop_NF"
                  autoFocus
                />

                {/* Chips rápidos de condições comuns */}
                <div className="grafcet-quick-chips-row" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                  {quickCondChips.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => insertToken(chip === '1s/X' ? `1s/X${availableSteps[0]?.name || '0'}` : chip)}
                      style={{
                        padding: '1px 6px',
                        fontSize: '10.5px',
                        background: '#f1f5f9',
                        color: '#334155',
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
                  placeholder="Ex: 0, 1, 10, 50 (salto para etapa)"
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
              <legend>Preview (IEC 60848)</legend>
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
