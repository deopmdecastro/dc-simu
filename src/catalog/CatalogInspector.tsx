import { useMemo, useState } from 'react'
import { useSimStore } from '../store/useSimStore'
import type { ElectricalComponent } from '../types'
import { useCatalogStore } from './registry'
import { catalogUpdateInfo, duplicateAsIndependent, updateCatalogComponent } from './update'

/** Secção do inspetor para componentes do catálogo oficial 3D: versão instalada, atualizações, estados e cópia independente. */
export default function CatalogInspector({ component }: { component: ElectricalComponent }) {
  const entries = useCatalogStore((s) => s.entries)
  const [showChanges, setShowChanges] = useState(false)
  const link = component.catalog
  const entry = useMemo(() => entries.find((item) => item.id === link?.id), [entries, link?.id])
  const version = entry?.versions.find((item) => item.version === link?.version)
  const info = useMemo(() => catalogUpdateInfo(component, entries), [component, entries])
  if (!link) return null
  const states = version?.definition.states ?? []
  const current = String(component.state?.catalogState ?? version?.definition.initialState ?? '')
  const isCopy = link.source === 'copy'

  return <details className="dc-inspector-group" open>
    <summary>Catálogo oficial{info ? ' · atualização disponível' : ''}</summary>
    <div className="dc-inspector-group-body">
      <div className="text-[11px] text-ink-700">
        <strong>{entry?.meta.name ?? link.id}</strong> · instalado <b>v{link.version}</b>
        {!info && entry && !isCopy && entry.latestVersion === link.version && <span className="text-ink-400"> · versão publicada pelo administrador (atualiza sozinho)</span>}
        {isCopy && <span className="text-ink-400"> · cópia independente (fixa em v{link.version}, sem atualizações automáticas)</span>}
        {entry?.archived && !isCopy && <span className="text-ink-400"> · arquivado pelo administrador</span>}
      </div>
      {info && <div className="dc-catalog-update" role="status">
        <div className="text-[11px]"><b>Disponível v{info.latest}</b>{info.note ? ` — ${info.note}` : ''}</div>
        {showChanges && <ul className="text-[10.5px] text-ink-600 list-disc pl-4 my-1">
          {info.changes.length ? info.changes.map((change) => <li key={change}>{change}</li>) : <li>Sem lista de alterações.</li>}
        </ul>}
        <div className="flex gap-1 flex-wrap mt-1">
          <button className="dc-btn" onClick={() => setShowChanges((value) => !value)}>{showChanges ? 'Ocultar alterações' : 'Ver alterações'}</button>
          <button className="dc-btn dc-btn-primary" onClick={() => updateCatalogComponent(component.id, entries)}>Atualizar</button>
        </div>
        <div className="text-[10px] text-ink-400 mt-1">A versão do administrador prevalece e é aplicada sozinha, mantendo posição, estado e cabos ligados (Ctrl+Z desfaz). Para fixar esta versão, use «Duplicar como independente».</div>
      </div>}
      {states.length > 1 && <div>
        <label className="dc-field-label">Estado</label>
        <select className="dc-select" value={current} onChange={(event) => useSimStore.getState().updateComponent(component.id, { state: { ...component.state, catalogState: event.target.value } })}>
          {states.map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}
        </select>
      </div>}
      <button className="dc-btn" title="Cria uma cópia fixa nesta versão, independente do componente oficial" onClick={() => {
        const name = window.prompt('Nome da cópia independente', `${component.label} (cópia)`)
        if (name !== null) duplicateAsIndependent(component.id, name)
      }}>Duplicar como independente</button>
    </div>
  </details>
}
