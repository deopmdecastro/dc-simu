import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import Account from './account'
import { startCatalogAutoUpdate } from './catalog/autoUpdate'
import { installStaleBuildRecovery } from './utils/recoverStaleBuild'
import UpdatePrompt from './components/UpdatePrompt'
import DialogHost from './ui/dialogs'
import './index.css'
import './styles/schematic-editor.css'
import './styles/panel3d-editor.css'
import './styles/grafcet-editor.css'
import './styles/ladder-editor.css'
import './styles/dx.css'
import './styles/dx-dashboard.css'
import './styles/dx-landing.css'
import './styles/dx-contrib.css'
import './styles/dx-saas.css'
import './styles/component-view-editor.css'
import './styles/terminal-face-editor.css'
import './styles/catalog-editor.css'
import './styles/terminal-library.css'
import './styles/clean-mode.css'
import './styles/select.css'
/* Menus das barras de ferramentas (toolbarKit · ToolMenu) — comuns a todos os editores. */
import './styles/tool-menu.css'
import './styles/virtual-io.css'
import './styles/status-panel-refine.css'
import './styles/grafcet-sim.css'
import './styles/tag-table.css'
import './styles/sheet-transfer.css'
import './styles/toolbar-spacing.css'
import './styles/panel-system.css'
import './styles/admin-refine.css'
import './styles/admin-polish.css'
/* Opções dos cabos novos (cor, condutor, secção, terminal) no painel lateral. */
import './styles/wire-options.css'
import './styles/mobile-refine.css'
import './styles/panel-drawer.css'
import { EDITOR_GRID_STEP, EDITOR_THEME } from './ui/editorTheme'

const editorRootStyle = document.documentElement.style
editorRootStyle.setProperty('--editor-grid-step', `${EDITOR_GRID_STEP}px`)
editorRootStyle.setProperty('--editor-grid-background', EDITOR_THEME.background)
editorRootStyle.setProperty('--editor-grid-dot', EDITOR_THEME.dot)
editorRootStyle.setProperty('--editor-grid-line', EDITOR_THEME.line)
installStaleBuildRecovery()
startCatalogAutoUpdate()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Account />
      <UpdatePrompt />
      <DialogHost />
    </BrowserRouter>
  </React.StrictMode>,
)
