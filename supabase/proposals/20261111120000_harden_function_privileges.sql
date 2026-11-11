-- ==============================================================================
-- DC-SIMU — Endurecimento das funções SECURITY DEFINER (avisos do Security Advisor)
-- Idempotente. Não altera dados nem políticas.
--
-- 1. Fixa o search_path das duas funções que ainda não o tinham.
-- 2. Funções de trigger: ninguém as chama diretamente, os triggers não precisam de EXECUTE.
-- 3. Funções usadas nas políticas RLS e RPC: todas as políticas são TO authenticated,
--    por isso deixam de ser executáveis sem sessão iniciada.
-- ==============================================================================

ALTER FUNCTION public.is_project_member(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.is_project_owner(uuid, uuid) SET search_path = public;

DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY (ARRAY[
      'enforce_project_limit', 'handle_new_user', 'protect_comment_body',
      'protect_contribution_review', 'protect_profile_role', 'rls_auto_enable'
    ])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
  END LOOP;

  FOR fn IN
    SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY (ARRAY[
      'can_access_project', 'is_admin', 'is_project_member', 'is_project_owner',
      'publish_catalog_component', 'touch_login'
    ])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
END $$;
