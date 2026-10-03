import Select from '../ui/Select'
import { useSimStore } from '../store/useSimStore'
import type { LadderDataType, LadderTag } from '../types'
import { IconPlus, IconClose } from '../ui/icons'

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
  const cell = 'bg-transparent outline-none text-ink-900 w-full px-1 py-0.5 rounded focus:bg-brand-50'

  return (
    <tr className="border-t border-line-soft hover:bg-brand-50/40">
      <td className="min-w-[120px]">
        <input className={cell} value={tag.name} onChange={(e) => updateTag(tag.id, { name: e.target.value })} placeholder="Nome simbólico" />
      </td>
      <td className="w-16">
        <input className={`${cell} font-mono text-center`} value={tag.address} onChange={(e) => updateTag(tag.id, { address: e.target.value })} />
      </td>
      <td className="w-20">
        <Select className={cell} value={tag.dataType} onChange={(e) => updateTag(tag.id, { dataType: e.target.value as LadderDataType })}>
          {DATA_TYPES.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </Select>
      </td>
      <td className="min-w-[140px]">
        <input className={cell} value={tag.comment ?? ''} onChange={(e) => updateTag(tag.id, { comment: e.target.value })} placeholder="Comentário" />
      </td>
      <td className="w-6 text-center">
        <button className="text-ink-300 hover:text-state-error text-xs" title="Remover tag" onClick={() => removeTag(tag.id)}>
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

  return (
    <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4 min-h-0 bg-surface-panel">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-ink-500 leading-relaxed">
          Dê nomes simbólicos aos endereços usados no programa — o endereço (I1, Q1, M1…) continua a
          ser a referência real; a tag é só documentação, como no TIA Portal.
        </p>
        <button
          className="dc-btn shrink-0"
          title="Cria uma tag (nome = endereço) para todo endereço já usado no programa que ainda não tenha uma"
          onClick={() => autoDetectTags()}
        >
          ⟲ Detectar do programa
        </button>
      </div>

      {SECTIONS.map(({ prefix, title, hint }) => {
        const rows = tags.filter((t) => t.address.toUpperCase().startsWith(prefix)).sort((a, b) => Number(a.address.slice(1)) - Number(b.address.slice(1)) || 0)
        return (
          <div key={prefix} className="border border-line rounded-md overflow-hidden bg-white shadow-xs">
            <div className="flex items-center justify-between px-2 py-1.5 bg-surface-rail border-b border-line">
              <div>
                <span className="text-xs font-semibold text-ink-900">{title}</span>
                <span className="text-[10px] text-ink-400 ml-2">{hint}</span>
              </div>
              <button className="dc-btn !h-5 !px-1.5 !text-[10px]" onClick={() => addTag(prefix)}>
                <IconPlus size={10} /> tag
              </button>
            </div>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-ink-400 text-left bg-white">
                  <th className="font-medium px-1 py-0.5">Nome</th>
                  <th className="font-medium px-1 py-0.5">Endereço</th>
                  <th className="font-medium px-1 py-0.5">Tipo</th>
                  <th className="font-medium px-1 py-0.5">Comentário</th>
                  <th className="w-6" />
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <TagRow key={t.id} tag={t} />
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={5} className="text-ink-300 px-1 py-1 text-[10px]">
                      Nenhuma tag nesta área.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}
