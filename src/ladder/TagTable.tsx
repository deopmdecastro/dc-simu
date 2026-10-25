import { useState } from 'react'
import Select from '../ui/Select'
import { useSimStore } from '../store/useSimStore'
import type { LadderDataType, LadderTag } from '../types'
import { IconPlus, IconClose, IconSearch } from '../ui/icons'
import TagSheetActions from '../excel/TagSheetActions'
import { compareTags, type TagPrefix } from '../excel/tagSheet'

/* ------------------------------------------------------------------------ *
 * Tabela de variáveis — mesma UI da «Tabela de sinais» do GRAFCET: nota de
 * contexto, barra de ferramentas com pesquisa + ações (Detetar / Modelo /
 * Exportar / Importar), separadores por área com sublinhado e grelha de
 * linhas editáveis. A edição é IMEDIATA (sem rascunho) e fica disponível nas
 * networks da Main e dos FC — como no TIA Portal, a tag é documentação; o
 * endereço continua a ser a referência real do motor de varredura.
 * ------------------------------------------------------------------------ */

const SECTIONS: { prefix: 'I' | 'Q' | 'M' | 'T' | 'C'; title: string; hint: string }[] = [
  { prefix: 'I', title: 'Entradas (I)', hint: 'Sinais físicos lidos pelo CLP' },
  { prefix: 'Q', title: 'Saídas (Q)', hint: 'Sinais físicos escritos pelo CLP' },
  { prefix: 'M', title: 'Memórias (M)', hint: 'Bits internos auxiliares' },
  { prefix: 'T', title: 'Temporizadores (T)', hint: 'Saída "done" dos blocos TON/TOF/TP' },
  { prefix: 'C', title: 'Contadores (C)', hint: 'Saída "done" dos blocos CTU/CTD' },
]

const DATA_TYPES: LadderDataType[] = ['Bool', 'Time', 'Int', 'Real']

