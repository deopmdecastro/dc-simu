import { useState } from 'react'
import {
  getN8nConfig,
  isN8nConfigured,
  saveN8nConfig,
  testN8nConnection,
  triggerN8nWorkflow,
} from '../n8n/n8nClient'
import { IconClose } from '../ui/icons'

type N8nModalProps = {
  isOpen: boolean
  onClose: () => void
}

export default function N8nModal({ isOpen, onClose }: N8nModalProps) {
  const currentConfig = getN8nConfig()
  const [url, setUrl] = useState(currentConfig.url)
  const [apiKey, setApiKey] = useState(currentConfig.apiKey)
  const [workflowId, setWorkflowId] = useState(currentConfig.workflowId)
  const [webhookUrl, setWebhookUrl] = useState(currentConfig.webhookUrl)

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [triggering, setTriggering] = useState(false)
  const [triggerResult, setTriggerResult] = useState<{ ok: boolean; message: string } | null>(null)

  if (!isOpen) return null

  const configured = isN8nConfigured()

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await testN8nConnection()
      setTestResult(res)
    } catch (err) {
      setTestResult({ ok: false, message: `Erro ao testar: ${String(err)}` })
    } finally {
      setTesting(false)
    }
  }

  const handleTriggerTest = async () => {
    setTriggering(true)
    setTriggerResult(null)
    try {
      const res = await triggerN8nWorkflow({
        event: 'manual.trigger',
        meta: {
          origem: 'DC-SIMU',
          mensagem: 'Disparo de teste do workflow n8n',
          data: new Date().toLocaleString('pt-PT'),
        },
      })
      setTriggerResult(res)
    } catch (err) {
      setTriggerResult({ ok: false, message: `Falha ao disparar: ${String(err)}` })
    } finally {
      setTriggering(false)
    }
  }

  const handleSave = () => {
    saveN8nConfig({
      url: url.trim(),
      apiKey: apiKey.trim(),
      workflowId: workflowId.trim(),
      webhookUrl: webhookUrl.trim(),
    })
    setTestResult({ ok: true, message: 'Configuração do n8n salva com sucesso!' })
  }

  const workflowUrl = `${url.replace(/\/$/, '')}/workflow/${workflowId}`

  return (
    <div
      className="dc-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        className="dc-modal-card"
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(to right, #fff1f2, #ffffff)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                backgroundColor: '#ea580c',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontWeight: 'bold',
                fontSize: '18px',
                boxShadow: '0 4px 6px -1px rgba(234, 88, 12, 0.3)',
              }}
            >
              n8n
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                Integração n8n Automation
              </h2>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                {configured ? '● Conectado ao workflow n8n' : '○ Não configurado'}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="dc-btn dc-btn-ghost"
            onClick={onClose}
            aria-label="Fechar"
            style={{ padding: '6px', borderRadius: '8px' }}
          >
            <IconClose size={18} />
          </button>
        </div>

        {/* Conteúdo */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Status e Acesso Rápido ao Workflow */}
          <div
            style={{
              padding: '16px',
              borderRadius: '8px',
              backgroundColor: '#fff7ed',
              border: '1px solid #fed7aa',
              fontSize: '13px',
              lineHeight: 1.5,
              color: '#9a3412',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <strong>Workflow Vinculado:</strong> ID <code>{workflowId}</code>
              </div>
              <a
                href={workflowUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#ea580c',
                  color: '#ffffff',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '12px',
                  textDecoration: 'none',
                }}
              >
                Abrir Workflow no n8n ↗
              </a>
            </div>
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#c2410c' }}>
              O DC-SIMU pode disparar este workflow automaticamente ao gravar projetos, simular circuitos ou exportar esquemas GRAFCET/Ladder.
            </div>
          </div>

          {/* Campos de Configuração */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="dc-form-group">
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                Endereço do Servidor n8n (URL)
              </label>
              <input
                className="dc-input"
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                placeholder="http://localhost:5678"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>

            <div className="dc-form-group">
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                Workflow ID
              </label>
              <input
                className="dc-input"
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                placeholder="MipSJCjJ6fya9UGt"
                value={workflowId}
                onChange={(e) => setWorkflowId(e.target.value)}
              />
            </div>

            <div className="dc-form-group">
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                Chave da API Pública do n8n (API Key / JWT)
              </label>
              <input
                className="dc-input"
                type="password"
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontFamily: 'monospace' }}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>

            <div className="dc-form-group">
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                URL do Webhook (Opcional — para nós Webhook no n8n)
              </label>
              <input
                className="dc-input"
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                placeholder="http://localhost:5678/webhook/dcsimu-events"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
              />
            </div>
          </div>

          {/* Feedback de Teste */}
          {testResult && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 500,
                backgroundColor: testResult.ok ? '#ecfdf5' : '#fef2f2',
                color: testResult.ok ? '#047857' : '#b91c1c',
                border: `1px solid ${testResult.ok ? '#a7f3d0' : '#fecaca'}`,
              }}
            >
              {testResult.message}
            </div>
          )}

          {triggerResult && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 500,
                backgroundColor: triggerResult.ok ? '#eff6ff' : '#fef2f2',
                color: triggerResult.ok ? '#1d4ed8' : '#b91c1c',
                border: `1px solid ${triggerResult.ok ? '#bfdbfe' : '#fecaca'}`,
              }}
            >
              {triggerResult.message}
            </div>
          )}

          {/* Botões de Ação */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '4px' }}>
            <button
              type="button"
              className="dc-btn dc-btn-primary"
              style={{ backgroundColor: '#ea580c', borderColor: '#c2410c', color: '#fff', padding: '8px 16px', fontWeight: 600, borderRadius: '6px' }}
              onClick={handleSave}
            >
              Guardar Configuração
            </button>

            <button
              type="button"
              className="dc-btn"
              style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              disabled={testing}
              onClick={handleTest}
            >
              {testing ? 'A verificar...' : 'Testar Conexão'}
            </button>

            <button
              type="button"
              className="dc-btn"
              style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc' }}
              disabled={triggering}
              onClick={handleTriggerTest}
            >
              {triggering ? 'A enviar...' : '⚡ Disparar Teste para o Workflow'}
            </button>
          </div>

          {/* Instruções de Integração */}
          <div
            style={{
              padding: '16px',
              borderRadius: '8px',
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              fontSize: '12px',
              lineHeight: 1.6,
              color: '#475569',
            }}
          >
            <strong style={{ color: '#0f172a', display: 'block', marginBottom: '6px' }}>
              Como usar no seu Workflow n8n:
            </strong>
            <ol style={{ paddingLeft: '18px', margin: 0 }}>
              <li>
                No n8n, adicione um nó <b>Webhook</b> com método <code>POST</code> e caminho <code>dcsimu-events</code>.
              </li>
              <li>
                Quando clicar em <b>«⚡ n8n»</b> no editor GRAFCET ou ao guardar projetos, os dados (etapas, transições, variáveis e código Ladder) serão enviados para o seu fluxo.
              </li>
              <li>
                Pode usar o n8n para enviar notificações no Telegram/Slack, gerar documentação automática, comunicar com PLCs reais ou sincronizar com o Supabase!
              </li>
            </ol>
          </div>
        </div>

        {/* Rodapé */}
        <div
          style={{
            padding: '14px 24px',
            backgroundColor: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'flex-end',
            borderRadius: '0 0 12px 12px',
          }}
        >
          <button
            type="button"
            className="dc-btn"
            style={{ padding: '6px 18px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            onClick={onClose}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
