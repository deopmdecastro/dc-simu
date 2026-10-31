/**
 * Aba «Símbolo IEC» no Editor 3D de componentes.
 * - Associar o modelo 3D a um (ou vários) símbolos IEC 60617
 * - Pré-visualizar e simular estados (aberto/fechado, energizado, trip…)
 * - Criar / editar símbolos personalizados (bornes, pólos, caixa, prefixo)
 */
import { useMemo, useState } from 'react'
import { CMD_PALETTE, CMD_PARTS, type CmdKind, type CmdPart } from '../../commands/model'
import { CmdSymbol, type CmdSymbolState } from '../../commands/symbols'
import type { IecDef, IecSymbolDef, IecTerminalDef } from '../../catalog/types'
import { newId } from '../../catalog/definition'
import { Section, Field, Select, Text, Num, Empty, Check } from './ui'
import { useEditorStore } from './editorStore'
import { IconPlus, IconDelete, IconCopy, IconPlay, IconPause } from '../../ui/icons'

const ALL_KINDS = Object.keys(CMD_PARTS) as CmdKind[]
const KIND_OPTIONS: Array<[string, string]> = [
  ['', '— nenhum —'],
  ...ALL_KINDS.map((k) => [k, `${CMD_PARTS[k].label} (${k})`] as [string, string]),
]

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

function toCmdPart(kind: CmdKind | string, custom?: IecSymbolDef): CmdPart {
  if (custom) {
    return {
      id: custom.id,
      kind: (custom.basedOn && custom.basedOn in CMD_PARTS ? custom.basedOn : 'node') as CmdKind,
      x: 0,
      y: 0,
      rot: 0,
      tag: custom.prefix || 'X',
    }
  }
  return { id: 'preview', kind: kind as CmdKind, x: 0, y: 0, rot: 0, tag: CMD_PARTS[kind as CmdKind]?.prefix || 'X' }
}

