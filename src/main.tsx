import React from 'react'
import ReactDOM from 'react-dom/client'
import Account from './account'
import './index.css'
import './styles/dx.css'
import './styles/dx-dashboard.css'
import './styles/dx-landing.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Account />
  </React.StrictMode>,
)