function TagRow({ tag, index }: { tag: LadderTag; index: number }) {
  const updateTag = useSimStore((s) => s.updateTag)
  const removeTag = useSimStore((s) => s.removeTag)

  return (
    <tr>
      <td data-label="Endereço">
        <input className="dc-input grafcet-code-input" aria-label={`Endereço da tag ${tag.name || tag.address}`} value={tag.address} onChange={(e) => updateTag(tag.id, { address: e.target.value })} />
      </td>
      <td data-label="Nome">
        <input className="dc-input" aria-label={`Nome da tag ${tag.address}`} value={tag.name} onChange={(e) => updateTag(tag.id, { name: e.target.value })} placeholder="Nome simbólico" />
      </td>
      <td data-label="Comentário">
        <input className="dc-input" aria-label={`Comentário da tag ${tag.address}`} value={tag.comment ?? ''} onChange={(e) => updateTag(tag.id, { comment: e.target.value })} placeholder="Comentário (opcional)" />
      </td>
      <td data-label="Tipo">
        <Select className="dc-select" aria-label={`Tipo da tag ${tag.address}`} value={tag.dataType} onChange={(e) => updateTag(tag.id, { dataType: e.target.value as LadderDataType })}>
          {DATA_TYPES.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </Select>
      </td>
      <td>
        <button type="button" className="tagtable-remove" title={`Remover tag ${tag.address}`} aria-label={`Remover linha ${index + 1}`} onClick={() => removeTag(tag.id)}>
          ×
        </button>
      </td>
    </tr>
  )
}

export default function TagTable() {
  const tags = useSimStore((s) => s.tags)
  const addTag = useSimStore((s) => s.addTag)
  const autoDetectTags = useSimStore((s) => s.autoDetectTags)
  const setTags = useSimStore((s) => s.setTags)
  const [area, setArea] = useState<'all' | TagPrefix>('all')
  const [query, setQuery] = useState('')
  const [transferNotice, setTransferNotice] = useState('')
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const applyImportedTags = (next: LadderTag[]) => {
    setTags(next)
    setTransferNotice(`${next.length} variável(is) atualizada(s). As sugestões já estão disponíveis em Main e nos blocos FC.`)
  }
  const countFor = (prefix: TagPrefix) => tags.filter((tag) => tag.address.trim().toUpperCase().startsWith(prefix)).length
  const matchesQuery = (tag: LadderTag) => !normalizedQuery || `${tag.address} ${tag.name} ${tag.comment ?? ''} ${tag.dataType}`.toLocaleLowerCase().includes(normalizedQuery)
  const sections = SECTIONS
    .filter(({ prefix }) => area === 'all' || area === prefix)
    .map((section) => ({
      ...section,
      total: countFor(section.prefix),
      rows: tags.filter((tag) => tag.address.trim().toUpperCase().startsWith(section.prefix) && matchesQuery(tag)).sort(compareTags),
    }))
    .filter((section) => !normalizedQuery || section.rows.length > 0 || area === section.prefix)

  return (
    <div className="tagtable">
      <div className="tagtable-toolbar">
        <div className="tagtable-search">
          <label htmlFor="tagtable-search">Pesquisar variáveis</label>
          <div className="tagtable-search-field">
            <IconSearch size={13} />
            <input id="tagtable-search" type="search" className="dc-input" data-initial-focus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Endereço, nome ou comentário…" aria-label="Pesquisar variáveis por endereço, nome ou comentário" />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="Limpar pesquisa" title="Limpar pesquisa"><IconClose size={12} /></button>}
          </div>
        </div>
        <div className="tagtable-actions">
          <button
            type="button"
            className="dc-btn"
            title="Cria uma tag (nome = endereço) para todo endereço já usado na Main e nos FC que ainda não tenha uma. Também acontece automaticamente ao editar o programa."
            onClick={() => { const n = autoDetectTags(); setTransferNotice(n ? `${n} tag(s) criada(s) a partir do programa.` : 'Todos os endereços usados no programa já têm tag.') }}
          >
            ⟲ Detetar no programa
          </button>
          <TagSheetActions tags={tags} context="LADDER · TABELA DE VARIÁVEIS" fileName="variaveis-ladder" onApply={applyImportedTags} />
        </div>
      </div>

      <div className="tagtable-tabs" role="tablist" aria-label="Filtrar variáveis por área">
        <button type="button" role="tab" aria-selected={area === 'all'} className={area === 'all' ? 'is-active' : ''} onClick={() => setArea('all')}>
          Todas <span>{tags.length}</span>
        </button>
        {SECTIONS.map(({ prefix, title }) => (
          <button type="button" role="tab" aria-selected={area === prefix} className={area === prefix ? 'is-active' : ''} key={prefix} onClick={() => setArea(prefix)}>
            {title} <span>{countFor(prefix)}</span>
          </button>
        ))}
      </div>

      {sections.length ? sections.map(({ prefix, title, hint, rows, total }) => (
        <section key={prefix} className="tagtable-section">
          <header className="tagtable-section-head">
            <div className="tagtable-section-title">
              <strong>{title}</strong>
              <span>{rows.length}{normalizedQuery ? ` de ${total}` : ''}</span>
              <small>{hint}</small>
            </div>
            <button type="button" className="dc-btn tagtable-add" onClick={() => addTag(prefix)} aria-label={`Adicionar variável em ${title}`} title={`Adicionar variável em ${title}`}>
              <IconPlus size={11} /> <span>Adicionar variável</span>
            </button>
          </header>
          <div className="tagtable-grid">
            <table aria-label={`Variáveis de ${title}`}>
              <thead>
                <tr>
                  <th scope="col">Endereço</th>
                  <th scope="col">Nome</th>
                  <th scope="col">Comentário</th>
                  <th scope="col">Tipo</th>
                  <th scope="col"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((tag, index) => <TagRow key={tag.id} tag={tag} index={index} />)}
              </tbody>
            </table>
            {!rows.length && (
              <p className="tagtable-empty">
                {normalizedQuery ? 'Nenhuma variável corresponde à pesquisa nesta área.' : 'Ainda não há variáveis nesta área. Adicione uma linha ou detete as variáveis do programa.'}
              </p>
            )}
          </div>
        </section>
      )) : (
        <div className="tagtable-empty-state">
          <strong>Nenhuma variável encontrada</strong>
          <span>Limpe a pesquisa ou escolha outra área para ver as variáveis.</span>
          <button type="button" className="dc-btn" onClick={() => { setQuery(''); setArea('all') }}>Limpar filtros</button>
        </div>
      )}

      {transferNotice && <p className="tagtable-notice" role="status">{transferNotice}</p>}
      <p className="grafcet-property-note">As etiquetas são documentação (endereço continua a ser a referência do programa). As alterações aplicam-se de imediato às networks da Main e dos FC.</p>
    </div>
  )
}
