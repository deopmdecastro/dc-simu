import { useState } from 'react'
import { createPortal } from 'react-dom'
import { uiConfirm } from '../ui/dialogs'
import {
  clearSupabaseConfig,
  getSupabaseConfig,
  isSupabaseConfigured,
  saveSupabaseConfig,
  testSupabaseConnection,
} from '../supabase/supabaseClient'
import { IconClose, IconCheck, IconWarning } from '../ui/icons'
import { SupabaseLogo } from '../ui/BrandLogos'

const SCHEMA_SQL = `-- DC-SIMU: Script de Inicialização para o Supabase
-- Cole no SQL Editor do Supabase (https://supabase.com/dashboard) e clique em RUN.

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Perfis públicos" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Editar perfil próprio" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver projetos" ON public.projects FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Criar projetos" ON public.projects FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Editar projetos" ON public.projects FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Eliminar projetos" ON public.projects FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.project_members (
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'editor',
  PRIMARY KEY (project_id, user_id)
);
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.project_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(project_id, user_id)
);
ALTER TABLE public.project_invitations ENABLE ROW LEVEL SECURITY;
`

type SupabaseModalProps = {
  isOpen: boolean
  onClose: () => void
  onConfigChanged?: () => void
}

/** Pill de estado (conectado / não configurado). */
function StatusPill({ on, textOn, textOff }: { on: boolean; textOn: string; textOff: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 10px 3px 8px',
        borderRadius: '999px',
        fontSize: '11.5px',
        fontWeight: 600,
        lineHeight: 1.4,
        background: on ? '#f0fdf4' : '#f1f5f9',
        border: `1px solid ${on ? '#bbf7d0' : '#e2e8f0'}`,
        color: on ? '#15803d' : '#64748b',
      }}
    >
      <span
        aria-hidden
        style={{
          width: '7px',
          height: '7px',
          borderRadius: '50%',
          background: on ? '#22c55e' : '#94a3b8',
          boxShadow: on ? '0 0 0 3px rgba(34, 197, 94, 0.18)' : 'none',
        }}
      />
      {on ? textOn : textOff}
    </span>
  )
}

