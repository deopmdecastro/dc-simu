import { useEffect, useMemo, useRef, useState } from 'react'
import { validCondition, type GrafcetStep } from './engine'
import { matchSignals, signalAddressesInCondition, signalSearchText, tokenAtCursor, type GrafcetSignalSuggestion } from './signals'
import { declareSignals } from './declareSignals'
import { foldText } from '../utils/text'
import { IconArrowDown, IconArrowUp, IconCheck, IconChevronRight, IconClose, IconWarning } from '../ui/icons'

type Category = 'all' | 'inputs' | 'outputs' | 'memory' | 'steps' | 'timers' | 'resources'
interface Suggestion { value: string; label: string; comment: string; search: string; category: Exclude<Category, 'all'>; source: 'table' | 'expression' }
interface ConditionEditorProps {
  id: string
  value: string
  onChange: (value: string) => void
  signals?: GrafcetSignalSuggestion[]
  availableSteps?: GrafcetStep[]
  resetKey: string
  initialFocus?: boolean
  initialDefaultOne?: boolean
  active?: boolean
  error?: string
}

const CATEGORIES: Array<[Category, string]> = [['all', 'Todas'], ['inputs', 'Entradas'], ['outputs', 'Saídas'], ['memory', 'Memórias'], ['steps', 'Etapas'], ['timers', 'Tempo'], ['resources', 'Recursos']]
const OPERATORS = [{ label: 'NOT', token: '/', hint: 'Negação · /I1' }, { label: 'AND', token: ' * ', hint: 'E lógico · I1 * I2' }, { label: 'OR', token: ' + ', hint: 'OU lógico · I1 + I2' }, { label: 'Flanco ascendente', token: '^', hint: 'Flanco ascendente · ^I1' }, { label: 'Flanco descendente', token: '\\', hint: 'Flanco descendente · \\I1' }, { label: '(', token: '(', hint: 'Abrir parênteses' }, { label: ')', token: ')', hint: 'Fechar parênteses' }]

