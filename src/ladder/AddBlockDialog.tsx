import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Modal from '../ui/Modal'
import Select from '../ui/Select'
import { useSimStore } from '../store/useSimStore'
import { foldText } from '../utils/text'
import type { ProjectFile, ProjectFolder } from './projectFiles'
import {
  ALL_OB_TEMPLATES, BLOCK_KINDS, BLOCK_LANGUAGES, OB_CYCLE_GROUP, OB_GROUPS,
  blockDisplayName, planBlock, suggestLabel, suggestNumber, usedBlockNumbers, validateBlock,
  type BlockKind, type BlockLanguage, type ObTemplate,
} from './blockCatalog'
import { IconCheck, IconChevronRight, IconClose, IconFolder, IconOpen, IconPlus, IconSearch } from '../ui/icons'

type Draft = { label: string; numberText: string }
const kinds = Object.keys(BLOCK_KINDS) as BlockKind[]
const languageLabels: Record<BlockLanguage, string> = {
  LAD: 'LAD · Diagrama de contactos', FBD: 'FBD · Blocos funcionais',
  SCL: 'SCL · Texto estruturado', ST: 'ST · Texto estruturado', STL: 'STL · Lista de instruções',
}
const typeHints: Record<BlockKind, string> = { OB: 'Organiza a execução', FB: 'Lógica com estado', FC: 'Lógica reutilizável', DB: 'Variáveis do programa' }

