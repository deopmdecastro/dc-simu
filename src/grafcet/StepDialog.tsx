import { useState, useEffect } from 'react'
import type { GrafcetStep, GrafcetStepType } from './engine'
import PropertyDialog from '../ui/PropertyDialog'

interface StepDialogProps {
  open: boolean
  step: GrafcetStep | null
  stepIndex?: number
  onSave: (patch: Partial<GrafcetStep>) => void
  onClose: () => void
  onHelp?: () => void
}

const STEP_TYPES: Array<{ id: GrafcetStepType; label: string; desc: string }> = [
  { id: 'simple', label: 'Etapa simples', desc: 'Etapa simples da sequência' },
  { id: 'initial', label: 'Etapa inicial', desc: 'Etapa inicial ativada no arranque' },
  { id: 'macro', label: 'Macroetapa', desc: 'Notação de macroetapa (M)' },
  { id: 'macro-input', label: 'Entrada de macroetapa', desc: 'Entrada de macro-etapa (E)' },
  { id: 'macro-output', label: 'Saída de macroetapa', desc: 'Saída de macro-etapa (S)' },
  { id: 'enclosing', label: 'Etapa encapsulante', desc: 'Etapa encapsulante' },
  { id: 'initial-enclosing', label: 'Encapsulante inicial', desc: 'Etapa encapsulante inicial' },
]

