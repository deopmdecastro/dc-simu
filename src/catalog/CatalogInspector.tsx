import { IconBell } from '../ui/icons'
import { uiPrompt } from '../ui/dialogs'
import Select from '../ui/Select'
import { useMemo, useState } from 'react'
import { useSimStore } from '../store/useSimStore'
import { useManobraAllowed } from '../store/useManobraAllowed'
import { MANOBRA_BLOCKED_TITLE } from '../store/manobra'
import type { ElectricalComponent } from '../types'
import { useCatalogStore } from './registry'
import { triggerControl, useCatalogMeter } from './runtimeControls'
import { selectorValue } from './behavior'
import { catalogUpdateInfo, duplicateAsIndependent, updateCatalogComponent } from './update'
import { glassFor } from './lightLook'
import { swatchBackground, swatchName, useLightColorLibrary } from './lightColorLibrary'

/** Secção do inspetor para componentes do catálogo oficial 3D: versão instalada, atualizações, estados e cópia independente. */
export default function CatalogInspector({ component }: { component: ElectricalComponent }) {
  const entries = useCatalogStore((s) => s.entries)
  const customSwatches = useLightColorLibrary((s) => s.custom)
  const [showChanges, setShowChanges] = useState(false)
  const link = component.catalog
  const entry = useMemo(() => entries.find((item) => item.id === link?.id), [entries, link?.id])
  const version = entry?.versions.find((item) => item.version === link?.version)
  const info = useMemo(() => catalogUpdateInfo(component, entries), [component, entries])
  const meter = useCatalogMeter(component, version?.definition)
  // Regra global de manobra: nada se atua antes de ▶.
  const simActive = useManobraAllowed()
  const editingStopped = useSimStore((s) => s.sim.runState === 'stopped')
  if (!link) return null
  const controls = version?.definition.controls ?? []
  const states = version?.definition.states ?? []
  const colorZones = version?.definition.lights.filter((light) => !!light.userPalette?.length) ?? []
  const selectedColors = (component.state?.catalogColors as Record<string, string> | undefined) ?? {}
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
          <button className="dc-btn dc-btn-primary" disabled={!editingStopped} onClick={() => updateCatalogComponent(component.id, entries)}>Atualizar</button>
        </div>
        <div className="text-[10px] text-ink-400 mt-1">A versão do administrador prevalece e é aplicada sozinha, mantendo posição, estado e cabos ligados (Ctrl+Z desfaz). Para fixar esta versão, use «Duplicar como independente».</div>
      </div>}
      {version && controls.length > 0 && <div className="dc-catalog-controls">
        <label className="dc-field-label">Controlos do equipamento</label>
        {meter.reading && <div className="dc-meter-readout" role="status" aria-live="polite">
          <span className="dc-meter-lcd">{meter.reading.on ? `${meter.reading.negative ? '-' : ''}${meter.reading.text} ${meter.reading.unit}` : 'OFF'}</span>
          <span className="dc-meter-tags">{meter.reading.on && meter.reading.quantity}{meter.reading.hold ? ' · HOLD' : ''}{meter.reading.beep && <> · <IconBell size={11} title="Sinal sonoro ativo" /></>}</span>
          {meter.reading.warning && <span className="dc-meter-warn">{meter.reading.warning}</span>}
        </div>}
        {controls.filter((control) => control.kind === 'selector').map((control) => <div key={control.id}>
          <label className="dc-field-label" htmlFor={`catalog-control-${component.id}-${control.id}`}>{control.name}</label>
          <Select id={`catalog-control-${component.id}-${control.id}`} className="dc-select" value={selectorValue(control, meter.vars)} disabled={!simActive} onChange={(event) => triggerControl(version.definition, component.id, control, { select: event.target.value })}>
            {control.positions.map((position) => <option key={position.id} value={position.id}>{position.label}</option>)}
          </Select>
        </div>)}
        <div className="flex gap-1 flex-wrap mt-1">
          {controls.filter((control) => control.kind !== 'selector').map((control) => <button key={control.id} className="dc-btn" disabled={!simActive} onClick={() => triggerControl(version.definition, component.id, control, 'press')}
            onContextMenu={(event) => { event.preventDefault(); if (simActive) triggerControl(version.definition, component.id, control, 'long') }} title={simActive ? 'Clique: ação · botão direito: premir longo' : MANOBRA_BLOCKED_TITLE}>{control.name}</button>)}
        </div>
      </div>}
      {colorZones.length > 0 && <div className="dc-catalog-colors">
        <label className="dc-field-label">Cores do componente</label>
        {colorZones.map((zone) => <div key={zone.id} className="rounded-md border border-line-soft p-2 mb-1">
          <div className="text-[11px] text-ink-600 mb-1">{zone.name}</div>
          <div className="flex gap-1 flex-wrap">{zone.userPalette!.map((color) => {
            const selected = (selectedColors[zone.id] ?? zone.color).toLowerCase() === color.toLowerCase()
            const glass = zone.tintMaterial === false ? undefined : glassFor(zone, color)
            const name = swatchName(color, glass, customSwatches)
            const title = `${name ? `${name} · ` : ''}${glass ? `vidro ${glass} · ` : ''}brilho ${color}`
            return <button key={color} type="button" disabled={!editingStopped} aria-label={`${zone.name}: ${name ?? color}`} aria-pressed={selected} title={title}
              className={`h-7 w-7 rounded-full border-2 ${selected ? 'border-brand-600 ring-2 ring-brand-200' : 'border-slate-300'}`}
              style={{ background: swatchBackground(glass, color) }} onClick={() => useSimStore.getState().setComponentState(component.id, { catalogColors: { ...selectedColors, [zone.id]: color } })} />
          })}</div>
        </div>)}
      </div>}
      {states.length > 1 && <div>
        <label className="dc-field-label" htmlFor={`catalog-state-${component.id}`}>Estado</label>
        <Select id={`catalog-state-${component.id}`} className="dc-select" value={current} disabled={!simActive} title={simActive ? undefined : MANOBRA_BLOCKED_TITLE} onChange={(event) => useSimStore.getState().setComponentState(component.id, { catalogState: event.target.value })}>
          {states.map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}
        </Select>
      </div>}
      <button className="dc-btn" disabled={!editingStopped} title="Cria uma cópia fixa nesta versão, independente do componente oficial" onClick={async () => {
        const name = await uiPrompt('Nome da cópia independente', `${component.label} (cópia)`)
        if (name !== null) duplicateAsIndependent(component.id, name)
      }}>Duplicar como independente</button>
    </div>
  </details>
}
