import { useState, useEffect } from 'react'
import type { GrafcetStep, GrafcetStepType } from './engine'

interface StepDialogProps {
  open: boolean
  step: GrafcetStep | null
  stepIndex?: number
  onSave: (patch: Partial<GrafcetStep>) => void
  onClose: () => void
  onHelp?: () => void
}

const STEP_TYPES: Array<{ id: GrafcetStepType; label: string; desc: string }> = [
  { id: 'simple', label: 'Simple step', desc: 'Etapa simples da sequência' },
  { id: 'initial', label: 'Initial step', desc: 'Etapa inicial ativada no arranque' },
  { id: 'macro', label: 'Macro-step', desc: 'Representa um sub-GRAFCET (M)' },
  { id: 'macro-input', label: 'Macro input', desc: 'Entrada de macro-etapa (E)' },
  { id: 'macro-output', label: 'Macro output', desc: 'Saída de macro-etapa (S)' },
  { id: 'enclosing', label: 'Enclosing step', desc: 'Etapa encapsulante' },
  { id: 'initial-enclosing', label: 'Initial enclosing step', desc: 'Etapa encapsulante inicial' },
]

export default function StepDialog({ open, step, stepIndex = 0, onSave, onClose, onHelp }: StepDialogProps) {
  const [name, setName] = useState('')
  const [stepType, setStepType] = useState<GrafcetStepType>('simple')
  const [activationLink, setActivationLink] = useState(false)
  const [description, setDescription] = useState('')

  useEffect(() => {
    if (step) {
      setName(step.name || String(stepIndex))
      setStepType(step.stepType || (step.initial ? 'initial' : 'simple'))
      setActivationLink(!!step.activationLink)
      setDescription(step.description || step.comment || '')
    }
  }, [step, stepIndex, open])

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
  }, [open, name, stepType, activationLink, description])

  if (!open || !step) return null

  const handleOk = () => {
    const isInit = stepType === 'initial' || stepType === 'initial-enclosing'
    onSave({
      name: name.trim() || String(stepIndex),
      stepType,
      initial: isInit,
      activationLink,
      description: description.trim(),
      comment: description.trim(),
    })
    onClose()
  }

  // Mini-renderizador do ícone de rádio para cada tipo
  const renderTypeIcon = (type: GrafcetStepType) => {
    const isDouble = type === 'initial' || type === 'initial-enclosing'
    const isMacro = type === 'macro'
    const isInput = type === 'macro-input'
    const isOutput = type === 'macro-output'
    const isEnclosing = type === 'enclosing' || type === 'initial-enclosing'

    return (
      <svg width="28" height="28" viewBox="0 0 28 28" className="grafcet-dialog-radio-icon">
        <rect x="3" y="3" width="22" height="22" fill="white" stroke="#263d59" strokeWidth="1.8" />
        {isDouble && <rect x="6" y="6" width="16" height="16" fill="none" stroke="#263d59" strokeWidth="1.2" />}
        {isMacro && (
          <>
            <line x1="3" y1="8" x2="25" y2="8" stroke="#263d59" strokeWidth="1" />
            <line x1="3" y1="20" x2="25" y2="20" stroke="#263d59" strokeWidth="1" />
            <text x="14" y="16.5" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#263d59">M</text>
          </>
        )}
        {isInput && <text x="14" y="17.5" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#263d59">E</text>}
        {isOutput && <text x="14" y="17.5" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#263d59">S</text>}
        {isEnclosing && (
          <>
            <line x1="3" y1="8" x2="8" y2="3" stroke="#263d59" strokeWidth="1.5" />
            <line x1="20" y1="3" x2="25" y2="8" stroke="#263d59" strokeWidth="1.5" />
            <line x1="3" y1="20" x2="8" y2="25" stroke="#263d59" strokeWidth="1.5" />
            <line x1="20" y1="25" x2="25" y2="20" stroke="#263d59" strokeWidth="1.5" />
          </>
        )}
      </svg>
    )
  }

  // Renderizador da caixa de pré-visualização grande
  const renderPreview = () => {
    const isDouble = stepType === 'initial' || stepType === 'initial-enclosing'
    const isMacro = stepType === 'macro'
    const isInput = stepType === 'macro-input'
    const isOutput = stepType === 'macro-output'
    const isEnclosing = stepType === 'enclosing' || stepType === 'initial-enclosing'
    const displayName = name || String(stepIndex)

    // Ajusta o tamanho da fonte para que textos longos (ex: "Etapa 0") não fiquem colados ou transbordando
    const fontSize = displayName.length > 7 ? 11 : displayName.length > 5 ? 12 : displayName.length > 3 ? 14 : 18

    return (
      <svg width="100%" height="150" viewBox="0 0 200 150" className="grafcet-preview-svg">
        <g transform="translate(68, 43)">
          <rect x="0" y="0" width="64" height="64" fill="white" stroke="#1e293b" strokeWidth="2.5" />
          {isDouble && <rect x="5.5" y="5.5" width="53" height="53" fill="none" stroke="#1e293b" strokeWidth="1.8" />}
          {isMacro && (
            <>
              <line x1="0" y1="12" x2="64" y2="12" stroke="#1e293b" strokeWidth="1.8" />
              <line x1="0" y1="52" x2="64" y2="52" stroke="#1e293b" strokeWidth="1.8" />
              <text x="32" y="10" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#64748b">M</text>
            </>
          )}
          {isInput && <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#64748b">E</text>}
          {isOutput && <text x="52" y="56" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#64748b">S</text>}
          {isEnclosing && (
            <>
              <line x1="0" y1="14" x2="14" y2="0" stroke="#1e293b" strokeWidth="2.5" />
              <line x1="50" y1="0" x2="64" y2="14" stroke="#1e293b" strokeWidth="2.5" />
              <line x1="0" y1="50" x2="14" y2="64" stroke="#1e293b" strokeWidth="2.5" />
              <line x1="50" y1="64" x2="64" y2="50" stroke="#1e293b" strokeWidth="2.5" />
            </>
          )}
          <text x="32" y={fontSize <= 12 ? 36 : 38} textAnchor="middle" fontSize={fontSize} fontWeight="700" fill="#0f172a">
            {displayName}
          </text>
        </g>
        {description && (
          <text x="100" y="132" textAnchor="middle" fontSize="12" fontWeight="600" fill="#334155">
            "{description}"
          </text>
        )}
      </svg>
    )
  }

  const quickStepNumbers = ['0', '1', '2', '3', '4', '10', '20', '30']

  const quickDescChips = [
    'Repouso / Início',
    'Avanço Cilindro A',
    'Recuo Cilindro A',
    'Avanço Cilindro B',
    'Espera Peça',
    'Temporização',
    'Ciclo Concluído',
  ]

  return (
    <div className="grafcet-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="grafcet-fluidsim-dialog" role="dialog" aria-modal="true" aria-labelledby="step-dialog-title">
        <header className="grafcet-fluidsim-titlebar">
          <span id="step-dialog-title">Step Properties (IEC 60848 / FluidSIM)</span>
          <button className="grafcet-fluidsim-close" onClick={onClose} aria-label="Fechar">✕</button>
        </header>

        <div className="grafcet-fluidsim-body">
          {/* Coluna da esquerda: Tipo */}
          <div className="grafcet-fluidsim-col-left">
            <fieldset className="grafcet-fluidsim-group">
              <legend>Step Type</legend>
              <div className="grafcet-step-types-list">
                {STEP_TYPES.map((t) => (
                  <label key={t.id} className="grafcet-type-radio-label">
                    <div className="grafcet-type-icon-box">{renderTypeIcon(t.id)}</div>
                    <input
                      type="radio"
                      name="stepType"
                      checked={stepType === t.id}
                      onChange={() => setStepType(t.id)}
                    />
                    <span className="grafcet-type-name">{t.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          {/* Coluna da direita: Nome, Ativação, Descrição, Pré-visualização */}
          <div className="grafcet-fluidsim-col-right">
            <div className="grafcet-fluidsim-field-group">
              <label htmlFor="step-name-input"><strong>Step Identifier / Name</strong></label>
              <input
                id="step-name-input"
                className="dc-input grafcet-fluidsim-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: 0, 1, 10, 30"
                autoFocus
              />
              {/* Sugestões rápidas de números de etapa IEC */}
              <div className="grafcet-quick-chips-row" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                {quickStepNumbers.map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setName(num)}
                    style={{
                      padding: '1px 7px',
                      fontSize: '10.5px',
                      fontWeight: 600,
                      background: name === num ? '#2563eb' : '#f1f5f9',
                      color: name === num ? '#ffffff' : '#334155',
                      border: '1px solid #cbd5e1',
                      borderRadius: '3px',
                      cursor: 'pointer',
                    }}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            <label className="grafcet-fluidsim-checkbox-label">
              <input
                type="checkbox"
                checked={activationLink}
                onChange={(e) => setActivationLink(e.target.checked)}
              />
              <span>Activation link (ligação de ativação orientada)</span>
            </label>

            <div className="grafcet-fluidsim-field-group">
              <label htmlFor="step-desc-input"><strong>Description / Comment</strong></label>
              <input
                id="step-desc-input"
                className="dc-input grafcet-fluidsim-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Maquina Parada, Avanço Motor"
              />
              {/* Sugestões rápidas de descrição */}
              <div className="grafcet-quick-chips-row" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                {quickDescChips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setDescription(chip)}
                    style={{
                      padding: '1px 6px',
                      fontSize: '10px',
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