export default function StepDialog({ open, step, stepIndex = 0, onSave, onClose }: StepDialogProps) {
  const [name, setName] = useState('')
  const [stepType, setStepType] = useState<GrafcetStepType>('simple')
  const [activationLink, setActivationLink] = useState(false)
  const [description, setDescription] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  useEffect(() => {
    if (step) {
      setSubmitted(false)
      setName(step.name ?? String(stepIndex))
      setStepType(step.stepType || (step.initial ? 'initial' : 'simple'))
      setActivationLink(!!step.activationLink)
      setDescription(step.description ?? step.comment ?? '')
      setAdvancedOpen(!!step.activationLink || !!step.stepType && !['simple', 'initial'].includes(step.stepType))
    }
  }, [step, stepIndex, open])

  if (!open || !step) return null

  const nameError = !name.trim() ? 'Indique o nome ou número da etapa.' : ''
  const handleOk = () => {
    setSubmitted(true)
    if (nameError) { document.getElementById('step-name-input')?.focus(); return }
    const isInit = stepType === 'initial' || stepType === 'initial-enclosing'
    onSave({
      name: name.trim(),
      stepType,
      initial: stepType === (step.stepType ?? (step.initial ? 'initial' : 'simple')) ? step.initial : isInit,
      activationLink,
      description: description.trim(),
      comment: description === (step.description ?? step.comment ?? '') ? step.comment : description.trim(),
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
    const displayName = name || '—'
    const previewName = displayName.length > 13 ? displayName.slice(0, 12) + '…' : displayName

    // Ajusta o tamanho da fonte para que textos longos (ex: "Etapa 0") não fiquem colados ou transbordando
    const fontSize = displayName.length > 7 ? 11 : displayName.length > 5 ? 12 : displayName.length > 3 ? 14 : 18

    return (
      <svg width="100%" height="150" viewBox="0 0 200 150" className="grafcet-preview-svg" role="img" aria-label={`Pré-visualização da etapa ${name || "sem nome"}`}><title>{name}{description ? ` · ${description}` : ""}</title>
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
          <text x="32" y={fontSize <= 12 ? 36 : 38} textAnchor="middle" fontSize={fontSize} textLength={previewName.length > 8 ? 48 : undefined} lengthAdjust="spacingAndGlyphs" fontWeight="700" fill="#0f172a">
            {previewName}
          </text>
        </g>
        {description && (
          <text x="100" y="132" textAnchor="middle" fontSize="12" fontWeight="600" fill="#334155">
            {description.length > 28 ? description.slice(0, 27) + '…' : description}
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
    <PropertyDialog open={open} id="step-dialog" title="Propriedades da etapa" subtitle="Identifique a etapa e escolha o seu papel na sequência." onSave={handleOk} onClose={onClose}>
      <div className="grafcet-property-grid">
        <section className="grafcet-property-fields" aria-label="Definições da etapa">
          <div className="grafcet-property-field">
            <label htmlFor="step-name-input">Nome ou número <span className="grafcet-required">obrigatório</span></label>
            <input id="step-name-input" data-initial-focus className="dc-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: 0, 10, Espera" aria-invalid={submitted && !!nameError} aria-describedby={submitted && nameError ? 'step-name-error' : undefined} />
            {submitted && nameError && <p id="step-name-error" className="grafcet-field-error" role="alert">{nameError}</p>}
            <div className="grafcet-property-chips" aria-label="Sugestões de números">{quickStepNumbers.map((num) => <button key={num} type="button" onClick={() => setName(num)} aria-pressed={name === num}>{num}</button>)}</div>
          </div>
          <fieldset className="grafcet-property-section">
            <legend>Tipo de etapa</legend>
            <div className="grafcet-step-options">{STEP_TYPES.filter((t) => t.id === 'simple' || t.id === 'initial').map((t) => (
              <label key={t.id} className={`grafcet-property-option ${stepType === t.id ? 'is-selected' : ''}`}>
                <input type="radio" name="stepType" checked={stepType === t.id} onChange={() => setStepType(t.id)} />
                {renderTypeIcon(t.id)}<span><strong>{t.label}</strong><small>{t.desc}</small></span>
              </label>
            ))}</div>
          </fieldset>
          <div className="grafcet-property-field">
            <label htmlFor="step-desc-input">Descrição <span className="grafcet-optional">opcional</span></label>
            <input id="step-desc-input" className="dc-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Avanço do cilindro A" />
            <div className="grafcet-property-chips" aria-label="Sugestões de descrição">{quickDescChips.map((chip) => <button key={chip} type="button" onClick={() => setDescription(chip)}>{chip}</button>)}</div>
          </div>
          <details className="grafcet-context-help grafcet-step-advanced" open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}>
            <summary>Notação avançada <span>{!['simple', 'initial'].includes(stepType) ? STEP_TYPES.find((type) => type.id === stepType)?.label : 'opcional'}</span></summary>
            <div>
              <p className="grafcet-property-warning">Macroetapas, encapsulamento e ligação de ativação são notação guardada. O simulador não executa sub-GRAFCETs nem hierarquias; estas etapas continuam na sequência atual.</p>
              <div className="grafcet-step-options">{STEP_TYPES.filter((type) => !['simple', 'initial'].includes(type.id)).map((type) => <label key={type.id} className={`grafcet-property-option ${stepType === type.id ? 'is-selected' : ''}`}><input type="radio" name="stepType" checked={stepType === type.id} onChange={() => setStepType(type.id)} />{renderTypeIcon(type.id)}<span><strong>{type.label}</strong><small>{type.desc}</small></span></label>)}</div>
              <label className="grafcet-property-checkbox"><input type="checkbox" checked={activationLink} onChange={(event) => setActivationLink(event.target.checked)} /><span>Ligação de ativação orientada · apenas notação</span></label>
            </div>
          </details>
          <details className="grafcet-context-help"><summary>Como configurar esta etapa</summary><div><p>A etapa inicial fica ativa ao iniciar a sequência. As etapas simples são ativadas pelas transições ligadas a elas.</p><p>O nome é a identificação visual. Nas condições, <code>X0</code> consulta o índice 0 da lista global; mudar o nome para «Espera» não cria uma variável <code>XEspera</code>.</p><p>A descrição é opcional. Associe saídas através das ações da etapa; o nome ou a descrição não ligam saídas.</p></div></details>
        </section>
        <aside className="grafcet-property-preview">
          <div className="grafcet-property-preview-label"><span>Pré-visualização</span><span>IEC 60848</span></div>
          <div className="grafcet-property-drawing">{renderPreview()}</div>
          <strong>{STEP_TYPES.find((t) => t.id === stepType)?.label}</strong>
          <p>{!['simple', 'initial'].includes(stepType) ? 'Notação avançada guardada. Sem execução de sub-GRAFCETs no simulador.' : stepType === 'initial' ? 'Ativa no início da sequência.' : 'A ativação depende das ligações e transições.'}</p>
          <div className="grafcet-property-preview-value"><span>Identificador</span><code>{name || 'Por definir'}</code></div>
          {description && <div className="grafcet-property-preview-value"><span>Descrição</span><span>{description}</span></div>}
        </aside>
      </div>
    </PropertyDialog>
  )
}
