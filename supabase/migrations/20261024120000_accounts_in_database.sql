-- ==============================================================================
-- DC-SIMU — Contas de utilizador guardadas na base de dados
-- Pode ser executado várias vezes (idempotente). Execute no SQL Editor do Supabase.
--
-- 1. Corrige o papel (role): deixa de ser definido pelo cliente.
-- 2. Acrescenta last_login ao perfil + função touch_login().
-- 3. Cria perfis em falta para contas já existentes.
-- 4. As contas Auth são criadas pelo fluxo normal; não há credenciais fixas.
-- ==============================================================================

-- Novas contas recebem sempre o papel de utilizador. A promoção inicial de um
-- administrador é feita manualmente pelo proprietário do projeto Supabase.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'user'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = EXCLUDED.name;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1b. Um utilizador autenticado não pode promover o próprio perfil.
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    NEW.role := OLD.role;
    NEW.email := OLD.email;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS profiles_protect_role ON public.profiles;
CREATE TRIGGER profiles_protect_role
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.protect_profile_role();

-- 2. Último acesso.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.touch_login()
RETURNS VOID AS $$
  UPDATE public.profiles SET last_login = timezone('utc'::text, now()) WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.touch_login() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_login() TO authenticated;

-- 3. Perfis em falta para contas que já existiam antes do trigger.
INSERT INTO public.profiles (id, email, name, role)
SELECT u.id, u.email,
       COALESCE(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
       'user'
FROM auth.users u
WHERE u.email IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- A migração não cria utilizadores nem define palavras-passe. Crie a conta
-- administrativa em Authentication e promova apenas o respetivo perfil, por
-- exemplo: UPDATE public.profiles SET role = 'admin' WHERE email = '...';
