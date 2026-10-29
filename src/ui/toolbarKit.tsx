import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type React from 'react'
import type { ReactNode } from 'react'
import Select from './Select'
import { IconChevronDown, IconUndo, IconRedo, IconGrid, IconMagnet, IconZoomIn, IconZoomOut, IconHelp, IconFocus, IconPlay, IconPause, IconStop, IconStep, IconReset, IconSignals } from './icons'

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
      <IconSignals size={13} /><span>Simulação</span>
    </button>
  )
}

export interface ViewControlsProps {
  grid?: { on: boolean; toggle: () => void; title?: string }
  snap?: { on: boolean; toggle: () => void; title?: string }
  step?: { value: number; options: number[]; onChange: (n: number) => void }
  zoom?: { percent: number; onOut: () => void; onReset: () => void; onIn: () => void; /** Ajusta a escala para caber a largura visível. */ onFit?: () => void; fitTitle?: string; canOut?: boolean; canIn?: boolean; unit?: string; title?: string }
}

/** Grupo «vista» único (malha · ímã · passo · zoom): igual em Esquema/3D, Ladder e GRAFCET. */
export function ViewControls({ grid, snap, step, zoom }: ViewControlsProps) {
  const seg = (active: boolean) => `dc-tool-btn ${active ? 'dc-tool-active' : ''}`
  const on = (v: boolean) => (v ? '!border-brand-300 !bg-brand-50 !text-brand-700' : '')
  return (
    <div className="flex items-center gap-1 shrink-0" role="group" aria-label="Vista">
      <div className="dc-seg" role="group" aria-label="Malha">
        {grid && (
        <button type="button" onClick={grid.toggle} aria-pressed={grid.on} className={`${seg(false)} !px-2 ${on(grid.on)}`} title={grid.title ?? 'Mostrar/ocultar malha'}>
          <IconGrid size={13} />
        </button>
        )}
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
        <div className="dc-seg" role="toolbar" aria-label={zoom.title ?? 'Zoom'}>
          <button type="button" onClick={zoom.onOut} disabled={zoom.canOut === false} className={`${seg(false)} !px-1.5`} title={`Reduzir zoom${zoom.unit ? ` (${zoom.unit})` : ''}`} aria-label="Reduzir zoom">
            <IconZoomOut size={13} />
          </button>
          <button type="button" onClick={zoom.onReset} className={`${seg(false)} !px-2 font-mono tabular-nums min-w-[48px] justify-center`} title={zoom.title ?? 'Restaurar zoom (100%)'} aria-label={`Zoom ${zoom.percent}%`}>
            {zoom.percent}%
          </button>
          <button type="button" onClick={zoom.onIn} disabled={zoom.canIn === false} className={`${seg(false)} !px-1.5`} title={`Ampliar zoom${zoom.unit ? ` (${zoom.unit})` : ''}`} aria-label="Ampliar zoom">
            <IconZoomIn size={13} />
          </button>
          {zoom.onFit && <button type="button" onClick={zoom.onFit} className={`${seg(false)} !px-1.5`} title={zoom.fitTitle ?? 'Ajustar à largura visível'} aria-label="Ajustar à largura">
            <IconFocus size={13} />
          </button>}
        </div>
      )}
      <span className="tb-sep" />
    </div>
  )
}

/* ---------------------------------------------------------------------------
   Menus de barra de ferramentas
   ---------------------------------------------------------------------------
   As barras têm mais ações do que cabem num telemóvel. Em vez de esconder
   botões (perdidos para sempre) ou deixar a faixa cortada, as ações que não
   cabem passam para um menu «Mais» com nome, ícone, atalho e motivo de
   bloqueio. O mesmo componente serve todos os editores e, em ecrãs estreitos,
   abre como folha inferior — junto ao polegar e sem sair do ecrã.
*/

