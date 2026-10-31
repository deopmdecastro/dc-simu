/**
 * Biblioteca de símbolos IEC 60617 para o Editor 3D de componentes.
 * Lista os CmdKind oficiais e os símbolos personalizados do componente atual.
 */
import { useMemo, useState } from 'react'
import { CMD_PALETTE, CMD_PARTS, type CmdKind } from '../../commands/model'
import { CmdSymbol } from '../../commands/symbols'
import type { IecSymbolDef } from '../../catalog/types'
import { newId } from '../../catalog/definition'
import { useEditorStore } from './editorStore'
import { IconCheck, IconCopy, IconPlus, IconSearch } from '../../ui/icons'

function Thumb({ kind, tag }: { kind: CmdKind; tag?: string }) {
  const part = useMemo(
    () => ({ id: kind, kind, x: 0, y: 0, rot: 0 as const, tag: tag ?? (CMD_PARTS[kind].prefix || 'X') }),
    [kind, tag],
  )
  const box = CMD_PARTS[kind].box
  const pad = 10
  return (
    <svg
      className="ce-iec-lib-svg"
      viewBox={`${box.x - pad} ${box.y - pad} ${box.w + pad * 2} ${box.h + pad * 2}`}
      width="56"
      height="56"
      aria-hidden
    >
      <CmdSymbol part={part} state={{ idle: true }} showTerminals={false} />
    </svg>
  )
}

function emptyCustom(basedOn?: CmdKind): IecSymbolDef {
  const base = basedOn && CMD_PARTS[basedOn]
  return {
    id: newId('iec_'),
    label: base?.label ?? 'Símbolo personalizado',
    basedOn,
    prefix: base?.prefix ?? 'X',
    terminals: base ? base.terminals.map((t) => ({ ...t })) : [{ x: 0, y: 0, label: '1' }, { x: 0, y: 60, label: '2' }],
    poles: base ? base.poles.map((p) => [...p] as [number, number]) : [[0, 1]],
    box: base ? { ...base.box } : { x: -12, y: 0, w: 24, h: 60 },
  }
}

