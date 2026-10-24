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

## 2. Executar o Script SQL
1. No menu lateral do Supabase, clique em **SQL Editor** (ícone do terminal `>_`).
2. Clique em **"New query"**.
3. Abra o arquivo `supabase/schema.sql` deste projeto, copie todo o seu conteúdo e cole no editor.
4. Clique no botão **"Run"** (no canto inferior direito).
5. O script criará:
   - Tabela `projects` (armazenamento do esquema elétrico, Ladder e GRAFCET em JSONB)
   - Tabela `profiles` (perfis de utilizadores sincronizados com `auth.users`)
   - Tabelas `project_members` e `project_invitations` (colaboração multi-utilizador)
   - Tabela `contributions` (modelos 3D e datasheets)
   - Tabela `audit_log` e `component_settings`
   - Políticas RLS (Row Level Security) ativadas e configuradas.

---

## 3. Obter as Chaves de Acesso
No painel do Supabase:
1. Vá a **Project Settings** (ícone de engrenagem) > **API**.
2. Copie os dois valores:
   - **Project URL**: algo como `https://xyzabcdefghijk.supabase.co`
   - **Project API keys > anon / public**: chave longa começando com `eyJ...`

---

## 4. Configurar no DC-SIMU

Você tem **duas formas** fáceis de configurar:

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
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
Reinicie o servidor com `npm run dev`. O DC-SIMU detectará o Supabase automaticamente!

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

- cria as contas fixas `admin@dcsimu.local` e `user@dcsimu.local` no Supabase Auth, para
  que o login delas também fique guardado na base de dados e os projetos sejam gravados lá;
- passa a decidir o papel (`admin`/`user`) apenas no servidor: deixa de ser possível
  registar-se como administrador através dos metadados, ou alterar o próprio papel em `profiles`;
- acrescenta `profiles.last_login` e a função `touch_login()`;
- cria perfis em falta para contas já existentes.

Se mudar as palavras-passe das contas fixas, atualize-as também nesse ficheiro antes de o executar.
Para o login funcionar, desative **Confirm email** em *Authentication → Providers → Email*
(os utilizadores novos registados pela app precisam disso, as contas fixas não).
