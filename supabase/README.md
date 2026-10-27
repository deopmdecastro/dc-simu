# Configuração do Supabase para o DC-SIMU

Este documento explica como configurar o Supabase como base de dados na nuvem (PostgreSQL) para o **DC-SIMU**.

---

## 1. Criar Projeto no Supabase
1. Acesse [https://supabase.com](https://supabase.com) e crie uma conta (gratuita).
2. Clique em **"New project"** e defina:
   - Nome do projeto: `DC-SIMU`
   - Senha do banco de dados: à sua escolha
   - Região: escolha a mais próxima (ex: `eu-central-1` / `sa-east-1` / `us-east-1`).

---

## 2. Criar o esquema e as migrações
1. No menu lateral do Supabase, clique em **SQL Editor** (ícone do terminal `>_`).
2. Clique em **"New query"**.
3. Abra `supabase/migrations/20261017000000_initial_schema.sql`, copie o conteúdo e cole no editor.
4. Clique no botão **"Run"** (no canto inferior direito).
5. O script inicial cria:
   - Tabela `projects` (armazenamento do esquema elétrico, Ladder e GRAFCET em JSONB)
   - Tabela `profiles` (perfis de utilizadores sincronizados com `auth.users`)
   - Tabelas `project_members` e `project_invitations` (colaboração multi-utilizador)
   - Tabela `contributions` (modelos 3D e datasheets)
   - Tabela `audit_log` e `component_settings`
   - Políticas RLS (Row Level Security) ativadas e configuradas.

Depois execute, pela ordem indicada, no SQL Editor:

1. `migrations/20261024120000_accounts_in_database.sql`
2. `migrations/20261026120000_saas_plans_comments.sql`
3. `migrations/20261027150000_catalog_storage.sql`

A terceira migração cria o catálogo de componentes 3D, perfis de bornes, os buckets
privados `catalog-models` e `contribution-files`, as respetivas políticas RLS e a
função transacional de publicação. Os GLB publicados e ficheiros de contribuição
são servidos com URLs assinadas a utilizadores autorizados.

---

## 3. Obter as Chaves de Acesso
No painel do Supabase:
1. Vá a **Project Settings** (ícone de engrenagem) > **API**.
2. Copie os dois valores:
   - **Project URL**: algo como `https://xyzabcdefghijk.supabase.co`
   - **Project API keys > anon / public**: chave longa começando com `eyJ...`

---

## 4. Configurar o DC-SIMU

### Produção (Vercel)

No projeto de produção da Vercel, defina estas variáveis em **Settings → Environment
Variables**, pelo menos para **Production** (e Preview se for usado para validação):

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Volte a construir/publicar a aplicação depois de guardar as variáveis. O build de
produção passa a exigir Supabase para autenticação e persistência; não usa valores
de Supabase guardados no navegador nem recorre ao modo local. Use apenas a chave
publicável no frontend (ou `VITE_SUPABASE_ANON_KEY` para projetos antigos). **Nunca** coloque `service_role`, `secret key` ou a
palavra-passe da base de dados numa variável `VITE_*`.

Antes de publicar, aplique as migrações acima no projeto Supabase de produção,
confirme que as contas pretendidas existem em **Authentication → Users** e promova
manualmente o perfil da conta administrativa pelo SQL Editor. A migração nunca
cria contas nem define palavras-passe. Exemplo (substitua pelo endereço verificado
do administrador):

```sql
UPDATE public.profiles
SET role = 'admin'
WHERE email = lower('admin@exemplo.pt');
```

Confirme que a consulta alterou exatamente um perfil. Todas as contas novas recebem
o papel `user`; os metadados enviados pelo cliente não podem promover uma conta.

### Desenvolvimento local

É possível configurar Supabase pela interface durante desenvolvimento, ou por
variáveis de ambiente:

### Opção A: Diretamente na Interface (Sem reiniciar)
1. Abra o DC-SIMU no navegador.
2. No Dashboard ou na barra superior, clique no botão **"Base de Dados: Supabase"**.
3. Cole o **URL do Projeto** e a **Chave Anon**.
4. Clique em **"Testar Ligação"** e depois em **"Guardar e Conectar"**.
5. Pronto! Os seus projetos e utilizadores passarão a ser guardados diretamente no Supabase.

### Opção B: Via Variáveis de Ambiente (.env)
Crie ou edite o arquivo `.env` na raiz do projeto:
```env
VITE_SUPABASE_URL=https://xyzabcdefghijk.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```
Reinicie o servidor com `npm run dev`. O DC-SIMU deteta o Supabase automaticamente.
No build local, a interface também permite configurar temporariamente o projeto.

### Supabase local (desenvolvimento)

Com o Docker Desktop ativo, inicie a stack local com
`node_modules/.bin/supabase start` (no PowerShell: `.\node_modules\.bin\supabase.cmd start`).
O Studio fica em `http://127.0.0.1:55423` e a API local em `http://127.0.0.1:55421`;
as migrações são aplicadas ao Postgres local no arranque. Esta stack é independente
do projeto hospedado e não altera dados de produção.

## Registos de saúde do n8n

O nó `Supabase – Guardar Saúde` usa a tabela `public.dc_simu_health`.
Em instalações existentes, execute no SQL Editor o conteúdo de
`migrations/20261018093442_create_n8n_health_log.sql`. O ficheiro pode ser
executado novamente e não elimina registos existentes. A tabela mantém RLS
ativo e acesso de leitura/inserção apenas para `service_role`.

Na credencial Supabase do n8n, use como Host a URL da API do projeto
(`https://<project-ref>.supabase.co`), sem `/rest/v1` e sem o caminho do painel
`supabase.com/dashboard/...`. A chave secreta pertence apenas à credencial do n8n.

## Contas de utilizador na base de dados

Execute `migrations/20261024120000_accounts_in_database.sql` no SQL Editor (pode ser
repetido). A migração:

- cria perfis em falta para utilizadores Auth já existentes e atribui `user` às novas contas;
- passa a decidir o papel (`admin`/`user`) apenas no servidor: deixa de ser possível
  registar-se como administrador através dos metadados, ou alterar o próprio papel em `profiles`;
- acrescenta `profiles.last_login` e a função `touch_login()`.

Crie primeiro a conta do administrador em Authentication ou através do registo da app;
depois promova apenas esse endereço com a instrução SQL acima. Configure a confirmação
de email em *Authentication → Providers → Email* conforme o processo de registo pretendido.

## Planos SaaS, preços e comentários

Execute `migrations/20261026120000_saas_plans_comments.sql` no SQL Editor (pode ser repetido),
depois da migração de contas. A migração:

- acrescenta `profiles.plan`, `plan_expires_at`, `admin_note` e `active`; o utilizador não
  consegue mudar o próprio plano (trigger `protect_profile_role`), o administrador sim;
- cria `platform_settings` (chave `pricing`, leitura pública para a landing page),
  `plan_requests` (pedidos de mudança de plano) e `project_comments` (com RLS por
  proprietário/membro do projeto);
- acrescenta `component_settings.status` (ativo/bloqueado/arquivado/eliminado) e `min_plan`;
- aplica o limite de projetos do plano num trigger `BEFORE INSERT` em `projects`.

Não há gateway de pagamento: o administrador aprova o pedido de plano depois de confirmar
o pagamento por fora. Sem esta migração a app continua a funcionar com os planos por omissão.
