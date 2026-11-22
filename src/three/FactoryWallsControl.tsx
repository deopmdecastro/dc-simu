import { useFactoryWalls, type FactoryWallsMode } from './factoryWalls'

const OPTIONS: Array<{ mode: FactoryWallsMode; label: string; title: string; icon: JSX.Element }> = [
  {
    mode: 'show',
    label: 'Mostrar',
    title: 'Paredes visíveis',
    icon: <path d="M2 13.5V4l6-2.5L14 4v9.5M2 13.5h12M5 13.5V7.5M11 13.5V7.5" />,
  },
  {
    mode: 'auto',
    label: 'Auto',
    title: 'Corte automático: esconde as paredes do lado da câmara para ver o interior',
    icon: <><path d="M2 13.5V4l6-2.5V13.5M2 13.5h12" /><path d="M10.5 6.5 14 4v9.5" strokeDasharray="1.6 1.6" /></>,
  },
  {
    mode: 'hide',
    label: 'Ocultar',
    title: 'Só o pavimento: esconde paredes, pilares e calha (os equipamentos continuam visíveis)',
    icon: <><path d="M2 13.5h12" /><path d="M2 10V4l6-2.5L14 4v6" strokeDasharray="1.6 1.6" opacity="0.7" /></>,
  },
]

/** Seletor «Paredes» da nave fabril: Mostrar / Auto / Ocultar (preferência de vista, guardada no navegador). */
export function FactoryWallsControl() {
  const mode = useFactoryWalls((s) => s.mode)
  const setMode = useFactoryWalls((s) => s.setMode)
  return (
    <div className="panel3d-walls" role="radiogroup" aria-label="Paredes da nave fabril" data-factory-walls>
      <span className="panel3d-walls-label">Paredes</span>
      {OPTIONS.map((o) => (
        <button
          key={o.mode}
          type="button"
          role="radio"
          aria-checked={mode === o.mode}
          className={mode === o.mode ? 'is-active' : ''}
          onClick={() => setMode(o.mode)}
          title={o.title}
          data-factory-walls-mode={o.mode}
        >
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {o.icon}
          </svg>
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  )
}
