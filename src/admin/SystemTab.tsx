import { uiConfirm } from '../ui/dialogs'
import { useCallback, useEffect, useState } from 'react'
import { formatBytes, formatDate } from '../contrib/ContribParts'
import { adminApi, downloadText } from './adminApi'
import { hardRefresh } from '../utils/cacheCleanup'
import type { SystemInfo } from './adminTypes'
import { IconCheckCircle, IconDownload, IconFileUpload, IconHistory, IconInbox, IconProjects, IconReset, IconShield, IconStorage, IconTools, IconUsers, IconCube, IconMonitor, IconTimer } from '../ui/icons'

function uptime(seconds = 0) {
  const d = Math.floor(seconds / 86400), h = Math.floor((seconds % 86400) / 3600), m = Math.floor((seconds % 3600) / 60)
  return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min`
}

/** Estado do sistema: armazenamento, contagens e exportação de dados. */
export default function SystemTab({ onError }: { onError: (message: string) => void }) {
  const [info, setInfo] = useState<SystemInfo | null>(null)
  const load = useCallback(async () => {
    try { setInfo(await adminApi.system()) } catch (value) { onError(value instanceof Error ? value.message : 'Falha ao ler o estado do sistema') }
  }, [onError])
  useEffect(() => { void load() }, [load])

  async function exportData() {
    try {
      const data = await adminApi.exportData()
      downloadText(`dcsimu-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json')
    } catch (value) { onError(value instanceof Error ? value.message : 'Falha na exportação') }
  }

  if (!info) return <div className="dx-admin-empty">A carregar…</div>
  const server = info.backend === 'server'
  return <>
    <div className="dx-admin-section"><h2>Sistema</h2><span>{server ? 'Servidor (SQLite)' : 'Navegador (sem servidor)'}</span></div>
    <div className="cb-stats sys-stats">
      <div className="sys-stat is-users"><span className="sys-stat-icon" aria-hidden><IconUsers size={14} /></span><strong>{info.counts.activeUsers}/{info.counts.users}</strong><span>Contas ativas</span></div>
      <div className="sys-stat is-sessions"><span className="sys-stat-icon" aria-hidden><IconShield size={14} /></span><strong>{info.counts.sessions}</strong><span>Sessões ativas</span></div>
      <div className="sys-stat is-projects"><span className="sys-stat-icon" aria-hidden><IconProjects size={14} /></span><strong>{info.counts.projects}</strong><span>Projetos</span></div>
      <div className="sys-stat is-contrib"><span className="sys-stat-icon" aria-hidden><IconInbox size={14} /></span><strong>{info.counts.contributions}</strong><span>Contribuições</span></div>
      <div className="sys-stat is-logs"><span className="sys-stat-icon" aria-hidden><IconHistory size={14} /></span><strong>{info.counts.logs}</strong><span>Eventos registados</span></div>
      <div className="sys-stat is-blocked"><span className="sys-stat-icon" aria-hidden><IconCube size={14} /></span><strong>{info.counts.disabledComponents}</strong><span>Componentes desativados</span></div>
    </div>
    <div className="adm-group">
      <h3>Armazenamento</h3>
      <div className="dx-admin-table">
        <div className="sys-row"><span className="sys-row-icon" aria-hidden><IconStorage size={14} /></span><span className="sys-row-text"><strong>Base de dados</strong> · {server ? 'ficheiro SQLite' : 'armazenamento local do navegador'}</span><span className="dx-chip">{formatBytes(info.databaseBytes)}</span></div>
        <div className="sys-row"><span className="sys-row-icon" aria-hidden><IconProjects size={14} /></span><span className="sys-row-text"><strong>Conteúdo dos projetos</strong></span><span className="dx-chip">{formatBytes(info.projectBytes)}</span></div>
        <div className="sys-row"><span className="sys-row-icon" aria-hidden><IconFileUpload size={14} /></span><span className="sys-row-text"><strong>Ficheiros de contribuições</strong> (PDF e GLB)</span><span className="dx-chip">{formatBytes(info.filesBytes)}</span></div>
      </div>
    </div>
    <div className="adm-group">
      <h3>Aplicação</h3>
      <div className="dx-admin-table">
        <div className="sys-row"><span className="sys-row-icon" aria-hidden><IconCheckCircle size={14} /></span><span className="sys-row-text"><strong>Versão carregada neste navegador</strong> · limpeza automática de caches a cada commit</span><span className="dx-chip">{String(__APP_BUILD_ID__).slice(0, 7)}…{String(__APP_BUILD_ID__).split('.').slice(-2).join('.')}</span></div>
        {server && <>
          <div className="sys-row"><span className="sys-row-icon" aria-hidden><IconTools size={14} /></span><span className="sys-row-text"><strong>Versão do servidor</strong></span><span className="dx-chip">{info.version ?? '—'}</span></div>
          <div className="sys-row"><span className="sys-row-icon" aria-hidden><IconMonitor size={14} /></span><span className="sys-row-text"><strong>Node.js</strong></span><span className="dx-chip">{info.node ?? '—'}</span></div>
          <div className="sys-row"><span className="sys-row-icon" aria-hidden><IconTimer size={14} /></span><span className="sys-row-text"><strong>Em execução desde</strong> · {info.startedAt ? formatDate(info.startedAt) : '—'}</span><span className="dx-chip">{uptime(info.uptimeSec)}</span></div>
          <div className="sys-row"><span className="sys-row-icon" aria-hidden><IconStorage size={14} /></span><span className="sys-row-text"><strong>Memória do processo</strong></span><span className="dx-chip">{info.memoryMb} MB</span></div>
        </>}
      </div>
    </div>
    <div className="cb-actions sys-actions">
      <button className="dx-btn dx-btn-secondary" onClick={() => void exportData()}><IconDownload size={12} /> Exportar dados (JSON)</button>
      <button className="dx-btn dx-btn-secondary" onClick={() => void load()}><IconReset size={12} /> Atualizar</button>
      <button className="dx-btn dx-btn-secondary" onClick={async () => { if (await uiConfirm('Limpar as caches deste navegador e recarregar a última versão? Os projetos e a sessão não são apagados.')) void hardRefresh() }}><IconShield size={12} /> Limpar cache e recarregar</button>
    </div>
    <p className="cb-note">A exportação inclui contas, projetos (metadados), contribuições, definições de componentes e registos. Não inclui palavras-passe nem o conteúdo dos projetos ou dos ficheiros. Para uma cópia de segurança completa guarde a pasta de dados do servidor (<code>DATA_DIR</code>).</p>
  </>
}
