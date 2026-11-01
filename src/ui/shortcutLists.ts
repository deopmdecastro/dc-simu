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

/** Esquema IEC (CommandsEditor.tsx · teclado). */
export const COMMANDS_SHORTCUTS: ShortcutHelpExtra = {
  title: 'Esquema IEC',
  items: [
    { keys: '1 / V', action: 'Selecionar e arrastar símbolos' },
    { keys: '2 / L', action: 'Cabo: ligar bornes' },
    { keys: '4 / E', action: 'Apagar o símbolo ou cabo clicado' },
    { keys: '5 / H', action: 'Mover a vista' },
    { keys: 'R', action: 'Rodar o símbolo selecionado 90°' },
    { keys: 'Del', action: 'Apagar a seleção' },
    { keys: 'Ctrl+A', action: 'Selecionar tudo na página' },
    { keys: 'Ctrl+Z / Ctrl+Y', action: 'Desfazer / refazer' },
    { keys: 'Ctrl+0', action: 'Ajustar o esquema à janela' },
    { keys: 'Enter / F2', action: 'Editar o texto livre selecionado' },
    { keys: 'Esc', action: 'Cancelar e limpar a seleção' },
    { keys: '?', action: 'Mostrar esta ajuda' },
  ],
}
