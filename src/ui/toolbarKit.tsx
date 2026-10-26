import type React from 'react'
import type { ReactNode } from 'react'
import Select from './Select'
import { IconUndo, IconRedo, IconGrid, IconMagnet, IconZoomIn, IconZoomOut, IconHelp, IconPlay } from './icons'

/**
 * Elementos comuns das barras de ferramentas: Esquema/Painel 3D, GRAFCET, Ladder
 * e editor de componentes 3D usam os mesmos botões, grupos e separadores.
 * Alterar aqui mantém as barras visualmente e funcionalmente iguais.
 */

/** Tecla de atalho discreta (só em ecrãs largos). */
export function Kbd({ children, onBrand = false }: { children: ReactNode; onBrand?: boolean }) {
  return <kbd className={`hidden 2xl:inline text-[9px] font-mono px-1 rounded ${onBrand ? 'bg-white/20 text-white' : 'bg-surface-sunken text-ink-400'}`}>{children}</kbd>
}

/** Botão de barra de ferramentas com atalho opcional — evita repetir o mesmo markup por botão. */
export function TbButton({ children, kbd, kbdOnBrand = false, pressed, className = 'dc-tool-btn', ...rest }: {
  kbd?: string; kbdOnBrand?: boolean; pressed?: boolean
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'>) {
  return (
    <button type="button" className={className} aria-pressed={pressed} {...rest}>
      {children}
      {kbd && <Kbd onBrand={kbdOnBrand}>{kbd}</Kbd>}
    </button>
  )
}

/** Separador vertical entre grupos. */
export function ToolSep() {
  return <span className="tb-sep" />
}

/** Grupo segmentado de botões (`dc-seg`) com nome acessível. */
export function ToolSeg({ label, children, role = 'group' }: { label: string; children: ReactNode; role?: 'group' | 'toolbar' }) {
  return <div className="dc-seg" role={role} aria-label={label}>{children}</div>
}

/** Desfazer / refazer: o mesmo grupo em todos os editores. */
export function HistoryGroup({ onUndo, onRedo, canUndo, canRedo, role = 'toolbar' }: { onUndo: () => void; onRedo: () => void; canUndo: boolean; canRedo: boolean; role?: 'group' | 'toolbar' }) {
  return (
    <ToolSeg label="Histórico" role={role}>
      <button type="button" onClick={onUndo} disabled={!canUndo} className="dc-tool-btn !px-2" title="Desfazer [Ctrl+Z]" aria-label="Desfazer">
        <IconUndo size={13} />
      </button>
      <button type="button" onClick={onRedo} disabled={!canRedo} className="dc-tool-btn !px-2" title="Refazer [Ctrl+Y]" aria-label="Refazer">
        <IconRedo size={13} />
      </button>
    </ToolSeg>
  )
}

/** Botão «Atalhos» comum (abre a ajuda de teclado do editor). `scope` marca a vista para testes e para o pedido de atalhos. */
export function ShortcutsButton({ onClick, scope, title = 'Atalhos de teclado (?)', className = '' }: { onClick: () => void; scope?: string; title?: string; className?: string }) {
  return (
    <button type="button" className={`dc-tool-btn !px-2 shrink-0 ${className}`} data-shortcuts-button={scope} onClick={onClick} title={title} aria-label="Atalhos de teclado">
      <IconHelp size={13} /><span className="hidden xl:inline">Atalhos</span>
    </button>
  )
}

/** Botão «Simulação» comum: mostra/esconde o painel de simulação do editor (Esquema, Ladder, GRAFCET). */
export function SimToggleButton({ on, onClick, scope, title }: { on: boolean; onClick: () => void; scope: string; title?: string }) {
  return (
    <button type="button" className={`dc-tool-btn grafcet-sim-tool dc-sim-tool !gap-1.5 ${on ? 'is-on' : ''}`} aria-pressed={on} aria-label="Simulação" data-sim-toggle={scope}
      onClick={onClick} title={title ?? (on ? 'Esconder a simulação' : 'Mostrar a simulação')}>
      <IconPlay size={12} /><span>Simulação</span>
    </button>
  )
}

export interface ViewControlsProps {
  grid: { on: boolean; toggle: () => void; title?: string }
  snap?: { on: boolean; toggle: () => void; title?: string }
  step?: { value: number; options: number[]; onChange: (n: number) => void }
  zoom?: { percent: number; onOut: () => void; onReset: () => void; onIn: () => void; canOut?: boolean; canIn?: boolean }
}

/** Grupo «vista» único (malha · ímã · passo · zoom): igual em Esquema/3D, Ladder e GRAFCET. */
export function ViewControls({ grid, snap, step, zoom }: ViewControlsProps) {
  const seg = (active: boolean) => `dc-tool-btn ${active ? 'dc-tool-active' : ''}`
  const on = (v: boolean) => (v ? '!border-brand-300 !bg-brand-50 !text-brand-700' : '')
  return (
    <div className="flex items-center gap-1 shrink-0" role="group" aria-label="Vista">
      <div className="dc-seg" role="group" aria-label="Malha">
        <button type="button" onClick={grid.toggle} aria-pressed={grid.on} className={`${seg(false)} !px-2 ${on(grid.on)}`} title={grid.title ?? 'Mostrar/ocultar malha'}>
          <IconGrid size={13} />
        </button>
        {snap && (
          <button type="button" onClick={snap.toggle} aria-pressed={snap.on} className={`${seg(false)} !px-2 ${on(snap.on)}`} title={snap.title ?? 'Encaixar na malha (ímã)'}>
            <IconMagnet size={13} />
          </button>
        )}
      </div>
      {step && (
        <Select value={step.value} onChange={(e) => step.onChange(Number(e.target.value))} className="dc-select !w-[66px]" title="Passo da malha">
          {step.options.map((n) => <option key={n} value={n}>{n}px</option>)}
        </Select>
      )}
      {zoom && (
        <div className="dc-seg" role="toolbar" aria-label="Zoom">
          <button type="button" onClick={zoom.onOut} disabled={zoom.canOut === false} className={`${seg(false)} !px-1.5`} title="Reduzir zoom">
            <IconZoomOut size={13} />
          </button>
          <button type="button" onClick={zoom.onReset} className={`${seg(false)} !px-2 font-mono tabular-nums min-w-[48px] justify-center`} title="Restaurar zoom (100%)">
            {zoom.percent}%
          </button>
          <button type="button" onClick={zoom.onIn} disabled={zoom.canIn === false} className={`${seg(false)} !px-1.5`} title="Ampliar zoom">
            <IconZoomIn size={13} />
          </button>
        </div>
      )}
      <span className="tb-sep" />
    </div>
  )
}

