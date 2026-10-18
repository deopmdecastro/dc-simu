-- ==============================================================================
-- DC-SIMU — Schema Oficial para Supabase (PostgreSQL)
-- ==============================================================================
-- Instruções:
-- 1. Acesse o seu painel do Supabase: https://supabase.com/dashboard
-- 2. Abra o seu projeto e clique em "SQL Editor" na barra lateral esquerda.
-- 3. Cole todo o conteúdo deste arquivo e clique em "Run" (Executar).
-- 4. O seu Supabase estará 100% configurado com tabelas, RLS e triggers!
-- ==============================================================================

-- 1. PERFIS DE UTILIZADOR (sincronizados com auth.users do Supabase)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Perfis visíveis para utilizadores autenticados"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Utilizadores podem atualizar o seu próprio perfil"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- Trigger para criar o perfil público automaticamente quando um novo utilizador se regista
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = EXCLUDED.name;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 2. TABELA DE PROJETOS (Esquema elétrico, Ladder e GRAFCET)
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_projects_owner ON public.projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON public.projects(updated_at DESC);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- 3. MEMBROS COLABORADORES DO PROJETO
CREATE TABLE IF NOT EXISTS public.project_members (
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('owner', 'editor')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (project_id, user_id)
);

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- 4. CONVITES PARA COLABORAR EM PROJETOS
CREATE TABLE IF NOT EXISTS public.project_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(project_id, user_id)
);

ALTER TABLE public.project_invitations ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS RLS PARA PROJETOS
CREATE POLICY "Utilizador pode ver projetos onde é proprietário ou membro"
  ON public.projects FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.project_members m
      WHERE m.project_id = projects.id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Utilizador autenticado pode criar projetos"
  ON public.projects FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Proprietários e membros podem atualizar projetos"
  ON public.projects FOR UPDATE
  TO authenticated
  USING (
    owner_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.project_members m
      WHERE m.project_id = projects.id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Apenas o proprietário pode eliminar o projeto"
  ON public.projects FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());

-- POLÍTICAS RLS PARA MEMBROS
CREATE POLICY "Membros de um projeto são visíveis para os participantes"
  ON public.project_members FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_members.project_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Apenas proprietário do projeto pode adicionar membros"
  ON public.project_members FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_members.project_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Proprietário ou o próprio membro pode remover a associação"
  ON public.project_members FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_members.project_id AND p.owner_id = auth.uid()
    )
  );

-- POLÍTICAS RLS PARA CONVITES
CREATE POLICY "Destinatário ou remetente pode ver convites"
  ON public.project_invitations FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR sender_id = auth.uid());

CREATE POLICY "Proprietário do projeto pode enviar convites"
  ON public.project_invitations FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_invitations.project_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Destinatário ou remetente pode responder/apagar convites"
  ON public.project_invitations FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() OR sender_id = auth.uid());

-- 5. CONTRIBUIÇÕES DA COMUNIDADE (Modelos 3D e Datasheets)
CREATE TABLE IF NOT EXISTS public.contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  component_type TEXT,
  custom_name TEXT,
  description TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL,
  size BIGINT NOT NULL DEFAULT 0,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  file_ready BOOLEAN NOT NULL DEFAULT false,
  glb TEXT,
  review_note TEXT,
  reviewed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contribuições aprovadas são públicas ou autor/admin pode vê-las"
  ON public.contributions FOR SELECT
  TO authenticated
  USING (
    status = 'approved' OR
    author_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Utilizador pode submeter novas contribuições"
  ON public.contributions FOR INSERT
  TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "Autor pode atualizar rascunho ou admin pode moderar"
  ON public.contributions FOR UPDATE
  TO authenticated
  USING (
    (author_id = auth.uid() AND status = 'pending') OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 6. CONFIGURAÇÕES GLOBAIS DE COMPONENTES DO CATÁLOGO
CREATE TABLE IF NOT EXISTS public.component_settings (
  type TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT true,
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_by TEXT
);

ALTER TABLE public.component_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Configurações de componentes visíveis para todos os autenticados"
  ON public.component_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Apenas administradores podem alterar configurações de componentes"
  ON public.component_settings FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- 7. AUDITORIA E REGISTO DE EVENTOS
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name TEXT,
  actor_email TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  target_label TEXT,
  detail TEXT,
  ip TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_log_at ON public.audit_log(at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Apenas administradores podem consultar auditoria"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Qualquer utilizador autenticado pode registar eventos no log"
  ON public.audit_log FOR INSERT
  TO authenticated
  WITH CHECK (true);
