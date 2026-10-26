-- ==============================================================================
-- DC-SIMU — SaaS: planos, preços, pedidos de plano, comentários e estado dos componentes
-- Idempotente. Execute no SQL Editor do Supabase depois de schema.sql e da migração
-- 20261024120000_accounts_in_database.sql.
--
-- Pagamentos: NÃO há gateway integrado. Um pedido de plano é aprovado pelo
-- administrador (após confirmar o pagamento fora da aplicação).
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'admin');
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- 1. Plano de cada conta + nota interna do administrador.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS admin_note TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
DO $$ BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_plan_check CHECK (plan IN ('free', 'pro', 'escola', 'empresa'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- O utilizador não pode mudar o próprio plano, estado ou nota; o administrador pode.
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    NEW.role := OLD.role;
    NEW.email := OLD.email;
    NEW.plan := OLD.plan;
    NEW.plan_expires_at := OLD.plan_expires_at;
    NEW.admin_note := OLD.admin_note;
    NEW.active := OLD.active;
  ELSIF auth.uid() IS NOT NULL THEN
    -- Mesmo o administrador não muda papel nem email por esta via.
    NEW.role := OLD.role;
    NEW.email := OLD.email;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS "Administrador atualiza perfis" ON public.profiles;
CREATE POLICY "Administrador atualiza perfis"
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()));

-- 2. Configuração da plataforma (planos/preços). Leitura pública: a landing page
--    mostra os cartões sem sessão iniciada.
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_by TEXT
);
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Preços públicos" ON public.platform_settings;
CREATE POLICY "Preços públicos" ON public.platform_settings FOR SELECT TO anon, authenticated USING (key = 'pricing');
DROP POLICY IF EXISTS "Administrador gere a plataforma" ON public.platform_settings;
CREATE POLICY "Administrador gere a plataforma" ON public.platform_settings FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- 3. Pedidos de mudança de plano.
CREATE TABLE IF NOT EXISTS public.plan_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('free', 'pro', 'escola', 'empresa')),
  period TEXT NOT NULL DEFAULT 'monthly' CHECK (period IN ('monthly', 'yearly')),
  message TEXT CHECK (char_length(message) <= 500),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  decided_at TIMESTAMPTZ,
  decided_by TEXT,
  decision_note TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS plan_requests_one_pending ON public.plan_requests(user_id) WHERE status = 'pending';
ALTER TABLE public.plan_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Ver os próprios pedidos" ON public.plan_requests;
CREATE POLICY "Ver os próprios pedidos" ON public.plan_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "Criar pedido próprio" ON public.plan_requests;
CREATE POLICY "Criar pedido próprio" ON public.plan_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending');
DROP POLICY IF EXISTS "Cancelar pedido próprio ou decidir (admin)" ON public.plan_requests;
CREATE POLICY "Cancelar pedido próprio ou decidir (admin)" ON public.plan_requests FOR UPDATE TO authenticated
  USING ((user_id = auth.uid() AND status = 'pending') OR public.is_admin(auth.uid()))
  WITH CHECK ((user_id = auth.uid() AND status = 'cancelled') OR public.is_admin(auth.uid()));

-- 4. Comentários de projeto: proprietário e membros leem e escrevem; o autor edita
--    os seus; o proprietário pode apagar/resolver qualquer comentário do projeto.
CREATE TABLE IF NOT EXISTS public.project_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  anchor TEXT NOT NULL DEFAULT 'geral' CHECK (anchor IN ('geral', 'esquema', '3d', 'ladder', 'grafcet')),
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  edited_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS project_comments_project ON public.project_comments(project_id, created_at);
ALTER TABLE public.project_comments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_access_project(p_project_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT public.is_project_owner(p_project_id, p_user_id) OR public.is_project_member(p_project_id, p_user_id);
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

DROP POLICY IF EXISTS "Participantes leem comentários" ON public.project_comments;
CREATE POLICY "Participantes leem comentários" ON public.project_comments FOR SELECT TO authenticated
  USING (public.can_access_project(project_id, auth.uid()));
DROP POLICY IF EXISTS "Participantes comentam" ON public.project_comments;
CREATE POLICY "Participantes comentam" ON public.project_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.can_access_project(project_id, auth.uid()));
DROP POLICY IF EXISTS "Autor ou proprietário altera" ON public.project_comments;
CREATE POLICY "Autor ou proprietário altera" ON public.project_comments FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.is_project_owner(project_id, auth.uid()));
DROP POLICY IF EXISTS "Autor ou proprietário apaga" ON public.project_comments;
CREATE POLICY "Autor ou proprietário apaga" ON public.project_comments FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.is_project_owner(project_id, auth.uid()));

-- Só o autor muda o texto; o proprietário só pode mudar «resolved».
CREATE OR REPLACE FUNCTION public.protect_comment_body()
RETURNS TRIGGER AS $$
BEGIN
  NEW.project_id := OLD.project_id;
  NEW.author_id := OLD.author_id;
  NEW.created_at := OLD.created_at;
  IF NEW.body IS DISTINCT FROM OLD.body THEN
    IF OLD.author_id <> auth.uid() THEN NEW.body := OLD.body; ELSE NEW.edited_at := timezone('utc'::text, now()); END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
DROP TRIGGER IF EXISTS project_comments_protect ON public.project_comments;
CREATE TRIGGER project_comments_protect BEFORE UPDATE ON public.project_comments
  FOR EACH ROW EXECUTE PROCEDURE public.protect_comment_body();

-- 5. Estado dos componentes (ativo/bloqueado/arquivado/eliminado) e plano mínimo.
ALTER TABLE public.component_settings ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE public.component_settings ADD COLUMN IF NOT EXISTS min_plan TEXT;
DO $$ BEGIN
  ALTER TABLE public.component_settings ADD CONSTRAINT component_settings_status_check CHECK (status IS NULL OR status IN ('active', 'blocked', 'archived', 'deleted'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 6. Limite de projetos por plano, aplicado na base de dados (não só na interface).
CREATE OR REPLACE FUNCTION public.enforce_project_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT; v_plan TEXT; v_exp TIMESTAMPTZ; v_cfg JSONB; v_limit TEXT; v_count INT;
BEGIN
  SELECT role, plan, plan_expires_at INTO v_role, v_plan, v_exp FROM public.profiles WHERE id = NEW.owner_id;
  IF v_role = 'admin' THEN RETURN NEW; END IF;
  SELECT value INTO v_cfg FROM public.platform_settings WHERE key = 'pricing';
  IF v_plan IS NULL OR (v_exp IS NOT NULL AND v_exp < now()) THEN v_plan := COALESCE(v_cfg->>'defaultPlan', 'free'); END IF;
  IF v_cfg IS NULL THEN
    v_limit := CASE WHEN v_plan = 'free' THEN '3' ELSE NULL END;
  ELSE
    SELECT p->'limits'->>'projects' INTO v_limit FROM jsonb_array_elements(v_cfg->'plans') p WHERE p->>'id' = v_plan;
  END IF;
  IF v_limit IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_count FROM public.projects WHERE owner_id = NEW.owner_id;
  IF v_count >= v_limit::INT THEN
    RAISE EXCEPTION 'O seu plano permite % projeto(s). Elimine um projeto ou mude de plano.', v_limit USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
DROP TRIGGER IF EXISTS projects_plan_limit ON public.projects;
CREATE TRIGGER projects_plan_limit BEFORE INSERT ON public.projects
  FOR EACH ROW EXECUTE PROCEDURE public.enforce_project_limit();
