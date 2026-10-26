import type { ShortcutHelpExtra } from './ShortcutHelp'

/** Mudança de vista — tratada na barra de ferramentas (Toolbar.tsx · VIEWS). */
export const VIEW_SHORTCUTS: ShortcutHelpExtra = {
  title: 'Vistas',
  items: [
    { keys: 'Ctrl+1 … Ctrl+4', action: 'Mudar para a 1.ª…4.ª vista visível' },
    { keys: 'F1', action: 'Abrir o Esquema' },
    { keys: 'F2', action: 'Abrir o Ladder' },
    { keys: 'F5', action: 'Abrir o GRAFCET' },
    { keys: 'F4', action: 'Abrir o Monitor' },
  ],
}

/** Ferramentas do Esquema 2D/3D (Toolbar.tsx · TOOLS). */
export const SCHEMATIC_TOOL_SHORTCUTS: ShortcutHelpExtra = {
  title: 'Ferramentas do esquema',
  items: [
    { keys: '1', action: 'Selecionar / arrastar componentes' },
    { keys: '2', action: 'Cabo: desenhar cabo entre bornes' },
    { keys: '3', action: 'Sonda: medir continuidade entre dois pontos' },
    { keys: '4', action: 'Apagar componente, cabo ou borne sob o cursor' },
    { keys: '5', action: 'Mover a vista (ou botão do meio / Alt+arrastar)' },
  ],
}