/** Cursor-safe expression editing. Existing expressions are never normalized. */
export default function ConditionEditor({ id, value, onChange, signals = [], availableSteps = [], resetKey, initialFocus, initialDefaultOne, active = true, error }: ConditionEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const selectionRef = useRef({ start: value.length, end: value.length })
  // Protect the saved range while opening the picker: moving focus can emit a
  // final, collapsed select event before the picker has rendered.
  const pickerOpeningRef = useRef(false)
  const defaultOneRef = useRef(initialDefaultOne ?? value === '1')
  const valueRef = useRef(value)
  valueRef.current = value
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<Category>('all')
  // Autocompletar ao escrever: sugere sinais da tabela (e etapas Xn) para a palavra sob o cursor.
  const [cursor, setCursor] = useState(value.length)
  const [typeaheadOpen, setTypeaheadOpen] = useState(false)
  const [typeaheadIndex, setTypeaheadIndex] = useState(0)

  useEffect(() => {
    defaultOneRef.current = initialDefaultOne ?? valueRef.current === '1'
    selectionRef.current = { start: valueRef.current.length, end: valueRef.current.length }
    setPickerOpen(false)
    setSearch('')
    setCategory('all')
  }, [resetKey, initialDefaultOne])
  useEffect(() => { if (pickerOpen) searchRef.current?.focus() }, [pickerOpen])
  useEffect(() => { if (!active) setPickerOpen(false) }, [active])

  const suggestions = useMemo(() => {
    const entries = new Map<string, Suggestion>()
    for (const signal of signals) entries.set(signal.address, { value: signal.address, label: signal.name, comment: signal.comment, search: signalSearchText(signal), category: signal.area === 'I' ? 'inputs' : signal.area === 'Q' ? 'outputs' : 'memory', source: 'table' })
    availableSteps.forEach((step, index) => entries.set(`X${index}`, { value: `X${index}`, label: `Etapa ${index} · ${step.name || index}`, comment: '', search: `X${index} ${step.name}`, category: 'steps', source: 'expression' }))
    for (const seconds of [1, 2, 5]) entries.set(`T(${seconds}s)`, { value: `T(${seconds}s)`, label: `${seconds} s de atividade`, comment: '', search: `${seconds} s tempo`, category: 'timers', source: 'expression' })
    for (const token of ['1', '0', '1HZ', '0.5HZ', '2HZ']) entries.set(token, { value: token, label: token === '1' ? 'Sempre verdadeira' : token === '0' ? 'Sempre falsa' : 'Frequência de simulação', comment: '', search: token, category: 'resources', source: 'expression' })
    return [...entries.values()]
  }, [signals, availableSteps])
  const token = typeaheadOpen && active ? tokenAtCursor(value, cursor) : null
  const typeaheadItems = useMemo(() => {
    if (!token) return []
    const pool = suggestions
      .filter((item) => item.category === 'inputs' || item.category === 'outputs' || item.category === 'memory' || item.category === 'steps')
      .map((item) => ({ address: item.value, name: item.label, comment: item.comment, area: item.category === 'steps' ? ('X' as const) : item.category === 'inputs' ? ('I' as const) : item.category === 'outputs' ? ('Q' as const) : ('M' as const), item }))
    const found = matchSignals(pool, token.text, 7)
    // Já escrito por completo e sem alternativas: não há nada a sugerir.
    if (found.length === 1 && found[0].address.toUpperCase() === token.text.toUpperCase()) return []
    return found
  }, [token?.text, token?.start, suggestions])
  const typeaheadActive = Math.min(typeaheadIndex, Math.max(0, typeaheadItems.length - 1))
  const typeaheadOptionId = (index: number) => `${id}-typeahead-${index}`
  const acceptTypeahead = (address: string) => {
    if (!token) return
    const next = value.slice(0, token.start) + address + value.slice(token.end)
    const position = token.start + address.length
    defaultOneRef.current = false
    onChange(next)
    selectionRef.current = { start: position, end: position }
    setCursor(position)
    setTypeaheadOpen(false)
    focusAt(position)
  }
  const searchText = foldText(search)
  const filtered = suggestions.filter((item) => (category === 'all' || item.category === category) && foldText(`${item.value} ${item.label} ${item.comment} ${item.search}`).includes(searchText))
  const undeclared = signalAddressesInCondition(value).filter((address) => !signals.some((signal) => signal.address === address))
  const valid = validCondition(value)
  const errorId = id.replace(/-input$/, '-error')

  const rememberSelection = () => {
    const input = inputRef.current
    // A pointer press can move focus to a toolbar button before React receives
    // its handler. The input still retains its range, so do not depend on focus.
    if (input) selectionRef.current = { start: input.selectionStart ?? value.length, end: input.selectionEnd ?? value.length }
  }
  const focusAt = (position: number) => requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(position, position) })
  const insert = (token: string, variable = false) => {
    // The picker captured the range before it moved focus. Re-reading here
    // would replace it with the browser's collapsed blur selection.
    if (!pickerOpeningRef.current) rememberSelection()
    const replaceDefault = variable && defaultOneRef.current && value === '1'
    const start = replaceDefault ? 0 : Math.min(selectionRef.current.start, value.length)
    const end = replaceDefault ? value.length : Math.min(selectionRef.current.end, value.length)
    onChange(value.slice(0, start) + token + value.slice(end))
    defaultOneRef.current = false
    selectionRef.current = { start: start + token.length, end: start + token.length }
    pickerOpeningRef.current = false
    setPickerOpen(false)
    focusAt(start + token.length)
  }
  const replace = (expression: string) => {
    defaultOneRef.current = false
    onChange(expression)
    selectionRef.current = { start: expression.length, end: expression.length }
    focusAt(expression.length)
  }
  const closePicker = () => {
    pickerOpeningRef.current = false
    setPickerOpen(false)
    const selection = { ...selectionRef.current }
    // Restore before the picker unmounts: a second Escape must reach the parent dialog.
    inputRef.current?.focus()
    inputRef.current?.setSelectionRange(selection.start, selection.end)
  }
  useEffect(() => {
    if (!pickerOpen) return
    const escapePicker = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      closePicker()
    }
    document.addEventListener('keydown', escapePicker, true)
    return () => document.removeEventListener('keydown', escapePicker, true)
  }, [pickerOpen])

  return (
    <div className="grafcet-condition-editor" onKeyDown={(event) => {
      if (pickerOpen && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closePicker() }
    }}>
      <label className="grafcet-property-label" htmlFor={id}>Condição</label>
      <div className="grafcet-typeahead-anchor">
      <input ref={inputRef} id={id} data-initial-focus={initialFocus ? true : undefined} className="dc-input grafcet-code-input" value={value}
        role="combobox" aria-autocomplete="list" aria-expanded={typeaheadItems.length > 0} aria-controls={typeaheadItems.length ? `${id}-typeahead` : undefined} aria-activedescendant={typeaheadItems.length ? typeaheadOptionId(typeaheadActive) : undefined}
        onChange={(event) => {
          defaultOneRef.current = false
          onChange(event.target.value)
          const position = event.target.selectionStart ?? event.target.value.length
          selectionRef.current = { start: position, end: event.target.selectionEnd ?? event.target.value.length }
          setCursor(position)
          setTypeaheadOpen(true)
          setTypeaheadIndex(0)
        }}
        onKeyDown={(event) => {
          if (!typeaheadItems.length || event.ctrlKey || event.metaKey || event.altKey) return
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setTypeaheadIndex((typeaheadActive + (event.key === 'ArrowDown' ? 1 : -1) + typeaheadItems.length) % typeaheadItems.length)
          } else if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey) {
            event.preventDefault()
            event.stopPropagation()
            acceptTypeahead(typeaheadItems[typeaheadActive].address)
          } else if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            setTypeaheadOpen(false)
          }
        }}
        onSelect={(event) => {
          // Browsers can emit one final select event as focus moves into the
          // picker, with a collapsed range. Keep the range captured on open.
          if (pickerOpeningRef.current || document.activeElement !== event.currentTarget) return
          rememberSelection()
          setCursor(event.currentTarget.selectionStart ?? value.length)
        }}
        onBlur={() => { setTypeaheadOpen(false) }} placeholder="Ex.: G0 <> X9 * (I1 + /I2) — escreva para sugestões" autoComplete="off" spellCheck={false} aria-invalid={!!error} aria-describedby={`${id}-status${error ? ` ${errorId}` : ''}`} />
      {typeaheadItems.length > 0 && <ul className="grafcet-typeahead" id={`${id}-typeahead`} role="listbox" aria-label="Sugestões da tabela de sinais">
        {typeaheadItems.map((entry, index) => <li key={entry.address} id={typeaheadOptionId(index)} role="option" aria-selected={index === typeaheadActive} className={index === typeaheadActive ? 'is-active' : ''}
          onMouseDown={(event) => { event.preventDefault(); acceptTypeahead(entry.address) }} onMouseEnter={() => setTypeaheadIndex(index)}>
          <code>{entry.address}</code><span>{entry.name && <b>{entry.name}</b>}{entry.comment && <small>{entry.comment}</small>}</span><em className={`is-${entry.area}`}>{entry.area === 'X' ? 'etapa' : entry.area === 'I' ? 'entrada' : entry.area === 'Q' ? 'saída' : 'memória'}</em>
        </li>)}
        <li className="grafcet-typeahead-hint" aria-hidden="true"><IconArrowUp size={9} /><IconArrowDown size={9} /> navegar · Enter/Tab inserir · Esc fechar</li>
      </ul>}
      </div>
      <div className="grafcet-condition-tools" role="group" aria-label="Inserir operadores na posição do cursor">
        {OPERATORS.map((operator) => <button key={operator.label} type="button" onMouseDown={(event) => { rememberSelection(); event.preventDefault() }} onClick={() => insert(operator.token)} title={operator.hint} aria-label={`Inserir ${operator.label}`}>{operator.token === '^' ? <IconArrowUp size={12} /> : operator.token === '\\' ? <IconArrowDown size={12} /> : operator.label}</button>)}
        <button type="button" className="grafcet-insert-variable" aria-expanded={pickerOpen} aria-controls={pickerOpen ? `${id}-picker` : undefined} onMouseDown={(event) => { pickerOpeningRef.current = true; rememberSelection(); event.preventDefault() }} onClick={() => { rememberSelection(); setPickerOpen((open) => { if (open) pickerOpeningRef.current = false; return !open }) }}>Inserir variável</button>
      </div>
      <p id={`${id}-status`} className={`grafcet-condition-status ${valid ? 'is-valid' : 'is-incomplete'}`} role="status" aria-live="polite">{valid ? <IconCheck size={12} /> : <IconWarning size={12} />}{valid ? 'Sintaxe válida' : 'Expressão incompleta ou inválida'}</p>
      {undeclared.length ? <p className="grafcet-signal-undeclared">Fora da tabela: {undeclared.join(', ')}. Pode usar a expressão manual ou <button type="button" className="grafcet-link-button" onClick={() => declareSignals(undeclared)} title="Acrescenta estes endereços à tabela de variáveis, para passarem a ser sugeridos">Declarar na tabela</button>.</p> : !signals.length && <p className="grafcet-property-note">Adicione sinais em «Variáveis» para obter sugestões; também pode escrever a expressão.</p>}
      {error && <p id={errorId} className="grafcet-field-error" role="alert">{error}</p>}
      {pickerOpen && <div ref={pickerRef} className="grafcet-condition-picker" id={`${id}-picker`} data-property-save-ignore>
        <div className="grafcet-condition-picker-head"><strong>Variáveis e sinais</strong><button type="button" onClick={closePicker} aria-label="Fechar lista de variáveis"><IconClose size={13} /></button></div>
        <label htmlFor={`${id}-search`}>Pesquisar variável</label>
        <input ref={searchRef} className="dc-input" id={`${id}-search`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, endereço ou etapa…" onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); if (!event.ctrlKey && !event.metaKey && filtered[0]) insert(filtered[0].value, true) }
          if (event.key === 'ArrowDown') { event.preventDefault(); pickerRef.current?.querySelector<HTMLButtonElement>('[data-variable-token]')?.focus() }
        }} />
        <div className="grafcet-condition-categories" role="group" aria-label="Categorias de variáveis">{CATEGORIES.map(([id, label]) => <button key={id} type="button" aria-pressed={category === id} onClick={() => setCategory(id)}>{label}</button>)}</div>
        <div className="grafcet-condition-results" role="group" aria-label="Variáveis disponíveis">{(['table', 'expression'] as const).map((source) => {
          const rows = filtered.filter((item) => item.source === source)
          return rows.length ? <section key={source}><h4>{source === 'table' ? 'Sinais da tabela' : 'Recursos da expressão'}</h4>{rows.map((item) => <button type="button" key={item.value} data-variable-token={item.value} onClick={() => insert(item.value, true)}><code>{item.value}</code><span>{item.label && <b>{item.label}</b>}{item.comment && <small>{item.comment}</small>}</span></button>)}</section> : null
        })}{!filtered.length && <p>Nenhum sinal corresponde à pesquisa. Pode declarar sinais em «Variáveis» ou escrever o endereço manualmente.</p>}</div>
        <p className="grafcet-property-note">Exemplos: <code>G0 &lt;&gt; X9</code> (X9 inativa), <code>/1Hz</code> (relógio negado), <code>MW1 &gt;= 5</code> e <code>I1 * (I2 + /I3)</code>. G0 consulta o GRAFCET atual; referências importadas a outros gráficos ficam assinaladas para revisão. T(…) usa o tempo da etapa da ação ou das origens.</p>
      </div>}
      <details className="grafcet-context-help grafcet-inline-disclosure"><summary><IconChevronRight size={11} />Modelos de condição</summary><div><p>Substituir toda a expressão por:</p><div className="grafcet-property-chips" role="group" aria-label="Substituir condição por modelo">{['1', 'T(1s)', 'T(2s)', 'T(5s)'].map((preset) => <button key={preset} type="button" onClick={() => replace(preset)} title={`Substituir toda a condição por ${preset}`}>{preset}</button>)}</div></div></details>
    </div>
  )
}