export default function SupabaseModal({ isOpen, onClose, onConfigChanged }: SupabaseModalProps) {
  const currentConfig = getSupabaseConfig()
  const [url, setUrl] = useState(currentConfig.url)
  const [anonKey, setAnonKey] = useState(currentConfig.anonKey)
  const [showKey, setShowKey] = useState(false)
  const [showSqlPreview, setShowSqlPreview] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [copied, setCopied] = useState(false)

  if (!isOpen) return null

  const configured = isSupabaseConfigured()

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testSupabaseConnection({ url: url.trim(), anonKey: anonKey.trim() })
      setTestResult(result)
    } finally {
      setTesting(false)
    }
  }

  const handleSave = () => {
    saveSupabaseConfig(url.trim(), anonKey.trim())
    onConfigChanged?.()
    onClose()
    ;(window as unknown as { __DCSIMU_ALLOW_UNLOAD__?: boolean }).__DCSIMU_ALLOW_UNLOAD__ = true
    window.location.reload()
  }

  const handleDisconnect = async () => {
    if (await uiConfirm('Deseja desconectar o Supabase e voltar à base de dados local/SQLite?', {
      title: 'Desconectar Supabase',
      confirmLabel: 'Desconectar',
      cancelLabel: 'Cancelar',
      danger: true,
    })) {
      clearSupabaseConfig()
      setUrl('')
      setAnonKey('')
      setTestResult(null)
      onConfigChanged?.()
      onClose()
      ;(window as unknown as { __DCSIMU_ALLOW_UNLOAD__?: boolean }).__DCSIMU_ALLOW_UNLOAD__ = true
      window.location.reload()
    }
  }

  const copySql = async () => {
    try {
      await navigator.clipboard.writeText(SCHEMA_SQL)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      /* fallback */
    }
  }

  return createPortal(
    <div
      className="dx-dialog-backdrop is-open"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.72)',
        backdropFilter: 'blur(6px)',
        zIndex: 99999,
        display: 'grid',
        placeItems: 'center',
        padding: '16px',
      }}
    >
      <div
        className="dx-dialog dx"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.28), 0 0 0 1px rgba(0, 0, 0, 0.05)',
          maxWidth: '600px',
          width: '100%',
          maxHeight: 'calc(100dvh - 32px)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid #e2e8f0',
          padding: 0,
        }}
      >
        {/* Cabeçalho */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '14px',
            background: 'linear-gradient(135deg, #f0fdf4 0%, #f8fafc 60%)',
            flex: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
            <span
              style={{
                width: '42px',
                height: '42px',
                flex: 'none',
                borderRadius: '12px',
                background: '#ffffff',
                border: '1px solid #bbf7d0',
                boxShadow: '0 4px 12px rgba(63, 207, 142, 0.2)',
                display: 'grid',
                placeItems: 'center',
              }}
              title="Supabase"
            >
              <SupabaseLogo size={24} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '16.5px', fontWeight: 700, color: '#0f172a', margin: 0, lineHeight: 1.25 }}>
                  Base de Dados: Supabase <span style={{ color: '#64748b', fontWeight: 500 }}>(PostgreSQL)</span>
                </h2>
                <span
                  style={{
                    fontSize: '10.5px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: '#0369a1',
                    background: '#e0f2fe',
                    padding: '2px 7px',
                    borderRadius: '5px',
                    border: '1px solid #bae6fd',
                  }}
                >
                  Admin
                </span>
              </div>
              <div style={{ marginTop: '5px' }}>
                <StatusPill
                  on={configured}
                  textOn="Conectado ao Supabase na nuvem"
                  textOff="Não configurado — a usar base local"
                />
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="dx-icon-btn"
            style={{
              width: '32px',
              height: '32px',
              flex: 'none',
              display: 'grid',
              placeItems: 'center',
              border: '1px solid #e2e8f0',
              borderRadius: '9px',
              background: '#ffffff',
              color: '#475569',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            aria-label="Fechar"
          >
            <IconClose size={14} />
          </button>
        </div>

        {/* Corpo (rolável) */}
        <div
          style={{
            padding: '22px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            flex: '1 1 auto',
            minHeight: 0,
            overflowY: 'auto',
          }}
        >
          {/* Banner de Estado */}
          <div
            style={{
              padding: '13px 16px',
              borderRadius: '11px',
              background: configured ? '#f0fdf4' : '#eff6ff',
              border: `1px solid ${configured ? '#bbf7d0' : '#bfdbfe'}`,
              fontSize: '12.5px',
              lineHeight: 1.55,
              color: configured ? '#166534' : '#1e40af',
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start',
            }}
          >
            <span style={{ flex: 'none', marginTop: '2px' }}>
              <SupabaseLogo size={18} color={configured ? '#16a34a' : '#3b82f6'} title="" />
            </span>
            {configured ? (
              <div>
                <strong>Estado:</strong> O DC-SIMU está conectado ao Supabase. Os seus esquemas elétricos, programas Ladder e GRAFCET são guardados em tempo real na sua base de dados PostgreSQL.
              </div>
            ) : (
              <div>
                <strong>Guarde os seus projetos na nuvem:</strong> conecte uma base de dados gratuita do Supabase para aceder aos seus quadros a partir de qualquer computador com segurança e sincronização contínua.
              </div>
            )}
          </div>

          {/* Project URL */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#334155' }}>
            Project URL (URL do Projeto Supabase)
            <input
              className="dc-input"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              style={{
                padding: '10px 14px',
                fontSize: '13px',
                border: '1px solid #cbd5e1',
                borderRadius: '9px',
                width: '100%',
                outline: 'none',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              }}
              placeholder="https://xyzabcdefghijk.supabase.co"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'normal' }}>
              Encontra em: <i>Project Settings &gt; API &gt; Project URL</i>
            </span>
          </label>

          {/* Project API Key */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#334155' }}>
            Project API Key (Chave Anon / Pública)
            <span style={{ position: 'relative', display: 'block' }}>
              <input
                className="dc-input"
                type={showKey ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                style={{
                  padding: '10px 80px 10px 14px',
                  fontSize: '13px',
                  fontFamily: showKey ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' : 'inherit',
                  border: '1px solid #cbd5e1',
                  borderRadius: '9px',
                  width: '100%',
                  outline: 'none',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                }}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                value={anonKey}
                onChange={(e) => setAnonKey(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                aria-label={showKey ? 'Ocultar chave' : 'Mostrar chave'}
                style={{
                  position: 'absolute',
                  right: '6px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  color: '#475569',
                  borderRadius: '7px',
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '5px 10px',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
              >
                {showKey ? 'Ocultar' : 'Mostrar'}
              </button>
            </span>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'normal' }}>
              Encontra em: <i>Project Settings &gt; API &gt; Project API keys &gt; anon / public</i>
            </span>
          </label>

          {/* Resultado do Teste */}
          {testResult && (
            <div
              role="status"
              style={{
                padding: '11px 14px',
                borderRadius: '9px',
                fontSize: '12.5px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: testResult.ok ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${testResult.ok ? '#86efac' : '#fca5a5'}`,
                color: testResult.ok ? '#15803d' : '#b91c1c',
              }}
            >
              {testResult.ok ? <IconCheck size={16} /> : <IconWarning size={16} />}
              <span>{testResult.message}</span>
            </div>
          )}

          {/* Card Schema SQL */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '11px',
              padding: '14px 16px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                flexWrap: 'wrap',
                marginBottom: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>
                  Script SQL de Criação de Tabelas (Schema)
                </span>
                <button
                  type="button"
                  onClick={() => setShowSqlPreview((v) => !v)}
                  style={{
                    fontSize: '11px',
                    color: '#2563eb',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: 0,
                  }}
                >
                  {showSqlPreview ? 'Ocultar preview' : 'Ver SQL'}
                </button>
              </div>
              <button
                type="button"
                className="dx-btn dx-btn-sm"
                onClick={copySql}
                style={{
                  fontSize: '11.5px',
                  fontWeight: 600,
                  padding: '5px 12px',
                  borderRadius: '7px',
                  border: '1px solid #cbd5e1',
                  background: copied ? '#f0fdf4' : '#ffffff',
                  color: copied ? '#15803d' : '#334155',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  transition: 'all 0.15s ease',
                }}
              >
                {copied ? (
                  <>
                    <IconCheck size={12} className="ui-ck" />
                    Copiado!
                  </>
                ) : (
                  'Copiar Script SQL'
                )}
              </button>
            </div>
            <p style={{ fontSize: '11.5px', color: '#64748b', margin: 0, lineHeight: 1.5 }}>
              Basta abrir o <b>SQL Editor</b> no painel do Supabase, colar este script e clicar em <b>RUN</b>. Ele cria as tabelas de projetos, utilizadores e permissões RLS.
            </p>
            {showSqlPreview && (
              <pre
                style={{
                  marginTop: '10px',
                  padding: '10px 12px',
                  background: '#0f172a',
                  color: '#e2e8f0',
                  borderRadius: '8px',
                  fontSize: '11px',
                  maxHeight: '140px',
                  overflowY: 'auto',
                  fontFamily: 'ui-monospace, monospace',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {SCHEMA_SQL}
              </pre>
            )}
          </div>
        </div>

        {/* Rodapé com botões de ação */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
            background: '#f8fafc',
            flex: 'none',
          }}
        >
          <div>
            {configured && (
              <button
                type="button"
                className="dx-btn"
                style={{
                  color: '#dc2626',
                  border: '1px solid #fecaca',
                  background: '#ffffff',
                  borderRadius: '9px',
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '8px 14px',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
                onClick={handleDisconnect}
              >
                Desconectar
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="dx-btn"
              onClick={handleTest}
              disabled={testing || !url || !anonKey}
              style={{
                fontSize: '12.5px',
                fontWeight: 600,
                padding: '8px 16px',
                borderRadius: '9px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#334155',
                cursor: testing || !url || !anonKey ? 'not-allowed' : 'pointer',
                opacity: testing || !url || !anonKey ? 0.55 : 1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {testing ? 'A testar ligação…' : 'Testar Ligação'}
            </button>
            <button
              type="button"
              className="dx-btn"
              onClick={handleSave}
              disabled={!url || !anonKey}
              style={{
                fontSize: '12.5px',
                fontWeight: 700,
                padding: '8px 18px',
                borderRadius: '9px',
                border: '1px solid #0d9e64',
                background: '#3FCF8E',
                color: '#06281a',
                cursor: !url || !anonKey ? 'not-allowed' : 'pointer',
                opacity: !url || !anonKey ? 0.55 : 1,
                boxShadow: '0 2px 8px rgba(63, 207, 142, 0.4)',
                transition: 'all 0.15s ease',
              }}
            >
              Guardar e Conectar
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