export interface ToolMenuItem {
  id: string
  label: string
  /** Descrição curta do efeito (mostrada por baixo do nome). */
  hint?: string
  icon?: ReactNode
  /** Atalho de teclado mostrado à direita. */
  kbd?: string
  onSelect: () => void
  disabled?: boolean
  /** Porque está desativado — aparece em vez da dica. */
  disabledReason?: string
  /** Estado (ligado/desligado) de uma opção. */
  pressed?: boolean
  /** Item destacado (ação principal do grupo). */
  primary?: boolean
  /** Marca de perigo (eliminar, repor…). */
  danger?: boolean
}

export interface ToolMenuSection {
  id?: string
  title: string
  items: ToolMenuItem[]
}

/** Ecrã estreito / telemóvel: o menu passa a folha inferior. Exportado para os painéis que também trocam de controlo a 720 px. */
export function useNarrowMenu(query = '(max-width: 720px), (pointer: coarse) and (max-height: 720px)') {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setNarrow(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])
  return narrow
}

export function ToolMenu({ label, icon, sections, title, className = '', badge, align = 'start', trigger }: {
  label: string
  icon: ReactNode
  sections: ToolMenuSection[]
  /** Título mostrado no topo do menu (por omissão, `label`). */
  title?: string
  className?: string
  badge?: number
  align?: 'start' | 'end'
  /** Conteúdo próprio para o botão (por omissão: ícone, nome e seta). */
  trigger?: (state: { open: boolean }) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const narrow = useNarrowMenu()
  const items = useMemo(() => sections.flatMap((section) => section.items), [sections])
  const enabled = items.filter((item) => !item.disabled)

  useEffect(() => {
    if (!open) return
    const focusFirst = () => popup.current?.querySelector<HTMLButtonElement>('button[data-tm-item]:not(:disabled)')?.focus()
    const timer = window.setTimeout(focusFirst, 30)
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (button.current?.contains(target) || popup.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); button.current?.focus() }
      if (event.key === 'Tab') setOpen(false)
    }
    const onResize = () => setOpen(false)
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', onResize)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  // Setas percorrem os itens: um menu de 20 ações não se percorre só com Tab.
  const onItemKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const list = Array.from(popup.current?.querySelectorAll<HTMLButtonElement>('button[data-tm-item]:not(:disabled)') ?? [])
    if (!list.length) return
    const current = list.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? list.length - 1
        : event.key === 'ArrowDown' ? (current + 1) % list.length
          : (current - 1 + list.length) % list.length
    list[next]?.focus()
  }

  const rect = button.current?.getBoundingClientRect()
  /* Popover: cabe sempre no ecrã. Mede o espaço acima e abaixo do botão,
     escolhe o lado com mais folga e limita a altura (o corpo do menu desliza). */
  const place = () => {
    if (!rect) return {}
    const width = 268
    const left = align === 'end' ? rect.right - width : rect.left
    const below = window.innerHeight - rect.bottom - 12
    const above = rect.top - 12
    const maxHeight = Math.max(180, Math.min(440, Math.max(below, above)))
    const top = below >= Math.min(240, maxHeight) ? rect.bottom + 6 : Math.max(8, rect.top - maxHeight - 6)
    return {
      left: Math.max(8, Math.min(window.innerWidth - width - 8, left)),
      top,
      width,
      maxHeight,
    }
  }

  const renderItem = (item: ToolMenuItem) => {
    const Icon = item.icon
    return <button
      key={item.id}
      type="button"
      data-tm-item={item.id}
      role="menuitem"
      className={`tm-item${item.pressed ? ' is-on' : ''}${item.primary ? ' is-primary' : ''}${item.danger ? ' is-danger' : ''}`}
      aria-pressed={item.pressed}
      disabled={item.disabled}
      title={item.disabled ? item.disabledReason ?? item.hint ?? item.label : item.hint ?? item.label}
      onClick={() => { setOpen(false); button.current?.focus(); item.onSelect() }}
    >
      <span className="tm-item-icon" aria-hidden>{Icon}</span>
      <span className="tm-item-text">
        <strong>{item.label}</strong>
        {(item.disabled && item.disabledReason) || item.hint ? <small>{item.disabled ? item.disabledReason : item.hint}</small> : null}
      </span>
      {item.pressed && <span className="tm-item-dot" aria-hidden />}
      {item.kbd && <kbd>{item.kbd}</kbd>}
    </button>
  }

  return <>
    <button
      ref={button}
      type="button"
      className={`dc-tool-btn tm-trigger ${open ? 'dc-tool-active' : ''} ${className}`}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={label}
      title={label}
      onClick={() => setOpen((value) => !value)}
    >
      {trigger ? trigger({ open }) : <>{icon}<span>{label}</span><IconChevronDown size={10} />{badge ? <b className="tm-badge">{badge}</b> : null}</>}
    </button>
    {open && createPortal(narrow
      ? <div className="tm-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
          <div ref={popup} className="tm-panel is-sheet" role="menu" aria-label={title ?? label} onKeyDown={onItemKey}>
            <span className="tm-grab" aria-hidden />
            <header className="tm-head"><strong>{title ?? label}</strong><button type="button" className="tm-close" onClick={() => { setOpen(false); button.current?.focus() }} aria-label="Fechar menu">×</button></header>
            <div className="tm-body">
              {sections.filter((section) => section.items.length > 0).map((section) => <section className="tm-section" key={section.id ?? section.title}>
                <h3>{section.title}</h3>
                {section.items.map(renderItem)}
              </section>)}
            </div>
          </div>
        </div>
      : <div ref={popup} className="tm-panel" role="menu" aria-label={title ?? label} style={place()} onKeyDown={onItemKey}>
          <strong className="tm-title">{title ?? label}</strong>
          <div className="tm-body">
            {sections.filter((section) => section.items.length > 0).map((section) => <section className="tm-section" key={section.id ?? section.title}>
              <h3>{section.title}</h3>
              {section.items.map(renderItem)}
            </section>)}
          </div>
          <footer className="tm-foot">{enabled.length} de {items.length} ações disponíveis</footer>
        </div>, document.body)}
  </>
}