/** Criação de blocos no PLC ativo. As escolhas são rascunhos até confirmar. */
export default function AddBlockDialog({ open, initialKind = 'OB', onClose, onCreated, files }: {
  open: boolean
  initialKind?: BlockKind
  onClose: () => void
  onCreated: (id: string, folder: ProjectFolder, name: string) => void
  files: ProjectFile[]
}) {
  const [kind, setKind] = useState<BlockKind>(initialKind)
  const [templateKey, setTemplateKey] = useState(ALL_OB_TEMPLATES[0].key)
  const [drafts, setDrafts] = useState<Partial<Record<BlockKind, Draft>>>({})
  const [language, setLanguage] = useState<BlockLanguage>('LAD')
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [creationError, setCreationError] = useState('')
  const template = ALL_OB_TEMPLATES.find((item) => item.key === templateKey) ?? ALL_OB_TEMPLATES[0]
  const defaultDraft = (next: BlockKind): Draft => ({
    label: next === 'OB' ? template.label : suggestLabel(files, next),
    numberText: String(suggestNumber(files, next, next === 'OB' ? template.number : undefined)),
  })
  const { label, numberText } = drafts[kind] ?? defaultDraft(kind)
  const updateDraft = (patch: Partial<Draft>) => {
    setCreationError('')
    setDrafts((current) => ({ ...current, [kind]: { label, numberText, ...patch } }))
  }
  const applyObTemplate = (key: string) => {
    if (key === templateKey) return
    const next = ALL_OB_TEMPLATES.find((item) => item.key === key) ?? ALL_OB_TEMPLATES[0]
    setTemplateKey(next.key)
    setCreationError('')
    setDrafts((current) => ({ ...current, OB: { label: next.label, numberText: String(suggestNumber(files, 'OB', next.number)) } }))
  }
  const pickKind = (next: BlockKind) => {
    if (next === kind) return
    setDrafts((current) => ({ ...current, [kind]: { label, numberText }, [next]: current[next] ?? defaultDraft(next) }))
    setCreationError('')
    setKind(next)
  }
  const toggleFolder = (id: string) => setCollapsed((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  useEffect(() => {
    if (!open) return
    const first = ALL_OB_TEMPLATES[0]
    setKind(initialKind)
    setTemplateKey(first.key)
    setLanguage('LAD')
    setSearch('')
    setCollapsed(new Set())
    setCreationError('')
    setDrafts({ [initialKind]: { label: initialKind === 'OB' ? first.label : suggestLabel(files, initialKind), numberText: String(suggestNumber(files, initialKind, initialKind === 'OB' ? first.number : undefined)) } })
    // Um novo diálogo usa os ficheiros atuais; editar um rascunho não o reinicia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialKind])

  const number = /^\d+$/.test(numberText.trim()) ? Number(numberText) : null
  const validNumber = number !== null && Number.isSafeInteger(number) && number >= 1 && number <= 65535 ? number : null
  const finalName = validNumber !== null && label.trim() ? blockDisplayName(kind, label, validNumber) : ''
  const nameError = !label.trim() ? 'Indique um nome para o bloco.' : null
  const numberError = validNumber === null ? `Use um inteiro entre 1 e 65535 para o número do ${kind}.`
    : usedBlockNumbers(files, kind).has(validNumber) ? `O número ${kind} ${validNumber} já está atribuído ou reservado.` : null
  const collisionError = !nameError && !numberError ? validateBlock({ name: finalName, number, kind, files }) : null
  const error = nameError ?? numberError ?? collisionError
  const nextFree = suggestNumber(files, kind)
  const templateNumberChanged = kind === 'OB' && validNumber !== null && template.number !== validNumber
  const isSource = kind !== 'DB' && !BLOCK_LANGUAGES[language].executes
  const scheduleTitle = kind === 'DB' ? 'Dados partilhados' : isSource ? 'Fonte de texto' : kind === 'OB' && validNumber === 100 ? 'No arranque do PLC'
    : kind === 'OB' && validNumber !== null && (validNumber <= 7 || (validNumber >= 30 && validNumber <= 38)) ? 'Em cada ciclo do PLC' : 'Por chamada CALL'
  const scheduleHint = kind === 'DB' ? 'Inclui Enable (BOOL), Count (INT) e Setpoint (REAL), prontos a editar.'
    : isSource ? 'O texto fica guardado em Fontes externas. A compilação e a execução desta fonte não estão disponíveis.'
      : validNumber === null ? 'Defina um número válido para confirmar como este bloco será executado.'
        : kind === 'OB' && validNumber === 100 ? 'Executa uma vez quando a simulação entra em RUN.'
          : kind === 'OB' && (validNumber <= 7 || (validNumber >= 30 && validNumber <= 38)) ? 'Executa após o programa principal Main [OB 1], em todos os ciclos da simulação.'
            : kind === 'OB' ? 'Execute com CALL a partir de outro bloco. Os eventos de hardware e de tempo não são gerados automaticamente.'
              : 'Execute com CALL a partir do Main ou de outro bloco. Não executa automaticamente.'

  const confirm = () => {
    if (error || validNumber === null) return
    const plan = planBlock({ kind, language, name: finalName, number: validNumber })
    const id = useSimStore.getState().addProjectFile(plan.folder, plan.name)
    if (!id) { setCreationError('Não foi possível criar o bloco. Verifique se existe um PLC selecionado e tente novamente.'); return }
    useSimStore.getState().updateProjectFile(id, { content: plan.content, rungs: plan.rungs, exec: plan.exec })
    onCreated(id, plan.folder, plan.name)
    onClose()
  }

  const obTree = useMemo(() => {
    type Sub = { id: string; subtitle?: string; items: ObTemplate[] }
    const byTitle = new Map<string, Sub[]>()
    for (const group of [OB_CYCLE_GROUP, ...OB_GROUPS]) {
      const subs = byTitle.get(group.title) ?? []
      subs.push({ id: `${group.title}/${group.subtitle ?? 'items'}`, subtitle: group.subtitle, items: group.items })
      byTitle.set(group.title, subs)
    }
    return [...byTitle].map(([title, subs]) => ({ id: title, title, subs }))
  }, [])
  const query = foldText(search.trim())
  const filteredTree = obTree.map((folder) => ({ ...folder, subs: folder.subs.map((sub) => ({ ...sub,
    items: sub.items.filter((item) => foldText(`${folder.title} ${sub.subtitle ?? ''} ${item.label} OB ${item.number} OB${item.number}`).includes(query)),
  })).filter((sub) => sub.items.length) })).filter((folder) => folder.subs.length)
  const matchCount = filteredTree.reduce((count, folder) => count + folder.subs.reduce((total, sub) => total + sub.items.length, 0), 0)

  return (
    <Modal open={open} onClose={onClose} width={940} title="Adicionar novo bloco"
      subtitle="Escolha o tipo de bloco e configure a sua criação no PLC selecionado."
      className="add-block-modal" bodyClassName="add-block-modal-body" keyboardScope onConfirm={confirm}
      icon={<span className="dc-modal-ico-badge"><IconPlus size={17} /></span>}
      footer={<>
        <span className="add-block-footer-hint"><kbd>Esc</kbd> cancelar <span>·</span> <kbd>Ctrl/⌘ Enter</kbd> criar</span>
        <button type="button" className="dc-btn" onClick={onClose}>Cancelar</button>
        <button type="button" className="dc-btn dc-btn-primary" disabled={!!error} onClick={confirm} aria-keyshortcuts="Control+Enter Meta+Enter"><IconPlus size={13} /> Criar bloco</button>
      </>}>
      <div className="add-block">
        <div className="add-block-types" role="radiogroup" aria-label="Tipo de bloco">
          {kinds.map((item, index) => (
            <button key={item} type="button" role="radio" aria-checked={kind === item} tabIndex={kind === item ? 0 : -1}
              className={`add-block-type ${kind === item ? 'is-active' : ''}`} onClick={() => pickKind(item)}
              onKeyDown={(event) => {
                const delta = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 0
                if (!delta && event.key !== 'Home' && event.key !== 'End') return
                event.preventDefault()
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? kinds.length - 1 : (index + delta + kinds.length) % kinds.length
                pickKind(kinds[next])
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus()
              }}>
              <span className={`add-block-tile is-${item.toLowerCase()}`}>{item}</span>
              <span className="add-block-type-text"><strong>{BLOCK_KINDS[item].label}</strong><small>{typeHints[item]}</small></span>
            </button>
          ))}
        </div>
        <div className="add-block-workspace">
          {kind === 'OB' ? <section className="add-block-catalog" aria-labelledby="block-model-heading">
            <div className="add-block-section-heading"><h3 id="block-model-heading">Modelo de organização</h3><span>{ALL_OB_TEMPLATES.length} modelos</span></div>
            <div className="add-block-search"><IconSearch size={13} /><input type="search" id="block-model-search" aria-label="Pesquisar modelos OB" placeholder="Pesquisar nome, número ou categoria" value={search} onChange={(event) => setSearch(event.target.value)} />
              {search && <button type="button" onClick={() => setSearch('')} aria-label="Limpar pesquisa"><IconClose size={12} /></button>}
            </div>
            <div className="add-block-templates" aria-label="Modelos disponíveis">
              {filteredTree.map((folder) => <FolderRow key={folder.id} title={folder.title} open={!!query || !collapsed.has(folder.id)} onToggle={() => toggleFolder(folder.id)}>
                {folder.subs.map((sub) => sub.subtitle
                  ? <FolderRow key={sub.id} title={sub.subtitle} depth={1} open={!!query || !collapsed.has(sub.id)} onToggle={() => toggleFolder(sub.id)}><ObItemList items={sub.items} depth={2} selected={templateKey} onPick={applyObTemplate} /></FolderRow>
                  : <ObItemList key={sub.id} items={sub.items} selected={templateKey} onPick={applyObTemplate} />)}
              </FolderRow>)}
              {!matchCount && <div className="add-block-empty"><IconSearch size={21} /><strong>Nenhum modelo encontrado</strong><p>Experimente outro nome, número ou categoria.</p><button type="button" className="dc-btn" onClick={() => setSearch('')}>Limpar pesquisa</button></div>}
            </div>
            <div className="add-block-selected-model"><span>Modelo selecionado</span><strong>{template.label} <small>OB {template.number}</small></strong>{query && <span aria-live="polite">{matchCount} {matchCount === 1 ? 'resultado' : 'resultados'}</span>}</div>
          </section> : <section className="add-block-no-model" aria-labelledby="block-no-model-heading">
            <div className="add-block-section-heading"><h3 id="block-no-model-heading">Sem modelo necessário</h3><span>{kind}</span></div>
            <div className="add-block-no-model-panel">
              <span className={`add-block-tile is-${kind.toLowerCase()}`}>{kind}</span>
              <strong>{kind === 'DB' ? 'Estrutura de dados pronta a editar' : 'Configuração direta do bloco'}</strong>
              <p>{kind === 'DB'
                ? 'O bloco de dados é criado com variáveis tipadas e pode ser ajustado após a criação.'
                : `${BLOCK_KINDS[kind].label} não utiliza um modelo de organização. Defina as opções à direita para continuar.`}</p>
            </div>
          </section>}
          <section className="add-block-details" aria-labelledby="block-config-heading">
            <div className="add-block-section-heading"><h3 id="block-config-heading">{kind === 'OB' ? 'Configurar novo bloco' : `Novo ${BLOCK_KINDS[kind].label.toLowerCase()}`}</h3><span>{kind}</span></div>
            {kind !== 'OB' && <p className="add-block-kind-description">{BLOCK_KINDS[kind].hint}</p>}
            <div className="add-block-fields">
              <label className="add-block-field add-block-name"><span>Nome <small>obrigatório</small></span>
                <input id="block-name-input" data-autofocus className="dc-input" value={label} onChange={(event) => updateDraft({ label: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) { event.preventDefault(); confirm() } }} aria-invalid={!!(nameError || collisionError)} aria-describedby={nameError || collisionError ? 'block-name-error' : undefined} placeholder={kind === 'OB' ? template.label : `${kind}_1`} />
                {(nameError || collisionError) && <small className="add-block-error" id="block-name-error" role="alert">{nameError || collisionError}</small>}
              </label>
              <label className="add-block-field"><span>Número {kind}</span>
                <input id="block-number-input" className="dc-input add-block-number" inputMode="numeric" value={numberText} onChange={(event) => updateDraft({ numberText: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) { event.preventDefault(); confirm() } }} aria-invalid={!!numberError} aria-describedby={numberError ? 'block-number-error' : 'block-number-hint'} />
              </label>
              {kind !== 'DB' && <label className="add-block-field add-block-language"><span>Linguagem</span>
                <Select id="block-language-input" aria-label="Linguagem" className="dc-select" value={language} onChange={(event) => setLanguage(event.target.value as BlockLanguage)}>{(Object.keys(BLOCK_LANGUAGES) as BlockLanguage[]).map((item) => <option key={item} value={item}>{languageLabels[item]}</option>)}</Select>
              </label>}
            </div>
            <div className="add-block-number-help" id="block-number-hint">
              {numberError ? <><p id="block-number-error" className="add-block-error" role="alert">{numberError}</p>{nextFree <= 65535 && <button type="button" onClick={() => updateDraft({ numberText: String(nextFree) })}>Usar próximo número livre ({kind} {nextFree})</button>}</>
                : templateNumberChanged ? <p>{template.number === 1 ? 'OB 1 pertence ao programa principal.' : `O modelo usa a referência OB ${template.number}.`} Será criado um novo <strong>OB {validNumber}</strong>.</p>
                  : <p>Identificador único neste PLC · entre 1 e 65535.</p>}
              {kind === 'FC' && <p>FC 1 e FC 2 estão reservados pelo editor.</p>}
            </div>
            <div className="add-block-preview" aria-live="polite"><span className="add-block-preview-caption">O bloco a criar</span>
              <div className="add-block-preview-identity"><span className={`add-block-tile is-sm is-${kind.toLowerCase()}`}>{kind}</span><strong className="add-block-preview-name">{finalName || 'Defina o nome e o número'}</strong></div>
              <div className="add-block-preview-location"><IconFolder size={12} /><span>{kind === 'DB' ? 'Blocos de dados' : isSource ? 'Fontes externas' : 'Blocos de programa'}</span><span>·</span><span>{kind === 'DB' ? 'BOOL / INT / REAL' : isSource ? language : `${language} · 1 network editável`}</span></div>
              <div className="add-block-execution"><strong>{scheduleTitle}</strong><p>{scheduleHint}</p>{kind !== 'DB' && language === 'FBD' && <p>As networks são editadas como LAD equivalente.</p>}</div>
            </div>
            {creationError && <p className="add-block-error" role="alert">{creationError}</p>}
          </section>
        </div>
      </div>
    </Modal>
  )
}

function FolderRow({ title, depth = 0, open, onToggle, children }: { title: string; depth?: number; open: boolean; onToggle: () => void; children?: ReactNode }) {
  return <div className="add-block-folder"><button type="button" className="add-block-folder-row" style={{ paddingLeft: `${8 + depth * 14}px` }} onClick={onToggle} aria-expanded={open}
    onKeyDown={(event) => { if ((event.key === 'ArrowRight' && !open) || (event.key === 'ArrowLeft' && open)) { event.preventDefault(); onToggle() } }}>
    <IconChevronRight size={10} className={`add-block-chev ${open ? 'is-open' : ''}`} />{open ? <IconOpen size={13} className="add-block-folder-ico" /> : <IconFolder size={13} className="add-block-folder-ico" />}<span>{title}</span>
  </button>{open && children}</div>
}

function ObItemList({ items, depth = 1, selected, onPick }: { items: ObTemplate[]; depth?: number; selected: string; onPick: (key: string) => void }) {
  return <>{items.map((item) => <button key={item.key} type="button" className={`add-block-item ${selected === item.key ? 'is-active' : ''}`} style={{ paddingLeft: `${10 + depth * 14}px` }} onClick={() => onPick(item.key)} aria-pressed={selected === item.key}>
    <span className="add-block-item-number">OB {item.number}</span><span className="add-block-item-text">{item.label}</span>{selected === item.key && <IconCheck size={11} />}
  </button>)}</>
}
