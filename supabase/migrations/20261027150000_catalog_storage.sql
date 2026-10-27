-- DC-SIMU — catálogo 3D oficial e perfis personalizados de bornes.
-- Executar depois de schema.sql, 20261024120000_accounts_in_database.sql
-- e 20261026120000_saas_plans_comments.sql. Pode ser repetida.

CREATE TABLE IF NOT EXISTS public.catalog_components (
  id TEXT PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-]{3,40}$'),
  meta JSONB NOT NULL,
  draft JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  latest_version INTEGER NOT NULL DEFAULT 0 CHECK (latest_version >= 0),
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS public.catalog_versions (
  component_id TEXT NOT NULL REFERENCES public.catalog_components(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  note TEXT NOT NULL DEFAULT '',
  changes JSONB NOT NULL DEFAULT '[]'::jsonb,
  definition JSONB NOT NULL,
  runtime JSONB NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  published_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  published_by TEXT,
  PRIMARY KEY (component_id, version),
  CHECK (storage_path = component_id || '/' || version::text || '.glb')
);

CREATE TABLE IF NOT EXISTS public.terminal_profiles (
  id TEXT PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-]{3,40}$'),
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_by TEXT
);

ALTER TABLE public.catalog_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terminal_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Utilizadores veem componentes publicados" ON public.catalog_components;
CREATE POLICY "Utilizadores veem componentes publicados" ON public.catalog_components
  FOR SELECT TO authenticated USING (latest_version > 0 OR public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "Administradores gerem catálogo" ON public.catalog_components;
DROP POLICY IF EXISTS "Administradores criam catálogo" ON public.catalog_components;
CREATE POLICY "Administradores criam catálogo" ON public.catalog_components
  FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "Administradores atualizam catálogo" ON public.catalog_components;
CREATE POLICY "Administradores atualizam catálogo" ON public.catalog_components
  FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "Administradores eliminam apenas rascunhos" ON public.catalog_components;
CREATE POLICY "Administradores eliminam apenas rascunhos" ON public.catalog_components
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()) AND latest_version = 0);

DROP POLICY IF EXISTS "Utilizadores leem versões publicadas" ON public.catalog_versions;
CREATE POLICY "Utilizadores leem versões publicadas" ON public.catalog_versions
  FOR SELECT TO authenticated USING (
    public.is_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.catalog_components c
      WHERE c.id = component_id AND c.latest_version >= version
    )
  );
DROP POLICY IF EXISTS "Administradores publicam versões" ON public.catalog_versions;
CREATE POLICY "Administradores publicam versões" ON public.catalog_versions
  FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Utilizadores leem perfis de bornes" ON public.terminal_profiles;
CREATE POLICY "Utilizadores leem perfis de bornes" ON public.terminal_profiles
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Administradores gerem perfis de bornes" ON public.terminal_profiles;
CREATE POLICY "Administradores gerem perfis de bornes" ON public.terminal_profiles
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('catalog-models', 'catalog-models', false, 50000000, ARRAY['model/gltf-binary'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 50000000, allowed_mime_types = ARRAY['model/gltf-binary'];

DROP POLICY IF EXISTS "Leitura de GLB publicados" ON storage.objects;
CREATE POLICY "Leitura de GLB publicados" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'catalog-models' AND (
      public.is_admin(auth.uid()) OR EXISTS (
        SELECT 1 FROM public.catalog_versions v
        JOIN public.catalog_components c ON c.id = v.component_id
        WHERE v.storage_path = storage.objects.name AND c.latest_version >= v.version
      )
    )
  );
DROP POLICY IF EXISTS "Administradores carregam GLB" ON storage.objects;
CREATE POLICY "Administradores carregam GLB" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'catalog-models' AND public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "Administradores substituem GLB" ON storage.objects;
CREATE POLICY "Administradores substituem GLB" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'catalog-models' AND public.is_admin(auth.uid()) AND NOT EXISTS (
    SELECT 1 FROM public.catalog_versions v WHERE v.storage_path = storage.objects.name
  ))
  WITH CHECK (bucket_id = 'catalog-models' AND public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "Administradores removem GLB" ON storage.objects;
CREATE POLICY "Administradores removem GLB" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'catalog-models' AND public.is_admin(auth.uid()) AND NOT EXISTS (
    SELECT 1 FROM public.catalog_versions v WHERE v.storage_path = storage.objects.name
  ));

