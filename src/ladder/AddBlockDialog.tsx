import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Modal from '../ui/Modal'
import Select from '../ui/Select'
import { useSimStore } from '../store/useSimStore'
import type { ProjectFile, ProjectFolder } from './projectFiles'
import {
  ALL_OB_TEMPLATES, BLOCK_KINDS, BLOCK_LANGUAGES, OB_CYCLE_GROUP, OB_GROUPS, OB_KIND_DESCRIPTION,
  blockDisplayName, planBlock, suggestLabel, suggestNumber, validateBlock,
  type BlockKind, type BlockLanguage, type ObTemplate,
} from './blockCatalog'
import { IconChevronRight, IconCube, IconFolder, IconFunction, IconGrid, IconLadder, IconOpen } from '../ui/icons'

/**
 * Modal «Adicionar novo bloco» do editor Ladder — o equivalente ao
 * «Add new block» do TIA Portal: tipo (OB/FB/FC/DB) à esquerda, modelo ao
 * centro (árvore de OBs cíclicos, de arranque, interrupções…) e nome,
 * linguagem e número à direita.
 *
 * Funcional, não decorativa: cria o ficheiro no PLC ativo (store), já com
 * conteúdo inicial — networks editáveis para LAD/FBD, variáveis de exemplo
 * para DBs e cabeçalho de texto para SCL/ST/STL — e aplica a semântica de
 * execução (OB cíclico corre em todos os scans, OB de arranque uma vez por
 * RUN, FC/FB via CALL).
 */
