import { useSimStore } from '../store/useSimStore'
import type { LadderDataType, LadderTag } from '../types'

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
  const cell = 'bg-transparent outline-none text-neutral-200 w-full px-1 py-0.5'

  return (
    <tr className="border-t border-neutral-800 hover:bg-neutral-900/60">
      <td className="min-w-[120px]">
        <input className={cell} value={tag.name} onChange={(e) => updateTag(tag.id, { name: e.target.value })} placeholder="Nome simbólico" />
      </td>
      <td className="w-16">
        <input className={`${cell} font-mono text-center`} value={tag.address} onChange={(e) => updateTag(tag.id, { address: e.target.value })} />
      </td>
      <td className="w-20">
        <select className={cell} value={tag.dataType} onChange={(e) => updateTag(tag.id, { dataType: e.target.value as LadderDataType })}>
          {DATA_TYPES.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </td>
      <td className="min-w-[140px]">
        <input className={cell} value={tag.comment ?? ''} onChange={(e) => updateTag(tag.id, { comment: e.target.value })} placeholder="Comentário" />
      </td>
      <td className="w-6 text-center">
        <button className="text-red-500/70 hover:text-red-400 text-xs" title="Remover tag" onClick={() => removeTag(tag.id)}>
          ✕
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
    <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-neutral-500 leading-relaxed max-w-[300px]">
          Dê nomes simbólicos aos endereços usados no programa — o endereço (I1, Q1, M1…) continua a
          ser a referência real; a tag é só documentação, como no TIA Portal.
        </p>
        <button
          className="text-[10px] px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 shrink-0"
          title="Cria uma tag (nome = endereço) para todo endereço já usado no programa que ainda não tenha uma"
          onClick={autoDetectTags}
        >
          ⟲ Detectar do programa
        </button>
      </div>

      {SECTIONS.map(({ prefix, title, hint }) => {
        const rows = tags.filter((t) => t.address.toUpperCase().startsWith(prefix)).sort((a, b) => Number(a.address.slice(1)) - Number(b.address.slice(1)) || 0)
        return (
          <div key={prefix} className="border border-neutral-800 rounded-md overflow-hidden">
            <div className="flex items-center justify-between px-2 py-1 bg-neutral-900 border-b border-neutral-800">
              <div>
                <span className="text-xs font-semibold text-neutral-200">{title}</span>
                <span className="text-[10px] text-neutral-500 ml-2">{hint}</span>
              </div>
              <button className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300" onClick={() => addTag(prefix)}>
                + tag
              </button>
            </div>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-neutral-500 text-left">
                  <th className="font-normal px-1 py-0.5">Nome</th>
                  <th className="font-normal px-1 py-0.5">Endereço</th>
                  <th className="font-normal px-1 py-0.5">Tipo</th>
                  <th className="font-normal px-1 py-0.5">Comentário</th>
                  <th className="w-6" />
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <TagRow key={t.id} tag={t} />
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={5} className="text-neutral-600 px-1 py-1 text-[10px]">
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