CREATE OR REPLACE FUNCTION public.publish_catalog_component(
  p_component_id TEXT, p_note TEXT, p_changes JSONB, p_definition JSONB,
  p_runtime JSONB, p_storage_path TEXT
) RETURNS INTEGER AS $$
DECLARE
  v_version INTEGER;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Apenas administradores podem publicar componentes.' USING ERRCODE = '42501'; END IF;
  IF p_component_id !~ '^[A-Za-z0-9_-]{3,40}$' OR p_runtime IS NULL OR p_definition IS NULL THEN
    RAISE EXCEPTION 'Dados de publicação inválidos.' USING ERRCODE = '22023';
  END IF;
  SELECT latest_version + 1 INTO v_version FROM public.catalog_components WHERE id = p_component_id FOR UPDATE;
  IF v_version IS NULL THEN RAISE EXCEPTION 'Componente não encontrado.' USING ERRCODE = 'P0002'; END IF;
  IF p_storage_path <> p_component_id || '/' || v_version::text || '.glb' THEN
    RAISE EXCEPTION 'Caminho do modelo inválido.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.catalog_versions(component_id, version, note, changes, definition, runtime, storage_path, published_by)
  VALUES (p_component_id, v_version, left(COALESCE(p_note, ''), 300), COALESCE(p_changes, '[]'::jsonb), p_definition, p_runtime, p_storage_path, auth.jwt()->>'email');
  UPDATE public.catalog_components SET latest_version = v_version, status = 'published', archived = false,
    updated_at = timezone('utc'::text, now()), updated_by = auth.jwt()->>'email'
    WHERE id = p_component_id;
  RETURN v_version;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.publish_catalog_component(TEXT, TEXT, JSONB, JSONB, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_catalog_component(TEXT, TEXT, JSONB, JSONB, JSONB, TEXT) TO authenticated;

-- Contribuições da comunidade: metadados em Postgres e ficheiros no Storage privado.
ALTER TABLE public.contributions ADD COLUMN IF NOT EXISTS storage_path TEXT;

DROP POLICY IF EXISTS "Autor ou administrador elimina contribuição" ON public.contributions;
CREATE POLICY "Autor ou administrador elimina contribuição" ON public.contributions FOR DELETE TO authenticated
  USING (author_id = auth.uid() AND status = 'pending' OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Administrador lê todos os projetos" ON public.projects;
CREATE POLICY "Administrador lê todos os projetos" ON public.projects FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Administrador elimina registos antigos" ON public.audit_log;
CREATE POLICY "Administrador elimina registos antigos" ON public.audit_log FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.protect_contribution_review()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    NEW.author_id := OLD.author_id;
    NEW.status := OLD.status;
    NEW.review_note := OLD.review_note;
    NEW.reviewed_by := OLD.reviewed_by;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
DROP TRIGGER IF EXISTS contributions_protect_review ON public.contributions;
CREATE TRIGGER contributions_protect_review BEFORE UPDATE ON public.contributions
  FOR EACH ROW EXECUTE PROCEDURE public.protect_contribution_review();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('contribution-files', 'contribution-files', false, 41943040, ARRAY['application/pdf', 'model/gltf-binary', 'application/octet-stream'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 41943040,
  allowed_mime_types = ARRAY['application/pdf', 'model/gltf-binary', 'application/octet-stream'];

DROP POLICY IF EXISTS "Leitura de ficheiros de contribuição" ON storage.objects;
CREATE POLICY "Leitura de ficheiros de contribuição" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'contribution-files' AND EXISTS (
    SELECT 1 FROM public.contributions c WHERE c.storage_path = storage.objects.name AND c.file_ready
      AND (c.author_id = auth.uid() OR c.status = 'approved' OR public.is_admin(auth.uid()))
  ));
DROP POLICY IF EXISTS "Autor carrega ficheiro de contribuição" ON storage.objects;
CREATE POLICY "Autor carrega ficheiro de contribuição" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'contribution-files' AND split_part(name, '/', 1) = auth.uid()::text AND EXISTS (
    SELECT 1 FROM public.contributions c WHERE c.storage_path = storage.objects.name AND c.author_id = auth.uid()
  ));
DROP POLICY IF EXISTS "Autor ou administrador remove ficheiro de contribuição" ON storage.objects;
CREATE POLICY "Autor ou administrador remove ficheiro de contribuição" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'contribution-files' AND (split_part(name, '/', 1) = auth.uid()::text OR public.is_admin(auth.uid())));