export default function IecSymbolLibrary() {
  const meta = useEditorStore((s) => s.meta)
  const def = useEditorStore((s) => s.def)
  const editMeta = useEditorStore((s) => s.editMeta)
  const edit = useEditorStore((s) => s.edit)
  const set = useEditorStore((s) => s.set)

  const primary = meta.iecSymbol || def.iec?.primary || ''
  const related = meta.iecRelated ?? def.iec?.related ?? []
  const customs = def.iec?.symbols ?? []

  const [filter, setFilter] = useState('')
  const [family, setFamily] = useState<string>('all')

  const flash = (text: string) => window.dispatchEvent(new CustomEvent('ce-flash', { detail: text }))

  const setPrimary = (kind: CmdKind) => {
    editMeta({ iecSymbol: kind }, 'iec')
    edit((d) => ({ ...d, iec: { ...(d.iec ?? {}), primary: kind } }))
    set({ tab: 'iec' })
    flash(`Símbolo principal: ${CMD_PARTS[kind].label}`)
  }

  const toggleRelated = (kind: CmdKind) => {
    const next = related.includes(kind) ? related.filter((k) => k !== kind) : [...related, kind]
    editMeta({ iecRelated: next.length ? next : undefined }, 'iec')
    edit((d) => ({ ...d, iec: { ...(d.iec ?? {}), related: next.length ? next : undefined } }))
    flash(next.includes(kind) ? `Relacionado: ${CMD_PARTS[kind].label}` : `Removido: ${CMD_PARTS[kind].label}`)
  }

  const addCustom = (basedOn?: CmdKind) => {
    const symbol = emptyCustom(basedOn)
    edit((d) => ({ ...d, iec: { ...(d.iec ?? {}), symbols: [...(d.iec?.symbols ?? []), symbol] } }))
    set({ tab: 'iec' })
    flash(`Símbolo personalizado criado${basedOn ? ` a partir de ${CMD_PARTS[basedOn].label}` : ''}`)
  }

  const q = filter.trim().toLowerCase()
  const groups = useMemo(() => {
    return CMD_PALETTE
      .filter((g) => family === 'all' || g.title === family)
      .map((g) => ({
        ...g,
        kinds: g.kinds.filter((k) => {
          if (!q) return true
          const def = CMD_PARTS[k]
          return (
            def.label.toLowerCase().includes(q) ||
            def.hint.toLowerCase().includes(q) ||
            k.toLowerCase().includes(q) ||
            def.prefix.toLowerCase().includes(q)
          )
        }),
      }))
      .filter((g) => g.kinds.length > 0)
  }, [family, q])

  return (
    <div className="ce-iec-symlib">
      <div className="ce-iec-symlib-toolbar">
        <label className="ce-iec-symlib-search">
          <IconSearch size={12} />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Procurar símbolo IEC…"
            aria-label="Procurar símbolo IEC"
          />
        </label>
        <select
          className="dx-input ce-iec-symlib-family"
          value={family}
          onChange={(e) => setFamily(e.target.value)}
          aria-label="Família de símbolos"
        >
          <option value="all">Todas as famílias</option>
          {CMD_PALETTE.map((g) => (
            <option key={g.title} value={g.title}>
              {g.title}
            </option>
          ))}
        </select>
      </div>

      {primary ? (
        <div className="ce-iec-symlib-current">
          <span className="ce-iec-symlib-current-label">Principal</span>
          {primary in CMD_PARTS ? (
            <>
              <Thumb kind={primary as CmdKind} />
              <div className="min-w-0">
                <strong className="block text-[12px] truncate">{CMD_PARTS[primary as CmdKind].label}</strong>
                <span className="block text-[10px] text-ink-400 truncate">{CMD_PARTS[primary as CmdKind].hint}</span>
              </div>
            </>
          ) : (
            <span className="text-[11px] text-ink-500">{primary}</span>
          )}
        </div>
      ) : (
        <p className="ce-hint" style={{ margin: '0 0 8px' }}>
          Ainda sem símbolo principal. Escolha um abaixo ou crie um personalizado.
        </p>
      )}

      <div className="ce-actions" style={{ marginBottom: 8 }}>
        <button type="button" className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => addCustom()}>
          <IconPlus size={12} /> Novo símbolo personalizado
        </button>
      </div>

      {customs.length > 0 && (
        <section className="ce-iec-symlib-section">
          <h4>Personalizados neste componente ({customs.length})</h4>
          <div className="ce-iec-symlib-grid">
            {customs.map((s) => {
              const base = (s.basedOn && s.basedOn in CMD_PARTS ? s.basedOn : 'node') as CmdKind
              return (
                <div key={s.id} className="ce-iec-symlib-tile">
                  <Thumb kind={base} tag={s.prefix} />
                  <span className="ce-iec-symlib-name">{s.label}</span>
                  <button type="button" className="ce-linkbtn" onClick={() => set({ tab: 'iec' })}>
                    Abrir no editor
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {groups.length === 0 && <p className="ce-empty">Nenhum símbolo corresponde à procura.</p>}

      {groups.map((group) => (
        <section key={group.title} className="ce-iec-symlib-section">
          <h4>{group.title}</h4>
          <div className="ce-iec-symlib-grid">
            {group.kinds.map((k) => {
              const isPrimary = primary === k
              const isRelated = related.includes(k)
              return (
                <div key={k} className={`ce-iec-symlib-tile${isPrimary ? ' is-primary' : ''}${isRelated ? ' is-related' : ''}`}>
                  <Thumb kind={k} />
                  <span className="ce-iec-symlib-name">{CMD_PARTS[k].label}</span>
                  <span className="ce-iec-symlib-code">{k}</span>
                  <div className="ce-iec-symlib-actions">
                    <button type="button" className="ce-linkbtn" onClick={() => setPrimary(k)} title="Definir como símbolo principal">
                      {isPrimary ? <><IconCheck size={11} /> Principal</> : 'Usar'}
                    </button>
                    <button
                      type="button"
                      className={`ce-linkbtn${isRelated ? ' is-on' : ''}`}
                      onClick={() => toggleRelated(k)}
                      title="Marcar como símbolo relacionado"
                    >
                      {isRelated ? 'Relacionado' : '+ Rel.'}
                    </button>
                    <button type="button" className="ce-linkbtn" onClick={() => addCustom(k)} title="Criar cópia editável">
                      <IconCopy size={11} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
