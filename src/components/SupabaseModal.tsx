import { useState } from 'react'
import {
  clearSupabaseConfig,
  getSupabaseConfig,
  isSupabaseConfigured,
  saveSupabaseConfig,
  testSupabaseConnection,
} from '../supabase/supabaseClient'
import { IconClose } from '../ui/icons'

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

export default function SupabaseModal({ isOpen, onClose, onConfigChanged }: SupabaseModalProps) {
  const currentConfig = getSupabaseConfig()
  const [url, setUrl] = useState(currentConfig.url)
  const [anonKey, setAnonKey] = useState(currentConfig.anonKey)
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
    window.location.reload()
  }

  const handleDisconnect = () => {
    if (confirm('Deseja desconectar o Supabase e voltar à base de dados local/SQLite?')) {
      clearSupabaseConfig()
      setUrl('')
      setAnonKey('')
      setTestResult(null)
      onConfigChanged?.()
      onClose()
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

  return (
    <div
      className="dx-dialog-backdrop is-open"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
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
          borderRadius: '12px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
          maxWidth: '560px',
          width: '100%',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid #e2e8f0',
        }}
      >
        {/* Cabeçalho */}
        <div
          style={{
            padding: '18px 22px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#f8fafc',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: '#3ecf8e',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                fontWeight: '800',
                fontSize: '17px',
              }}
            >
              ⚡
            </span>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: 0 }}>
                Base de Dados: Supabase (PostgreSQL)
              </h2>
              <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
                {configured ? '● Conectado ao Supabase na nuvem' : '○ Não configurado (usando base local)'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="dx-icon-btn"
            style={{ width: '28px', height: '28px', border: 'none', background: 'transparent', cursor: 'pointer' }}
            aria-label="Fechar"
          >
            <IconClose size={14} />
          </button>
        </div>

        {/* Corpo */}
        <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '75vh', overflowY: 'auto' }}>
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '8px',
              background: configured ? '#f0fdf4' : '#eff6ff',
              border: `1px solid ${configured ? '#bbf7d0' : '#bfdbfe'}`,
              fontSize: '12.5px',
              lineHeight: '1.5',
              color: configured ? '#166534' : '#1e40af',
            }}
          >
            {configured ? (
              <div>
                <strong>Estado:</strong> O DC-SIMU está conectado ao Supabase. Os seus esquemas elétricos, programas Ladder e GRAFCET são guardados em tempo real na sua base de dados PostgreSQL.
              </div>
            ) : (
              <div>
                <strong>Guarde os seus projetos na nuvem:</strong> Conecte uma base de dados gratuita do Supabase para acessar os seus quadros de qualquer computador.
              </div>
            )}
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: '600', color: '#334155' }}>
            Project URL (URL do Projeto Supabase)
            <input
              className="dc-input"
              style={{ padding: '9px 12px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
              placeholder="https://xyzabcdefghijk.supabase.co"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'normal' }}>
              Encontra em: <i>Project Settings &gt; API &gt; Project URL</i>
            </span>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: '600', color: '#334155' }}>
            Project API Key (Chave Anon / Pública)
            <input
              className="dc-input"
              type="password"
              style={{ padding: '9px 12px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
            />
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'normal' }}>
              Encontra em: <i>Project Settings &gt; API &gt; Project API keys &gt; anon / public</i>
            </span>
          </label>

          {/* Resultado do Teste */}
          {testResult && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                background: testResult.ok ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${testResult.ok ? '#86efac' : '#fca5a5'}`,
                color: testResult.ok ? '#15803d' : '#b91c1c',
              }}
            >
              {testResult.ok ? '✓ ' : '✕ '} {testResult.message}
            </div>
          )}

          {/* Guia Rápido do Schema SQL */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#334155' }}>
                Script SQL de Criação de Tabelas (Schema)
              </span>
              <button
                type="button"
                className="dx-btn dx-btn-sm"
                onClick={copySql}
                style={{ fontSize: '11px', padding: '2px 8px' }}
              >
                {copied ? '✓ Copiado!' : 'Copiar Script SQL'}
              </button>
            </div>
            <p style={{ fontSize: '11.5px', color: '#64748b', margin: 0, lineHeight: '1.4' }}>
              Basta abrir o <b>SQL Editor</b> no painel do Supabase, colar este script e clicar em <b>RUN</b>. Ele cria as tabelas de projetos, utilizadores e permissões RLS.
            </p>
          </div>
        </div>

        {/* Rodapé com botões de ação */}
        <div
          style={{
            padding: '14px 22px',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#f8fafc',
          }}
        >
          <div>
            {configured && (
              <button
                type="button"
                className="dx-btn"
                style={{ color: '#dc2626', borderColor: '#fca5a5', fontSize: '12px', padding: '6px 12px' }}
                onClick={handleDisconnect}
              >
                Desconectar
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="dx-btn dx-btn-secondary"
              onClick={handleTest}
              disabled={testing || !url || !anonKey}
              style={{ fontSize: '12.5px', padding: '6px 14px' }}
            >
              {testing ? 'A testar…' : 'Testar Ligação'}
            </button>
            <button
              type="button"
              className="dx-btn dx-btn-primary"
              onClick={handleSave}
              disabled={!url || !anonKey}
              style={{ fontSize: '12.5px', padding: '6px 16px', background: '#2563eb' }}
            >
              Guardar e Conectar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
