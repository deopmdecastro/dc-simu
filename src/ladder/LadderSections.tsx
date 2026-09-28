import { useState } from 'react'
import { useSimStore } from '../store/useSimStore'
import { paletteGroups } from '../electrical/factory'
import { COMPONENT_TO_LADDER, type PaletteKind } from './ladderDnd'

export type LadderSection = 'Projeto' | 'Biblioteca' | 'Dispositivos' | 'Diagnóstico' | 'Configurações'

export default function LadderSections({ section, onAdd }: { section: Exclude<LadderSection, 'Projeto'>; onAdd: (kind: PaletteKind) => void }) {
  const [query, setQuery] = useState('')
  const components = useSimStore((s) => s.components)
  const diagnostics = useSimStore((s) => s.sim.diagnostics)
  const events = useSimStore((s) => s.sim.events)
  const grid = useSimStore((s) => s.grid)
  const setGrid = useSimStore((s) => s.setGrid)
  const sim = useSimStore((s) => s.sim)
  const table = useSimStore((s) => s.runtime.table)
  const rungs = useSimStore((s) => s.ladder.rungs)
  const setSpeed = useSimStore((s) => s.setSpeed)
  const selectComponent = useSimStore((s) => s.selectComponents)
  const groups = paletteGroups()
  const filtered = (text: string) => text.toLocaleLowerCase('pt-PT').includes(query.toLocaleLowerCase('pt-PT'))
  return <section className="ladder-section-view">
    <h2>{section}</h2>
    {section === 'Biblioteca' && <>
      <p>Elementos suportados pelo editor Ladder. Clique para inserir na network ativa do OB1.</p>
      <input className="dc-input" aria-label="Pesquisar biblioteca" placeholder="Pesquisar elementos…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="ladder-section-grid">{([['NO','Contacto NA'],['NC','Contacto NF'],['RISING','Borda de subida'],['FALLING','Borda de descida'],['BRANCH','Ramo OR'],['COIL','Bobina'],['SET','SET'],['RESET','RESET'],['TON','Temporizador TON'],['TOF','Temporizador TOF'],['TP','Temporizador TP'],['CTU','Contador CTU'],['CTD','Contador CTD'],['MOVE','MOVE BOOL'],['CALL','CALL FC']] as const).filter(([, name]) => filtered(name)).map(([kind, name]) => <button key={kind} className="dc-btn" onClick={() => onAdd(kind)}>{name}</button>)}</div>
      <h3>Referência: componentes do esquema</h3>
      {groups.map((group) => <details key={group.group}><summary>{group.group} ({group.items.length})</summary><div className="ladder-section-grid">{group.items.filter((item) => filtered(item.name)).map((item) => <div className="ladder-section-card" key={item.type}><strong>{item.name}</strong><small>{item.type}</small>{COMPONENT_TO_LADDER[item.type] && <button className="dc-btn" onClick={() => onAdd(COMPONENT_TO_LADDER[item.type]!)}>Inserir equivalente Ladder</button>}</div>)}</div></details>)}
    </>}
    {section === 'Dispositivos' && <>
      <p>Componentes presentes no esquema atual. Selecione um dispositivo; para o editar, abra a vista Esquema e consulte o inspetor.</p>
      <input className="dc-input" aria-label="Pesquisar dispositivos" placeholder="Pesquisar referência, nome ou tipo…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="ladder-section-grid">{components.filter((c) => filtered(`${c.ref} ${c.label} ${c.type}`)).map((c) => <div key={c.id} className="ladder-section-card"><strong>{c.ref} · {c.label}</strong><small>{c.type} · {c.terminals.length} terminais · {c.state.energized ? 'energizado' : 'desligado'}</small><button className="dc-btn" onClick={() => selectComponent([c.id], false)}>Marcar para o esquema</button></div>)}</div>
      {!components.length && <p>Sem dispositivos. Adicione componentes na vista Esquema.</p>}
    </>}
    {section === 'Diagnóstico' && <>
      <p>Estado do último scan: {sim.runState} · {sim.scanCount} scans · {rungs.length} networks Ladder.</p>
      <h3>Problemas detetados ({diagnostics.length})</h3>
      {diagnostics.map((d) => <div className="ladder-section-card" key={d.id}><strong>{d.level === 'error' ? 'Erro' : d.level === 'warning' ? 'Aviso' : 'Informação'}</strong><span>{d.message}</span>{d.componentId && <button className="dc-btn" onClick={() => selectComponent([d.componentId!], false)}>Selecionar componente</button>}</div>)}
      {!diagnostics.length && <p>Não foram detetados problemas no último scan.</p>}
      <h3>Entradas e saídas</h3><div className="ladder-section-grid">{Object.entries(table).filter(([key]) => /^[IQ]/.test(key)).map(([key, value]) => <span className="ladder-section-card" key={key}>{key}: <strong>{value ? 'ON' : 'OFF'}</strong></span>)}</div>
      <h3>Eventos recentes</h3>{events.slice(0, 20).map((e) => <p key={e.id}>{e.level}: {e.message}</p>)}
    </>}
    {section === 'Configurações' && <>
      <p>Definições do editor e da simulação. A malha é guardada com o projeto.</p>
      <label className="ladder-setting"><span>Mostrar malha</span><input type="checkbox" checked={grid.enabled} onChange={(e) => setGrid({ enabled: e.target.checked })} /></label>
      <label className="ladder-setting"><span>Ajustar à malha</span><input type="checkbox" checked={grid.snap} onChange={(e) => setGrid({ snap: e.target.checked })} /></label>
      <label className="ladder-setting"><span>Espaçamento da malha</span><select className="dc-input" value={grid.size} onChange={(e) => setGrid({ size: Number(e.target.value) })}>{[10, 20, 25, 40].map((size) => <option key={size} value={size}>{size} px</option>)}</select></label>
      <label className="ladder-setting"><span>Velocidade da simulação</span><select className="dc-input" value={sim.speed} onChange={(e) => setSpeed(Number(e.target.value))}>{[0.25, 0.5, 1, 2, 4].map((speed) => <option key={speed} value={speed}>{speed}×</option>)}</select></label>
      <h3>Programa</h3><p>Networks: {rungs.length} · Dispositivos: {components.length} · A simulação Ladder executa de cima para baixo.</p>
    </>}
  </section>
}
