import { useState } from 'react'
import { createPortal } from 'react-dom'
import {
  getN8nConfig,
  isN8nConfigured,
  saveN8nConfig,
  testN8nConnection,
  triggerN8nWorkflow,
} from '../n8n/n8nClient'
import { IconClose } from '../ui/icons'
import { N8nLogo } from '../ui/BrandLogos'

/* Cor oficial da marca n8n */
const N8N = '#EA4B71'
const N8N_DARK = '#c9355f'
const N8N_SOFT = '#fdf0f3'
const N8N_LINE = '#f8cdd8'

type N8nModalProps = {
  isOpen: boolean
  onClose: () => void
}

/** Pill de estado (conectado / não configurado). */
function StatusPill({ on, textOn, textOff }: { on: boolean; textOn: string; textOff: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        marginTop: '5px',
        padding: '3px 10px 3px 8px',
        borderRadius: '999px',
        fontSize: '11.5px',
        fontWeight: 600,
        lineHeight: 1.4,
        background: on ? N8N_SOFT : '#f1f5f9',
        border: `1px solid ${on ? N8N_LINE : '#e2e8f0'}`,
        color: on ? N8N_DARK : '#64748b',
      }}
    >
      <span
        aria-hidden
        style={{
          width: '7px',
          height: '7px',
          borderRadius: '50%',
          background: on ? N8N : '#94a3b8',
          boxShadow: on ? '0 0 0 3px rgba(234, 75, 113, 0.16)' : 'none',
        }}
      />
      {on ? textOn : textOff}
    </span>
  )
}

