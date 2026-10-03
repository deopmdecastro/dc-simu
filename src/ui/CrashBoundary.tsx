import { Component, type ErrorInfo, type ReactNode } from 'react'
import { recoverStaleBuild } from '../utils/recoverStaleBuild'

/**
 * Barreira de erro com cara de aplicação: em vez de um ecrã branco, mostra o
 * que falhou e dá duas saídas — recarregar ou limpar a cache do PWA (a causa
 * mais comum de «não abre» depois de uma atualização).
 */
export default class CrashBoundary extends Component<{ title?: string; onClose?: () => void; children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[DC-SIMU] falha no ecrã:', error, info.componentStack) }
  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return <div className="ce-root"><div className="ce-loading" style={{ display: 'grid', gap: 12, justifyItems: 'center', textAlign: 'center', padding: 24 }}>
      <p className="ce-error" style={{ maxWidth: 520 }}><b>{this.props.title ?? 'Não foi possível abrir este ecrã.'}</b></p>
      <p className="ce-status-dim" style={{ maxWidth: 520, wordBreak: 'break-word' }}>{error.message}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button className="dx-btn dx-btn-primary" onClick={() => window.location.reload()}>Recarregar</button>
        <button className="dx-btn dx-btn-secondary" onClick={() => void recoverStaleBuild('manual')}>Limpar cache e recarregar</button>
        {this.props.onClose && <button className="dx-btn dx-btn-ghost" onClick={this.props.onClose}>Voltar</button>}
      </div>
    </div></div>
  }
}
