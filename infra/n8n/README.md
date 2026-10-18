# Sandbox partilhado e SearXNG do n8n local

Esta pasta contém a configuração versionada. A instalação em execução está na
pasta `n8n-local`, irmã deste repositório; os seus ficheiros `.env`, `.env.original`
e backups permanecem locais. Alterar esta cópia não reconfigura os contentores
automaticamente.

Configuração aplicada em 18/10/2026, preservando o n8n 2.43.7 e o volume externo
`n8n_data`, com os workflows, utilizadores e credenciais existentes.

## Acesso

- n8n: http://localhost:5678
- SearXNG no computador: http://localhost:8088
- SearXNG para ferramentas/agents no n8n: `http://searxng:8080`
- Credencial no editor: **SearXNG local** (tipo SearXNG).
- Sandbox: configurado por variáveis de ambiente; em **Settings > Agents >
  Shared sandbox** deverá aparecer como configuração do servidor.

O Assistant recebe o SearXNG por `N8N_INSTANCE_AI_SEARXNG_URL`. Para um agente
que precisa de pesquisa de fallback, selecione a credencial **SearXNG local**
nas capacidades de pesquisa desse agente. Modelos que oferecem pesquisa nativa
podem usar o respetivo fornecedor. Não foram alterados modelos nem chaves LLM.

## Arranque e verificação

Execute no PowerShell, nesta pasta:

```powershell
node initialize.mjs
# Numa cópia nova, prepare o ambiente original sem incluir segredos no Git:
if (-not (Test-Path .env.original)) { Copy-Item .env.original.example .env.original }
docker compose up -d
docker compose ps
$OutputEncoding = [Text.UTF8Encoding]::new($false)
Get-Content -LiteralPath verify.mjs -Raw | docker compose exec -T n8n node --input-type=module
```

O comando de cópia é apenas para uma instalação nova: preserve `.env.original`
quando já existir. O volume externo `n8n_data` também deve existir antes do
arranque. As instruções de backup abaixo descrevem a instalação local existente.

O teste verifica a ligação ao sandbox, a exigência de autenticação, uma execução
Python real (`6 * 7 = 42`), a eliminação do sandbox temporário e resultados JSON
do SearXNG a partir do contentor n8n. Esses testes passaram após a instalação.
O workflow **DC-SIMU** permaneceu ativo e com as versões de edição/publicação
preservadas.

## Componentes e configuração

- Sandbox API, runner e imagem de execução: versão **1.9.0**.
- n8n e SearXNG estão fixados por digest em `.env`.
- Sandbox API e runner comunicam com mTLS; as chaves privadas têm modo 0600.
- API e runner não publicam portas no host. A interface SearXNG está exposta
  apenas em `127.0.0.1:8088`.
- O runner permite até dois sandboxes, cada um com 1 GiB, um núcleo e 256 processos.
- O runner usa Docker-in-Docker privilegiado, conforme a instalação local oficial.
  Esta configuração destina-se ao desenvolvimento local.
- A API, os certificados e o Docker interno usam volumes próprios. Os certificados
  não são renovados automaticamente; os certificados de serviço gerados pelo
  bootstrap têm validade de 825 dias.
- `.env` contém segredos gerados aleatoriamente; `.env.original` preserva o
  ambiente do contentor anterior. Estes ficheiros e `backups/` não devem ir para Git.
- `initialize.mjs` cria os segredos apenas se `.env` não existir.

## Backup e recuperação

Antes da troca de contentor, foi guardado o volume completo, com o n8n parado,
em `backups/n8n-data-before-sandbox.tar.gz`. Os parâmetros do contentor anterior
estão em `backups/n8n-original-inspect.json`.

O contentor anterior permanece parado com o nome
`n8n-before-sandbox-20261018`. Para regressar ao arranque anterior, pare primeiro
o serviço n8n do Compose e remova apenas o novo contentor, preservando os volumes;
depois volte a dar o nome `n8n` ao anterior e inicie-o. Nunca execute dois processos
n8n em simultâneo sobre o mesmo volume SQLite.

## Referências oficiais

- [Sandbox partilhado](https://docs.n8n.io/build/build-and-manage-agents#configure-the-shared-sandbox)
- [Configuração do Assistant](https://docs.n8n.io/deploy/host-n8n/configure-n8n/set-up-n8n-assistant)
- [Instalação Compose](https://docs.n8n.io/deploy/host-n8n/install-options/install-using-docker-compose)
- [Credencial SearXNG](https://docs.n8n.io/integrations/builtin/credentials/searxng)
