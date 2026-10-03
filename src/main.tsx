import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import Account from './account'
import { startCatalogAutoUpdate } from './catalog/autoUpdate'
import UpdatePrompt from './components/UpdatePrompt'
import './index.css'
import './styles/schematic-editor.css'
import './styles/panel3d-editor.css'
import './styles/grafcet-editor.css'
import './styles/ladder-editor.css'
import './styles/dx.css'
import './styles/dx-dashboard.css'
import './styles/dx-landing.css'
import './styles/dx-contrib.css'
import './styles/component-view-editor.css'
import './styles/terminal-face-editor.css'
import './styles/catalog-editor.css'
import './styles/terminal-library.css'
import './styles/clean-mode.css'

startCatalogAutoUpdate()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Account />
      <UpdatePrompt />
    </BrowserRouter>
  </React.StrictMode>,
)
