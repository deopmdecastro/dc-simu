import { useState } from 'react'
import Select from '../ui/Select'
import { useSimStore } from '../store/useSimStore'
import type { LadderDataType, LadderTag } from '../types'
import { IconPlus, IconClose, IconSearch } from '../ui/icons'
import TagSheetActions from '../excel/TagSheetActions'
import { compareTags, type TagPrefix } from '../excel/tagSheet'

/* ------------------------------------------------------------------------ *
 * Tabela de Tags — inspirada na organização do TIA Portal: uma tabela por
 * área de memória (Entradas, Saídas, Memórias, Temporizadores, Contadores),
 * cada linha com Nome, Endereço, Tipo de dados e Comentário. Serve para dar
 * nomes simbólicos aos endereços I/Q/M/T/C usados no programa Ladder — o
 * endereço continua a ser a referência real usada pelo motor de varredura;
 * a tag é só documentação/organização, tal como no TIA.
 * ------------------------------------------------------------------------ */

const SECTIONS: { prefix: 'I' | 'Q' | 'M' | 'T' | 'C'; title: string; hint: string }[] = [
  { prefix: 'I', title: 'Entradas (I)', hint: 'Sinais físicos lidos pelo CLP' },
  { prefix: 'Q', title: 'Saídas (Q)', hint: 'Sinais físicos escritos pelo CLP' },
  { prefix: 'M', title: 'Memórias (M)', hint: 'Bits internos auxiliares' },
  { prefix: 'T', title: 'Temporizadores (T)', hint: 'Saída "done" dos blocos TON/TOF/TP' },
  { prefix: 'C', title: 'Contadores (C)', hint: 'Saída "done" dos blocos CTU/CTD' },
]

const DATA_TYPES: LadderDataType[] = ['Bool', 'Time', 'Int', 'Real']

function TagRow({ tag }: { tag: LadderTag }) {
  const updateTag = useSimStore((s) => s.updateTag)
  const removeTag = useSimStore((s) => s.removeTag)

  return (
    <tr className="ladder-tag-row">
      <td className="ladder-tag-address">
        <input className="ladder-tag-cell-input is-address" aria-label={`Endereço da tag ${tag.name || tag.address}`} value={tag.address} onChange={(e) => updateTag(tag.id, { address: e.target.value })} />
      </td>
      <td className="ladder-tag-name">
        <input className="ladder-tag-cell-input" aria-label={`Nome da tag ${tag.address}`} value={tag.name} onChange={(e) => updateTag(tag.id, { name: e.target.value })} placeholder="Nome simbólico" />
      </td>
      <td className="ladder-tag-comment">
        <input className="ladder-tag-cell-input" aria-label={`Comentário da tag ${tag.address}`} value={tag.comment ?? ''} onChange={(e) => updateTag(tag.id, { comment: e.target.value })} placeholder="Comentário (opcional)" />
      </td>
      <td className="ladder-tag-type">
        <Select className="ladder-tag-cell-input" aria-label={`Tipo da tag ${tag.address}`} value={tag.dataType} onChange={(e) => updateTag(tag.id, { dataType: e.target.value as LadderDataType })}>
          {DATA_TYPES.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </Select>
      </td>
      <td className="ladder-tag-remove">
        <button type="button" className="ladder-tag-remove-button" title={`Remover tag ${tag.address}`} aria-label={`Remover tag ${tag.address}`} onClick={() => removeTag(tag.id)}>
          <IconClose size={11} />
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
    <div className="ladder-tag-table">
      <header className="ladder-tag-table-header">
        <div className="ladder-tag-table-heading">
          <div className="ladder-tag-title-row">
            <strong>Tabela de Tags</strong>
            <span className="ladder-tag-total" aria-label={`${tags.length} variáveis declaradas`}>{tags.length} variável(is)</span>
          </div>
          <span>Importe, filtre e mantenha as variáveis do PLC. As alterações ficam disponíveis de imediato nas networks da Main e dos FC.</span>
          {transferNotice && <small className="ladder-tag-transfer-notice" role="status">{transferNotice}</small>}
        </div>
        <div className="ladder-tag-table-actions">
          <button
            type="button"
            className="dc-btn"
            title="Cria uma tag (nome = endereço) para todo endereço já usado no programa que ainda não tenha uma"
            onClick={() => { autoDetectTags(); setTransferNotice('Endereços usados no programa verificados.'); }}
          >
            ⟲ Detetar no programa
          </button>
          <TagSheetActions className="ladder-tag-transfer" tags={tags} context="LADDER · TABELA DE VARIÁVEIS" fileName="variaveis-ladder" onApply={applyImportedTags} />
        </div>
      </header>

      <div className="ladder-tag-tools">
        <label className="ladder-tag-search">
          <IconSearch size={13} />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Endereço, nome ou comentário…" aria-label="Pesquisar tags por endereço, nome ou comentário" />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="Limpar pesquisa de tags" title="Limpar pesquisa"><IconClose size={12} /></button>}
        </label>
        <div className="ladder-tag-area-tabs" role="group" aria-label="Filtrar tags por área">
          <button type="button" aria-pressed={area === 'all'} className={area === 'all' ? 'is-active' : ''} onClick={() => setArea('all')}>
            Todas <span>{tags.length}</span>
          </button>
          {SECTIONS.map(({ prefix, title }) => (
            <button type="button" aria-pressed={area === prefix} className={area === prefix ? 'is-active' : ''} key={prefix} onClick={() => setArea(prefix)}>
              {title} <span>{countFor(prefix)}</span>
            </button>
          ))}
        </div>
      </div>

      {sections.length ? sections.map(({ prefix, title, hint, rows, total }) => {
        return (
          <section key={prefix} className="ladder-tag-section">
            <header className="ladder-tag-section-header">
              <div className="ladder-tag-section-title">
                <strong>{title}</strong>
                <span>{rows.length}{normalizedQuery ? ` de ${total}` : ''}</span>
                <small>{hint}</small>
              </div>
              <button type="button" className="dc-btn ladder-tag-add" onClick={() => addTag(prefix)} aria-label={`Adicionar tag em ${title}`} title={`Adicionar tag em ${title}`}>
                <IconPlus size={11} /> <span>Adicionar tag</span>
              </button>
            </header>
            <div className="ladder-tag-table-scroll">
              <table className="ladder-tag-grid-table" aria-label={`Tags de ${title}`}>
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
                  {rows.map((tag) => <TagRow key={tag.id} tag={tag} />)}
                  {!rows.length && (
                    <tr>
                      <td colSpan={5} className="ladder-tag-empty-row">
                        {normalizedQuery ? 'Nenhuma tag corresponde à pesquisa nesta área.' : 'Nenhuma tag nesta área. Importe uma tabela ou adicione uma tag.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )
      }) : (
        <div className="ladder-tag-empty-state">
          <strong>Nenhuma tag encontrada</strong>
          <span>Limpe a pesquisa ou escolha outra área para ver as variáveis.</span>
          <button type="button" className="dc-btn" onClick={() => { setQuery(''); setArea('all') }}>Limpar filtros</button>
        </div>
      )}
    </div>
  )
}
