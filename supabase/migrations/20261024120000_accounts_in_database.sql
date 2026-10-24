-- ==============================================================================
-- DC-SIMU — Contas de utilizador guardadas na base de dados
-- Pode ser executado várias vezes (idempotente). Execute no SQL Editor do Supabase.
--
-- 1. Corrige o papel (role): deixa de ser definido pelo cliente.
-- 2. Acrescenta last_login ao perfil + função touch_login().
-- 3. Cria perfis em falta para contas já existentes.
-- 4. Cria as duas contas fixas (admin / user) no Supabase Auth.
-- ==============================================================================

-- 1a. O papel é decidido apenas aqui: só o email do administrador fixo é 'admin'.
CREATE OR REPLACE FUNCTION public.default_role_for(p_email TEXT)
RETURNS TEXT AS $$
  SELECT CASE WHEN lower(p_email) = 'admin@dcsimu.local' THEN 'admin' ELSE 'user' END;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    public.default_role_for(NEW.email)
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
  IF auth.uid() IS NOT NULL THEN
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
       public.default_role_for(u.email)
FROM auth.users u
WHERE u.email IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- Quem já tinha recebido 'admin' por metadados forjados volta a utilizador comum.
UPDATE public.profiles SET role = public.default_role_for(email) WHERE role = 'admin' AND public.default_role_for(email) <> 'admin';

-- 4. Contas fixas no Supabase Auth (palavras-passe iguais às do servidor/local).
--    ATENÇÃO: altere as palavras-passe abaixo se as mudar em server/index.mjs.
DO $$
DECLARE
  acc RECORD;
  uid UUID;
BEGIN
  FOR acc IN
    SELECT * FROM (VALUES
      ('admin@dcsimu.local', 'Admin', 'AdminDcsimu2026!'),
      ('user@dcsimu.local',  'User',  'UserDcsimu2026!')
    ) AS t(email, name, pwd)
  LOOP
    SELECT id INTO uid FROM auth.users WHERE email = acc.email;
    IF uid IS NULL THEN
      uid := gen_random_uuid();
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new
      ) VALUES (
        '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', acc.email,
        extensions.crypt(acc.pwd, extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('name', acc.name),
        now(), now(), '', '', '', ''
      );
      INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      VALUES (
        gen_random_uuid(), uid::text, uid,
        jsonb_build_object('sub', uid::text, 'email', acc.email, 'email_verified', true),
        'email', now(), now(), now()
      );
    ELSE
      UPDATE auth.users
         SET encrypted_password = extensions.crypt(acc.pwd, extensions.gen_salt('bf')),
             email_confirmed_at = COALESCE(email_confirmed_at, now()),
             updated_at = now()
       WHERE id = uid;
    END IF;
  END LOOP;
END $$;