/* ---------------------------------------------------------------------------
   Controlo de transporte da simulação (Run / Pausa / Passo / Stop / Reiniciar)
   Usado pelo SimulationDock (Esquema), GrafcetSimBar e, no futuro, Ladder.
   --------------------------------------------------------------------------- */

export type SimTransportProps = {
  running: boolean
  stopped: boolean
  onPlay: () => void
  onPause: () => void
  onStep: () => void
  onStop: () => void
  onReset: () => void
  /** Variante visual: 'dock' (compacto) | 'bar' (com etiquetas) */
  variant?: 'dock' | 'bar'
  className?: string
}

/** Botões de transporte da simulação — layout único para todos os editores. */
export function SimTransportControls({
  running, stopped, onPlay, onPause, onStep, onStop, onReset,
  variant = 'bar', className = '',
}: SimTransportProps) {
  const showLabels = variant === 'bar'
  return (
    <div className={`sim-transport sim-transport-${variant} ${className}`.trim()} role="group" aria-label="Controlo da simulação">
      <button type="button" onClick={onPlay} disabled={running} className="is-run" title="Iniciar simulação (RUN)" aria-label="Run">
        <IconPlay size={variant === 'dock' ? 13 : 15} />{showLabels && <span>Run</span>}
      </button>
      <button type="button" onClick={onPause} disabled={!running} className="is-pause" title="Pausar" aria-label="Pausar">
        <IconPause size={variant === 'dock' ? 13 : 15} />{showLabels && <span>Pausa</span>}
      </button>
      <button type="button" onClick={onStep} className="is-step" title="Avançar um ciclo" aria-label="Passo">
        <IconStep size={variant === 'dock' ? 13 : 15} />{showLabels && <span>Passo</span>}
      </button>
      <button type="button" onClick={onStop} disabled={stopped} className="is-stop" title="Parar (STOP)" aria-label="Stop">
        <IconStop size={variant === 'dock' ? 13 : 15} />{showLabels && <span>Stop</span>}
      </button>
      <button type="button" onClick={onReset} className="is-reset" title="Reiniciar a simulação" aria-label="Reiniciar">
        <IconReset size={variant === 'dock' ? 13 : 15} />{showLabels && <span>Reiniciar</span>}
      </button>
    </div>
  )
}