export default function AddBlockDialog({ open, initialKind = 'OB', onClose, onCreated, files }: {
  open: boolean
  initialKind?: BlockKind
  onClose: () => void
  /** chamado com o ficheiro criado, para o editor o abrir logo */
  onCreated: (id: string, folder: ProjectFolder, name: string) => void
  /** ficheiros do PLC ativo — usados para nomes/números únicos */
  files: ProjectFile[]
}) {
  const [kind, setKind] = useState<BlockKind>(initialKind)
  const [templateKey, setTemplateKey] = useState(ALL_OB_TEMPLATES[0].key)
  const [label, setLabel] = useState(ALL_OB_TEMPLATES[0].label)
  const [numberText, setNumberText] = useState(String(ALL_OB_TEMPLATES[0].number))
  const [language, setLanguage] = useState<BlockLanguage>('LAD')

  const template = useMemo(
    () => ALL_OB_TEMPLATES.find((t) => t.key === templateKey) ?? ALL_OB_TEMPLATES[0],
    [templateKey],
  )

  const applyObTemplate = (key: string) => {
    const next = ALL_OB_TEMPLATES.find((t) => t.key === key) ?? ALL_OB_TEMPLATES[0]
    setTemplateKey(next.key)
    setLabel(next.label)
    setNumberText(String(suggestNumber(files, 'OB', next.number)))
  }

  const pickKind = (next: BlockKind) => {
    setKind(next)
    if (next === 'OB') applyObTemplate(templateKey)
    else {
      setLabel(suggestLabel(files, next))
      setNumberText(String(suggestNumber(files, next)))
    }
  }

  // pastas da árvore abertas/fechadas — controladas (senão cada tecla nos
  // campos fechava as pastas que o utilizador tinha aberto)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggleFolder = (id: string) =>
    setCollapsed((cur) => { const next = new Set(cur); if (next.has(id)) next.delete(id); else next.add(id); return next })
  useEffect(() => {
    if (!open) return
    setLanguage('LAD')
    setKind(initialKind)
    setTemplateKey(ALL_OB_TEMPLATES[0].key)
    if (initialKind === 'OB') {
      setLabel(ALL_OB_TEMPLATES[0].label)
      setNumberText(String(suggestNumber(files, 'OB', ALL_OB_TEMPLATES[0].number)))
    } else {
      setLabel(suggestLabel(files, initialKind))
      setNumberText(String(suggestNumber(files, initialKind)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialKind])

  const number = numberText.trim() === '' ? null : Number(numberText)
  const validNumber = number !== null && Number.isSafeInteger(number) && number >= 1 ? number : null
  const finalName = validNumber !== null ? blockDisplayName(kind, label, validNumber) : label
  const error = validateBlock({ name: finalName, number, kind, files })

  const confirm = () => {
    if (error || validNumber === null) return
    const plan = planBlock({ kind, language, name: finalName, number: validNumber })
    const id = useSimStore.getState().addProjectFile(plan.folder, plan.name)
    if (!id) return
    useSimStore.getState().updateProjectFile(id, { content: plan.content, rungs: plan.rungs, exec: plan.exec })
    onCreated(id, plan.folder, plan.name)
    onClose()
  }

  /** Árvore de pastas dos modelos de OB (1.º nível por tema, 2.º por sub-tema). */
  const obTree = useMemo(() => {
    type Sub = { id: string; subtitle?: string; items: ObTemplate[] }
    const byTitle = new Map<string, Sub[]>()
    for (const group of OB_GROUPS) {
      const subs = byTitle.get(group.title) ?? []
      subs.push({ id: group.subtitle ? `${group.title}/${group.subtitle}` : `${group.title}#${subs.length}`, subtitle: group.subtitle, items: group.items })
      byTitle.set(group.title, subs)
    }
    const tree = [...byTitle].map(([title, subs]) => ({ id: title, title, subs }))
    tree.unshift({ id: OB_CYCLE_GROUP.title, title: OB_CYCLE_GROUP.title, subs: [{ id: OB_CYCLE_GROUP.title, items: OB_CYCLE_GROUP.items }] })
    return tree
  }, [])

  const scheduleHint = kind === 'OB'
    ? validNumber === 100
      ? 'Executa uma vez, quando a simulação entra em RUN (arranque do PLC).'
      : validNumber !== null && (validNumber <= 7 || (validNumber >= 30 && validNumber <= 38))
        ? 'Executa em todos os ciclos do PLC, logo após o programa principal (Main [OB1]).'
        : 'Executado por CALL a partir de outro bloco — o simulador não gera o evento de hardware/hora.'
    : kind === 'DB'
      ? 'As variáveis ficam disponíveis como Nome.Variável nas instruções MOVE e nos contactos BOOL.'
      : 'Não corre sozinho: execute-o com a instrução CALL a partir do Main ou de outro bloco.'

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={880}
      title="Adicionar novo bloco"
      subtitle="Cria um bloco no PLC selecionado — pronto a editar e a simular"
      icon={<span className={`add-block-tile is-${kind.toLowerCase()}`}>{kind === 'DB' ? <IconGrid size={16} /> : kind}</span>}
      footer={<>
        {error && <span className="add-block-error" role="alert">{error}</span>}
        <button type="button" className="dc-btn" onClick={onClose}>Cancelar</button>
        <button type="button" className="dc-btn dc-btn-primary" disabled={!!error} onClick={confirm}>OK</button>
      </>}
    >
      <div className="add-block">
        {/* -------------------------------------------------- tipo de bloco */}
        <div className="add-block-types" role="radiogroup" aria-label="Tipo de bloco">
          {(Object.keys(BLOCK_KINDS) as BlockKind[]).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              className={`add-block-type ${kind === k ? 'is-active' : ''}`}
              onClick={() => pickKind(k)}
            >
              <span className={`add-block-tile is-${k.toLowerCase()}`}>
                {k === 'OB' ? <IconLadder size={15} className="add-block-tile-bg" />
                  : k === 'FB' ? <IconFunction size={15} className="add-block-tile-bg" />
                  : k === 'FC' ? <IconCube size={15} className="add-block-tile-bg" />
                  : <IconGrid size={15} className="add-block-tile-bg" />}
                {k}
              </span>
              <span className="add-block-type-text">
                <strong>{BLOCK_KINDS[k].label}</strong>
                <small>{k}</small>
              </span>
            </button>
          ))}
        </div>

        {/* ------------------------------------------------- lista de modelos */}
        <div className="add-block-templates" aria-label="Modelos disponíveis">
          {kind === 'OB' ? (
            obTree.map((folder) => (
              <FolderRow
                key={folder.id}
                title={folder.title}
                open={!collapsed.has(folder.id)}
                onToggle={() => toggleFolder(folder.id)}
              >
                {folder.subs.map((sub) =>
                  sub.subtitle ? (
                    <FolderRow
                      key={sub.id}
                      title={sub.subtitle}
                      depth={1}
                      open={!collapsed.has(sub.id)}
                      onToggle={() => toggleFolder(sub.id)}
                    >
                      <ObItemList items={sub.items} depth={2} selected={templateKey} onPick={applyObTemplate} />
                    </FolderRow>
                  ) : (
                    <ObItemList key={sub.id} items={sub.items} depth={1} selected={templateKey} onPick={applyObTemplate} />
                  ),
                )}
              </FolderRow>
            ))
          ) : (
            <div className="add-block-item is-active">
              <span className={`add-block-tile is-sm is-${kind.toLowerCase()}`}>{kind}</span>
              <span className="add-block-item-text">Novo {BLOCK_KINDS[kind].label.toLowerCase()}</span>
            </div>
          )}
        </div>

        {/* ---------------------------------------------------------- detalhes */}
        <div className="add-block-details">
          <label className="add-block-field">
            <span className="dc-field-label">Nome:</span>
            <input
              data-autofocus
              className="dc-input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !error) confirm() }}
              placeholder={kind === 'DB' ? 'Data_block_1' : kind === 'FB' ? 'FB_1' : kind === 'FC' ? 'FC_3' : template.label}
            />
          </label>
          <label className="add-block-field">
            <span className="dc-field-label">Linguagem:</span>
            <Select className="dc-select" value={language} onChange={(e) => setLanguage(e.target.value as BlockLanguage)}>
              {(Object.keys(BLOCK_LANGUAGES) as BlockLanguage[]).map((l) => <option key={l} value={l}>{l}</option>)}
            </Select>
          </label>
          <label className="add-block-field">
            <span className="dc-field-label">{`Núm. ${kind}:`}</span>
            <input
              className="dc-input"
              inputMode="numeric"
              value={numberText}
              onChange={(e) => setNumberText(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter' && !error) confirm() }}
            />
          </label>
          <div className="add-block-preview">
            <span className="dc-field-label">Fica guardado como</span>
            <strong className="add-block-preview-name">{error || !finalName.trim() ? '—' : finalName}</strong>
            <small>{planPreview(kind, language)}</small>
          </div>
          <div className="add-block-desc">
            <strong>Descrição</strong>
            <p>{kind === 'OB' ? OB_KIND_DESCRIPTION : BLOCK_KINDS[kind].hint}</p>
            <p className="add-block-schedule">{BLOCK_LANGUAGES[language].executes ? scheduleHint : BLOCK_LANGUAGES[language].hint}</p>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function planPreview(kind: BlockKind, language: BlockLanguage): string {
  if (kind === 'DB') return 'em «Blocos de dados», com variáveis de exemplo'
  if (language !== 'LAD' && language !== 'FBD') return 'em «Fontes externas», como texto (não compilável)'
  return 'em «Blocos de programa», com uma network editável'
}

/** Pasta da árvore (abrir/fechar real): chevron + ícone de pasta aberta/fechada. */
function FolderRow({ title, depth = 0, open, onToggle, children }: {
  title: string
  depth?: number
  open: boolean
  onToggle: () => void
  children?: ReactNode
}) {
  return (
    <div className="add-block-folder">
      <button
        type="button"
        className="add-block-folder-row"
        style={{ paddingLeft: `${6 + depth * 16}px` }}
        onClick={onToggle}
        aria-expanded={open}
      >
        <IconChevronRight size={9} className={`add-block-chev ${open ? 'is-open' : ''}`} />
        {open
          ? <IconOpen size={13} className="add-block-folder-ico" />
          : <IconFolder size={13} className="add-block-folder-ico" />}
        <span>{title}</span>
      </button>
      {open && children}
    </div>
  )
}

/** Modelos de OB por baixo de uma pasta. */
function ObItemList({ items, depth = 1, selected, onPick }: {
  items: ObTemplate[]
  depth?: number
  selected: string
  onPick: (key: string) => void
}) {
  return (
    <>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`add-block-item ${selected === item.key ? 'is-active' : ''}`}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
          onClick={() => onPick(item.key)}
        >
          <span className="add-block-tile is-sm is-ob">OB</span>
          <span className="add-block-item-text">{item.label} <em>[OB {item.number}]</em></span>
        </button>
      ))}
    </>
  )
}