export default function N8nModal({ isOpen, onClose }: N8nModalProps) {
  const currentConfig = getN8nConfig()
  const [url, setUrl] = useState(currentConfig.url)
  const [apiKey, setApiKey] = useState(currentConfig.apiKey)
  const [workflowId, setWorkflowId] = useState(currentConfig.workflowId)
  const [webhookUrl, setWebhookUrl] = useState(currentConfig.webhookUrl)
  const [showKey, setShowKey] = useState(false)

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

  // Portal para o <body>: evita que a animação de entrada da vista (dx-view-in,
  // que retém um transform no .dx-dash) prenda o position:fixed do modal e o
  // descentre da viewport / deixe a topbar por cima do backdrop.
  return createPortal(
    <div
      className="dc-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 99999,
        padding: '12px',
      }}
      onClick={onClose}
    >
      <div
        className="dc-modal-card"
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '14px',
          width: '100%',
          maxWidth: '680px',
          maxHeight: 'calc(100dvh - 24px)',
          overflow: 'hidden',
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
            padding: '16px 20px',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '12px',
            background: `linear-gradient(to right, ${N8N_SOFT}, #ffffff 55%)`,
            flex: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', minWidth: 0 }}>
            <span
              style={{
                width: '40px',
                height: '40px',
                flex: 'none',
                borderRadius: '10px',
                backgroundColor: '#ffffff',
                border: `1px solid ${N8N_LINE}`,
                boxShadow: '0 2px 6px rgba(234, 75, 113, 0.2)',
                display: 'grid',
                placeItems: 'center',
              }}
              title="n8n"
            >
              <N8nLogo size={24} />
            </span>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#0f172a', lineHeight: 1.3 }}>
                Integração n8n Automation
              </h2>
              <StatusPill on={configured} textOn="Conectado ao workflow n8n" textOff="Não configurado" />
            </div>
          </div>
          <button
            type="button"
            className="dc-btn dc-btn-ghost"
            onClick={onClose}
            aria-label="Fechar"
            style={{
              width: '30px',
              height: '30px',
              flex: 'none',
              display: 'grid',
              placeItems: 'center',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              background: '#ffffff',
              color: '#475569',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <IconClose size={15} />
          </button>
        </div>

        {/* Conteúdo (rolável) */}
        <div
          style={{
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
            flex: '1 1 auto',
            minHeight: 0,
            overflowY: 'auto',
          }}
        >
          {/* Estado e Acesso Rápido ao Workflow */}
          <div
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              backgroundColor: N8N_SOFT,
              border: `1px solid ${N8N_LINE}`,
              fontSize: '13px',
              lineHeight: 1.5,
              color: N8N_DARK,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ minWidth: 0, wordBreak: 'break-all' }}>
                <strong>Workflow Vinculado:</strong> ID{' '}
                <code style={{ background: 'rgba(234, 75, 113, 0.1)', borderRadius: '5px', padding: '1px 6px', fontSize: '12px' }}>
                  {workflowId || '—'}
                </code>
              </div>
              {workflowId && (
                <a
                  href={workflowUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '7px',
                    backgroundColor: N8N,
                    color: '#ffffff',
                    padding: '7px 14px',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '12px',
                    textDecoration: 'none',
                    boxShadow: '0 2px 6px rgba(234, 75, 113, 0.35)',
                    flex: 'none',
                  }}
                >
                  <N8nLogo size={13} color="#ffffff" title="" />
                  Abrir Workflow no n8n ↗
                </a>
              )}
            </div>
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#9f2f53' }}>
              O DC-SIMU pode disparar este workflow automaticamente ao gravar projetos, simular circuitos ou exportar esquemas GRAFCET/Ladder.
            </div>
          </div>

          {/* Campos de Configuração */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="dc-form-group">
              <label style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '5px' }}>
                Endereço do Servidor n8n (URL)
              </label>
              <input
                className="dc-input"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                placeholder="http://localhost:5678"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>

            <div className="dc-form-group">
              <label style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '5px' }}>
                Workflow ID
              </label>
              <input
                className="dc-input"
                autoComplete="off"
                spellCheck={false}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                placeholder="MipSJCjJ6fya9UGt"
                value={workflowId}
                onChange={(e) => setWorkflowId(e.target.value)}
              />
            </div>

            <div className="dc-form-group">
              <label style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '5px' }}>
                Chave da API Pública do n8n (API Key / JWT)
              </label>
              <span style={{ position: 'relative', display: 'block' }}>
                <input
                  className="dc-input"
                  type={showKey ? 'text' : 'password'}
                  autoComplete="off"
                  spellCheck={false}
                  style={{ width: '100%', padding: '9px 74px 9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontFamily: 'monospace', fontSize: '12.5px' }}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? 'Ocultar chave' : 'Mostrar chave'}
                  style={{
                    position: 'absolute',
                    right: '5px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    color: '#475569',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '5px 9px',
                    cursor: 'pointer',
                  }}
                >
                  {showKey ? 'Ocultar' : 'Mostrar'}
                </button>
              </span>
            </div>

            <div className="dc-form-group">
              <label style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '5px' }}>
                URL do Webhook (Opcional — para nós Webhook no n8n)
              </label>
              <input
                className="dc-input"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                placeholder="http://localhost:5678/webhook/dcsimu-events"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
              />
            </div>
          </div>

          {/* Feedback de Teste */}
          {testResult && (
            <div
              role="status"
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '12.5px',
                fontWeight: 500,
                backgroundColor: testResult.ok ? '#ecfdf5' : '#fef2f2',
                color: testResult.ok ? '#047857' : '#b91c1c',
                border: `1px solid ${testResult.ok ? '#a7f3d0' : '#fecaca'}`,
              }}
            >
              {testResult.ok ? '✓ ' : '✕ '}
              {testResult.message}
            </div>
          )}

          {triggerResult && (
            <div
              role="status"
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '12.5px',
                fontWeight: 500,
                backgroundColor: triggerResult.ok ? '#eff6ff' : '#fef2f2',
                color: triggerResult.ok ? '#1d4ed8' : '#b91c1c',
                border: `1px solid ${triggerResult.ok ? '#bfdbfe' : '#fecaca'}`,
              }}
            >
              {triggerResult.ok ? '⚡ ' : '✕ '}
              {triggerResult.message}
            </div>
          )}

          {/* Botões de Ação */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '2px' }}>
            <button
              type="button"
              className="dc-btn dc-btn-primary"
              style={{
                backgroundColor: N8N,
                borderColor: N8N_DARK,
                color: '#fff',
                padding: '9px 17px',
                fontWeight: 700,
                fontSize: '12.5px',
                borderRadius: '8px',
                border: `1px solid ${N8N_DARK}`,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(234, 75, 113, 0.3)',
              }}
              onClick={handleSave}
            >
              Guardar Configuração
            </button>

            <button
              type="button"
              className="dc-btn"
              style={{
                padding: '9px 16px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#334155',
                fontWeight: 600,
                fontSize: '12.5px',
                cursor: testing ? 'wait' : 'pointer',
                opacity: testing ? 0.6 : 1,
              }}
              disabled={testing}
              onClick={handleTest}
            >
              {testing ? 'A verificar…' : 'Testar Conexão'}
            </button>

            <button
              type="button"
              className="dc-btn"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                padding: '9px 16px',
                borderRadius: '8px',
                border: `1px solid ${N8N_LINE}`,
                backgroundColor: N8N_SOFT,
                color: N8N_DARK,
                fontWeight: 600,
                fontSize: '12.5px',
                cursor: triggering ? 'wait' : 'pointer',
                opacity: triggering ? 0.6 : 1,
              }}
              disabled={triggering}
              onClick={handleTriggerTest}
            >
              <N8nLogo size={13} color={N8N} title="" />
              {triggering ? 'A enviar…' : 'Disparar Teste para o Workflow'}
            </button>
          </div>

          {/* Instruções de Integração */}
          <div
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
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
            padding: '13px 20px',
            backgroundColor: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'flex-end',
            borderRadius: '0 0 14px 14px',
            flex: 'none',
          }}
        >
          <button
            type="button"
            className="dc-btn"
            style={{
              padding: '7px 18px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontWeight: 600,
              fontSize: '12.5px',
              cursor: 'pointer',
            }}
            onClick={onClose}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
