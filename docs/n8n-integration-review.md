# Verificação DC-SIMU / n8n

Verificado em 18/10/2026. A integração existe na interface, mas o envio do GRAFCET não está ligado à versão publicada do workflow.

## Git

- `main` atualizado por fast-forward para `00789fc`, igual a `origin/main` (232 commits recebidos).
- O trabalho local anterior foi preservado no stash `bb34e2c`, com a mensagem `codex: backup local antes do pull n8n 2026-10-18`.
- O stash não foi reaplicado: contém versões antigas de muitos ficheiros também alterados no remoto, além dos ajustes locais de ambiente Supabase. O ficheiro `.env`, ignorado pelo Git, permaneceu no disco.
- O checkout usa sparse-checkout para excluir apenas dois ZIPs com `:` no nome, incompatíveis com Windows: as cópias de `ImageToStl.com_EC+1+12DC:1A+S-R+Electronic+circuit+breaker.glb.zip` em `public/models/acionamentos` e `dist/models/acionamentos`. Os ficheiros continuam no histórico remoto.

## O que o projeto faz

- O dashboard e o menu de conta abrem o modal de configuração n8n.
- O botão n8n do editor GRAFCET envia `grafcet.export`, com etapas, transições, Ladder, nome do projeto e metadados.
- O cliente tenta primeiro `POST /api/n8n/trigger`, depois o webhook diretamente e por fim uma consulta GET à API do n8n.
- O código prevê nomes de eventos para guardar projetos e iniciar simulações, mas não encontrei chamadas que enviem esses eventos automaticamente. As chamadas implementadas são o envio manual do GRAFCET e o teste no modal.

## Problemas confirmados

1. **Workflow publicado diferente do rascunho.** O workflow `MipSJCjJ6fya9UGt` está ativo. A versão publicada `0b25729e-c710-4a56-bbaf-f061bb6cf08d` tem 22 nós; o rascunho `27216e02-cf23-41d0-936d-44357ed0c6d9` tem 65 nós. Os novos caminhos VSCode, Figma e Deploy existem no rascunho, não na versão publicada.
2. **Webhook incompatível.** O projeto aponta para `/webhook/dcsimu-events`. O único webhook da versão publicada é `POST /webhook/github-dc-simu`, que espera eventos GitHub. O rascunho acrescenta `/webhook/vscode-dc-simu` e `/webhook/dc-simu-deploy`, mas não o endpoint usado pelo projeto. O payload `grafcet.export` também não tem um ramo específico de tratamento.
3. **Sucesso sem execução.** Em `src/n8n/n8nClient.ts`, tanto o disparo como o teste retornam `ok: true` mesmo após falharem todas as tentativas. O proxy em `server/index.mjs` também termina com HTTP 200 e `ok: true` se webhook e API falharem. A consulta GET ao workflow comprova acesso à definição, mas não executa o fluxo.
4. **Credencial exposta no frontend.** A API key fornecida está escrita diretamente em `src/n8n/n8nClient.ts`. O cliente também admite `VITE_N8N_API_KEY` e guarda a chave no localStorage. Deve ser removida do código público e rodada no n8n; o segredo deve ficar no servidor.
5. **Proxy permite destinos arbitrários.** A rota `/api/n8n/trigger` não exige sessão e aceita `webhookUrl` no corpo. Se houver `N8N_API_KEY` no servidor, encaminha-a para esse destino. Deve exigir autorização e usar um destino configurado exclusivamente no servidor.
6. **Execuções automáticas em erro.** As quatro execuções automáticas mais recentes consultadas (`8`, `5`, `4`, `3`) falharam. A execução `8` parou em `Supabase – Guardar Saúde` com `createdRows.forEach is not a function`. O nó anterior indicou Ollama operacional. O erro não permite concluir, por si só, se a causa é tabela, credencial ou resposta do serviço Supabase.
7. **Rascunho ainda incompleto.** Há placeholders de utilizador/repositório GitHub e equipa Figma, e `Config.api_token` ainda não está configurado. Os endpoints VSCode/Deploy verificam `x-dc-token` ou `body.token`, não a API key pública do n8n.
8. **Endereço Docker.** O Compose usa `http://localhost:5678` como destino n8n. Dentro do contentor da aplicação, esse endereço refere o próprio contentor. Se o n8n estiver noutro contentor/host, é necessário usar o nome do serviço numa rede partilhada ou o endereço adequado do host.

## Evidência e limites

### Atualização: erro de saúde corrigido

Foi confirmada a causa de `createdRows.forEach is not a function`: a credencial
`Supabase account` apontava para o painel web do Supabase, em vez da URL da API
`https://qeztfdmjqtikfrcketif.supabase.co`. O endereço foi corrigido no n8n,
preservando a chave existente. A API revelou depois que `public.dc_simu_health`
não existia; a tabela foi criada pela migração
`supabase/migrations/20261018093442_create_n8n_health_log.sql`.

A tabela tem RLS ativo e permite apenas SELECT/INSERT ao papel `service_role`;
`anon` e `authenticated` não têm acesso. A repetição da execução `16` criou a
execução `18`, concluída com sucesso no nó `Supabase – Guardar Saúde`, com um
registo inserido (`service=ollama`, `status=up`). Foi testado apenas este ramo;
os restantes problemas de integração descritos acima continuam por resolver.

### Evidência da revisão inicial

- API autenticada: leitura do workflow, da sua versão publicada e do histórico de execuções concluída.
- Existe apenas um workflow listado nesta instância: `DC-SIMU`, ativo.
- Teste isolado do cliente, com `fetch` simulado para falhar em todas as chamadas: cinco tentativas; `triggerOk=true` e `connectionOk=true`. Nenhum webhook real foi disparado pelo teste.
- Não foram publicados rascunhos, alteradas credenciais, criadas issues, enviados comentários nem iniciados deploys.
- Não foi validada a configuração de webhooks no lado do GitHub nem a credencial Supabase do n8n. A existência dos nós não comprova essas ligações.

## Próximas correções

1. Retirar e rodar a API key exposta; limitar e autenticar o proxy.
2. Definir um webhook para `grafcet.export`, com contrato de payload e resposta explícita; configurar o mesmo caminho no servidor e workflow.
3. Corrigir os retornos falsos de sucesso e separar o teste de ligação do disparo.
4. Corrigir o nó Supabase de saúde, preencher a configuração do rascunho e só então publicar e testar a versão pretendida.

Ficheiros principais: `dc-simu/src/n8n/n8nClient.ts`, `dc-simu/server/index.mjs`, `dc-simu/src/components/N8nModal.tsx`, `dc-simu/src/grafcet/GrafcetEditor.tsx` e `dc-simu/compose.yaml`.