/** Pré-visualização SVG do símbolo com estado de simulação. */
function SymbolPreview({
  kind,
  custom,
  state,
  size = 160,
}: {
  kind?: string
  custom?: IecSymbolDef
  state: CmdSymbolState
  size?: number
}) {
  const part = useMemo(() => {
    if (custom) return toCmdPart(custom.basedOn || 'node', custom)
    if (kind && kind in CMD_PARTS) return toCmdPart(kind)
    return null
  }, [kind, custom])

  if (!part) {
    return (
      <div className="ce-iec-preview is-empty" style={{ width: size, height: size }}>
        <span>Sem símbolo</span>
      </div>
    )
  }

  // Caixa de desenho centrada
  const box = custom?.box ?? CMD_PARTS[part.kind]?.box ?? { x: -20, y: -10, w: 40, h: 80 }
  const pad = 16
  const vbX = box.x - pad
  const vbY = box.y - pad
  const vbW = box.w + pad * 2
  const vbH = box.h + pad * 2

  return (
    <div className="ce-iec-preview" style={{ width: size, height: size }}>
      <svg viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} width="100%" height="100%" aria-label={custom?.label || CMD_PARTS[part.kind]?.label}>
        <CmdSymbol part={part} state={state} selected={false} showTerminals />
        {/* Bornes personalizados sobrepostos se custom redefine posições */}
        {custom && custom.terminals.map((t, i) => (
          <g key={i}>
            <circle cx={t.x} cy={t.y} r={3} fill="#fff" stroke="#1e293b" strokeWidth={1.2} />
            {t.label ? (
              <text x={t.x + 6} y={t.y + 3} fontSize={8} fill="#64748b" fontFamily="ui-monospace, monospace">
                {t.label}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </div>
  )
}

function SimControls({ state, onChange }: { state: CmdSymbolState; onChange: (s: CmdSymbolState) => void }) {
  return (
    <div className="ce-iec-sim">
      <span className="ce-iec-sim-label">Simulação</span>
      <div className="ce-iec-sim-row">
        <Check checked={!!state.idle} onChange={(idle) => onChange({ ...state, idle })} label="Repouso (sem cores de estado)" />
        <Check checked={!!state.closed} onChange={(closed) => onChange({ ...state, closed })} label="Fechado / ligado" />
        <Check checked={!!state.energized} onChange={(energized) => onChange({ ...state, energized })} label="Energizado" />
        <Check checked={!!state.lit} onChange={(lit) => onChange({ ...state, lit })} label="Aceso (lâmpada)" />
        <Check checked={!!state.tripped} onChange={(tripped) => onChange({ ...state, tripped })} label="Disparado" />
      </div>
      <div className="ce-iec-sim-row">
        <label className="ce-field">
          <span>Progresso temporizador</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round((state.progress ?? 0) * 100)}
            onChange={(e) => onChange({ ...state, progress: Number(e.target.value) / 100 })}
          />
          <em>{Math.round((state.progress ?? 0) * 100)}%</em>
        </label>
      </div>
    </div>
  )
}

function TerminalEditor({
  terminals,
  onChange,
}: {
  terminals: IecTerminalDef[]
  onChange: (t: IecTerminalDef[]) => void
}) {
  return (
    <div className="ce-iec-terminals">
      <div className="ce-actions" style={{ marginBottom: 6 }}>
        <button
          type="button"
          className="dx-btn dx-btn-secondary dx-btn-sm"
          onClick={() => onChange([...terminals, { x: 0, y: (terminals.length + 1) * 20, label: String(terminals.length + 1) }])}
        >
          <IconPlus size={12} /> Borne
        </button>
      </div>
      {terminals.length === 0 && <Empty>Sem bornes. Adicione pelo menos dois para um pólo.</Empty>}
      {terminals.map((t, i) => (
        <div key={i} className="ce-propline ce-iec-term-row">
          <Text value={t.label} placeholder="Rótulo" onChange={(label) => onChange(terminals.map((x, j) => (j === i ? { ...x, label } : x)))} />
          <Num value={t.x} step={1} onChange={(x) => onChange(terminals.map((item, j) => (j === i ? { ...item, x } : item)))} />
          <Num value={t.y} step={1} onChange={(y) => onChange(terminals.map((item, j) => (j === i ? { ...item, y } : item)))} />
          <button
            type="button"
            className="ce-linkbtn"
            title="Remover borne"
            aria-label="Remover borne"
            onClick={() => onChange(terminals.filter((_, j) => j !== i))}
          >
            <IconDelete size={12} />
          </button>
        </div>
      ))}
      <p className="ce-hint">Colunas: rótulo · X · Y (px locais, origem no 1.º borne do desenho IEC).</p>
    </div>
  )
}

function PolesEditor({
  poles,
  terminalCount,
  onChange,
}: {
  poles: Array<[number, number]>
  terminalCount: number
  onChange: (p: Array<[number, number]>) => void
}) {
  const opts = Array.from({ length: Math.max(terminalCount, 1) }, (_, i) => [String(i), `#${i}`] as [string, string])
  return (
    <div className="ce-iec-poles">
      <div className="ce-actions" style={{ marginBottom: 6 }}>
        <button
          type="button"
          className="dx-btn dx-btn-secondary dx-btn-sm"
          onClick={() => onChange([...poles, [0, Math.min(1, terminalCount - 1)]])}
        >
          <IconPlus size={12} /> Pólo
        </button>
      </div>
      {poles.length === 0 && <Empty>Sem pólos condutores (elemento sempre aberto ou só de sinal).</Empty>}
      {poles.map((pair, i) => (
        <div key={i} className="ce-propline">
          <Select
            value={String(pair[0])}
            options={opts}
            onChange={(v) => onChange(poles.map((p, j) => (j === i ? [Number(v), p[1]] as [number, number] : p)))}
          />
          <span className="text-[10px] text-ink-400">↔</span>
          <Select
            value={String(pair[1])}
            options={opts}
            onChange={(v) => onChange(poles.map((p, j) => (j === i ? [p[0], Number(v)] as [number, number] : p)))}
          />
          <button type="button" className="ce-linkbtn" onClick={() => onChange(poles.filter((_, j) => j !== i))} aria-label="Remover pólo">
            <IconDelete size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}

function CustomSymbolEditor({
  symbol,
  onChange,
  onRemove,
  sim,
  onSim,
}: {
  symbol: IecSymbolDef
  onChange: (s: IecSymbolDef) => void
  onRemove: () => void
  sim: CmdSymbolState
  onSim: (s: CmdSymbolState) => void
}) {
  return (
    <div className="ce-iec-custom">
      <div className="ce-iec-custom-head">
        <strong>{symbol.label || 'Símbolo'}</strong>
        <button type="button" className="ce-linkbtn" onClick={onRemove} title="Eliminar símbolo personalizado">
          <IconDelete size={13} /> Eliminar
        </button>
      </div>
      <div className="ce-iec-layout">
        <SymbolPreview custom={symbol} kind={symbol.basedOn} state={sim} size={180} />
        <div className="ce-iec-fields">
          <Field label="Nome">
            <Text value={symbol.label} onChange={(label) => onChange({ ...symbol, label })} />
          </Field>
          <Field label="Prefixo IEC 81346">
            <Text value={symbol.prefix} onChange={(prefix) => onChange({ ...symbol, prefix })} placeholder="Q, F, K, S…" />
          </Field>
          <Field label="Base de desenho (CmdKind)">
            <Select
              value={symbol.basedOn ?? ''}
              options={KIND_OPTIONS}
              onChange={(basedOn) => {
                if (!basedOn) {
                  onChange({ ...symbol, basedOn: undefined })
                  return
                }
                const next = emptyCustom(basedOn as CmdKind)
                onChange({ ...next, id: symbol.id, label: symbol.label || next.label })
              }}
            />
          </Field>
          <Field label="Nota">
            <Text value={symbol.note ?? ''} onChange={(note) => onChange({ ...symbol, note })} placeholder="Opcional" />
          </Field>
        </div>
      </div>
      <SimControls state={sim} onChange={onSim} />
      <Section title={`Bornes (${symbol.terminals.length})`} open>
        <TerminalEditor terminals={symbol.terminals} onChange={(terminals) => onChange({ ...symbol, terminals })} />
      </Section>
      <Section title={`Pólos condutores (${symbol.poles.length})`} open={false}>
        <PolesEditor poles={symbol.poles} terminalCount={symbol.terminals.length} onChange={(poles) => onChange({ ...symbol, poles })} />
      </Section>
      <Section title="Caixa de seleção" open={false}>
        <div className="ce-propline">
          <label className="ce-field"><span>X</span><Num value={symbol.box.x} onChange={(x) => onChange({ ...symbol, box: { ...symbol.box, x } })} /></label>
          <label className="ce-field"><span>Y</span><Num value={symbol.box.y} onChange={(y) => onChange({ ...symbol, box: { ...symbol.box, y } })} /></label>
          <label className="ce-field"><span>L</span><Num value={symbol.box.w} min={4} onChange={(w) => onChange({ ...symbol, box: { ...symbol.box, w } })} /></label>
          <label className="ce-field"><span>A</span><Num value={symbol.box.h} min={4} onChange={(h) => onChange({ ...symbol, box: { ...symbol.box, h } })} /></label>
        </div>
      </Section>
    </div>
  )
}

export function IecTab() {
  const meta = useEditorStore((s) => s.meta)
  const def = useEditorStore((s) => s.def)
  const editMeta = useEditorStore((s) => s.editMeta)
  const edit = useEditorStore((s) => s.edit)
  const mode = useEditorStore((s) => s.mode)
  const set = useEditorStore((s) => s.set)

  const iec: IecDef = def.iec ?? {}
  const primary = meta.iecSymbol || iec.primary || ''
  const related = meta.iecRelated ?? iec.related ?? []
  const customs = iec.symbols ?? []

  const [sim, setSim] = useState<CmdSymbolState>({ closed: false, idle: false })
  const [simOn, setSimOn] = useState(false)
  const [draftCustomId, setDraftCustomId] = useState<string | null>(null)

  const patchIec = (patch: Partial<IecDef>) => {
    edit((d) => ({ ...d, iec: { ...(d.iec ?? {}), ...patch } }))
  }

  const setPrimary = (value: string) => {
    editMeta({ iecSymbol: value || undefined }, 'iec')
    patchIec({ primary: value || undefined })
  }

  const toggleRelated = (kind: CmdKind) => {
    const next = related.includes(kind) ? related.filter((k) => k !== kind) : [...related, kind]
    editMeta({ iecRelated: next.length ? next : undefined }, 'iec')
    patchIec({ related: next.length ? next : undefined })
  }

  const addCustom = (basedOn?: CmdKind) => {
    const symbol = emptyCustom(basedOn)
    patchIec({ symbols: [...customs, symbol] })
    setDraftCustomId(symbol.id)
  }

  const updateCustom = (id: string, next: IecSymbolDef) => {
    patchIec({ symbols: customs.map((s) => (s.id === id ? next : s)) })
  }

  const removeCustom = (id: string) => {
    patchIec({ symbols: customs.filter((s) => s.id !== id) })
    if (draftCustomId === id) setDraftCustomId(null)
  }

  const activeCustom = customs.find((s) => s.id === draftCustomId) ?? customs[0]

  return (
    <>
      <Section title="Associação IEC" open
        actions={<button type="button" className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => set({ libraryOpen: true })}>Biblioteca IEC</button>}>
        <p className="ce-hint">
          Liga este modelo 3D ao símbolo usado no <strong>Esquema IEC</strong> (IEC 60617 / 81346-2).
          A associação aparece no inspetor do simulador e no diagnóstico. Abra a biblioteca lateral para percorrer todos os símbolos.
        </p>
        <Field label="Símbolo principal">
          <Select value={primary} options={KIND_OPTIONS} onChange={setPrimary} />
        </Field>
        {primary && primary in CMD_PARTS ? (
          <p className="ce-hint">
            {CMD_PARTS[primary as CmdKind].hint} · prefixo <code>{CMD_PARTS[primary as CmdKind].prefix || '—'}</code>
          </p>
        ) : null}
        <Field label="Símbolos relacionados">
          <div className="ce-iec-related">
            {CMD_PALETTE.map((group) => (
              <div key={group.title} className="ce-iec-related-group">
                <span className="ce-iec-related-title">{group.title}</span>
                <div className="ce-iec-related-chips">
                  {group.kinds.map((k) => (
                    <button
                      key={k}
                      type="button"
                      className={`ce-chip${related.includes(k) ? ' is-on' : ''}`}
                      onClick={() => toggleRelated(k)}
                      title={CMD_PARTS[k].hint}
                    >
                      {CMD_PARTS[k].label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Field>
      </Section>

      <Section title="Pré-visualização e simulação" open>
        <div className="ce-iec-layout">
          <SymbolPreview kind={primary} state={simOn ? sim : { idle: true }} size={200} />
          <div className="ce-iec-fields">
            <div className="ce-actions">
              <button
                type="button"
                className={`dx-btn dx-btn-sm ${simOn ? 'dx-btn-primary' : 'dx-btn-secondary'}`}
                onClick={() => setSimOn((v) => !v)}
              >
                {simOn ? <><IconPause size={12} /> Pausar simulação</> : <><IconPlay size={12} /> Simular símbolo</>}
              </button>
              <button
                type="button"
                className={`dx-btn dx-btn-secondary dx-btn-sm${mode === 'simulate' ? ' is-on' : ''}`}
                onClick={() => set({ mode: mode === 'simulate' ? 'edit' : 'simulate' })}
                title="Alterna o modo Simular do editor 3D (estados do modelo)"
              >
                Modo 3D: {mode === 'simulate' ? 'Simular' : 'Editar'}
              </button>
            </div>
            {simOn ? <SimControls state={sim} onChange={setSim} /> : <p className="ce-hint">Ative a simulação para testar aberto/fechado, energizado, trip e temporizador.</p>}
          </div>
        </div>
      </Section>

      <Section title={`Biblioteca de símbolos (${ALL_KINDS.length})`} open={false}>
        <p className="ce-hint">Símbolos IEC integrados. Clique para usar como principal ou para criar uma cópia editável.</p>
        <div className="ce-iec-library">
          {CMD_PALETTE.map((group) => (
            <div key={group.title} className="ce-iec-lib-group">
              <h4>{group.title}</h4>
              <div className="ce-iec-lib-grid">
                {group.kinds.map((k) => (
                  <div key={k} className={`ce-iec-lib-tile${primary === k ? ' is-primary' : ''}`}>
                    <SymbolPreview kind={k} state={{ idle: true }} size={72} />
                    <span className="ce-iec-lib-name">{CMD_PARTS[k].label}</span>
                    <div className="ce-iec-lib-actions">
                      <button type="button" className="ce-linkbtn" onClick={() => setPrimary(k)} title="Definir como principal">
                        Usar
                      </button>
                      <button type="button" className="ce-linkbtn" onClick={() => addCustom(k)} title="Criar cópia editável">
                        <IconCopy size={11} /> Editar cópia
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title={`Símbolos personalizados (${customs.length})`}
        open
        actions={
          <button type="button" className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => addCustom()}>
            <IconPlus size={12} /> Novo símbolo
          </button>
        }
      >
        {customs.length === 0 ? (
          <Empty>
            Ainda não há símbolos criados neste componente. Escolha um da biblioteca e use «Editar cópia», ou crie um novo do zero.
          </Empty>
        ) : (
          <>
            {customs.length > 1 && (
              <div className="ce-iec-custom-tabs">
                {customs.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`ce-chip${(activeCustom?.id === s.id) ? ' is-on' : ''}`}
                    onClick={() => setDraftCustomId(s.id)}
                  >
                    {s.label || s.id}
                  </button>
                ))}
              </div>
            )}
            {activeCustom && (
              <CustomSymbolEditor
                symbol={activeCustom}
                onChange={(next) => updateCustom(activeCustom.id, next)}
                onRemove={() => removeCustom(activeCustom.id)}
                sim={simOn ? sim : { idle: true }}
                onSim={setSim}
              />
            )}
          </>
        )}
      </Section>
    </>
  )
}
