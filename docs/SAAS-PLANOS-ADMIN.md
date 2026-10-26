# SaaS, planos e administração

Este documento cobre os planos pagos e o plano gratuito, a separação de acessos por plano, a gestão de componentes e de utilizadores, os comentários nos projetos e a compilação Ladder. Corresponde aos itens ADMIN-COMP-01, ADMIN-USERS-01, SAAS-PLANS-01, PROJ-COMMENTS-01 e LADDER-COMPILE-01 do backlog.

## Estado

| Área | Estado | Notas |
|---|---|---|
| Planos, preços e cartões da página inicial | implementado e testado | Testes `saas-smoke` (unitários) e `admin-saas-ui-smoke` (Playwright). |
| Separação de acessos por plano | implementado e testado | É aplicada no servidor (SQLite) e no Supabase (RLS e triggers). No modo local a separação é só na interface. |
| Pagamento | preparado | Não há gateway de pagamento: o utilizador pede o plano e o administrador aprova-o depois de confirmar o pagamento por fora da aplicação. |
| Gestão de componentes | implementado e testado | Bloquear, arquivar, eliminar, repor, plano mínimo, ações em lote e CSV. |
| Gestão de utilizadores | implementado e testado | Plano, fim do período, nota interna, bloqueio, filtros, ordenação e ações em lote. |
| Comentários nos projetos | implementado e testado | Proprietário e editores convidados trocam comentários. |
| Compilar no Ladder | implementado e testado | Analisa o Main, os FC e os blocos, verifica as chamadas CALL e as referências cruzadas; tem uma opção que bloqueia o RUN. |
| Migração Supabase | preparado | O ficheiro `supabase/migrations/20261026120000_saas_plans_comments.sql` tem de ser executado manualmente no projeto Supabase. |

## Planos

As regras são partilhadas pelo navegador e pelo servidor através de `src/saas/platformCore.mjs`.

| Plano | Preço por omissão | Projetos | Colaboradores por projeto | Funcionalidades |
|---|---|---|---|---|
| Free | 0 € | 3 | 0 | Vista 3D, Ladder, GRAFCET |
| Pro (destacado) | 12 €/mês ou 120 €/ano | ilimitados | 3 | Tudo: depuração Ladder, importação FluidSIM, PDF, Excel, partilha e comentários |
| Escola | 49 €/mês ou 490 €/ano | ilimitados | 30 | Tudo |
| Empresa | sob consulta (cartão oculto por omissão) | ilimitados | ilimitados | Tudo |

O administrador tem sempre acesso total e não tem plano.

Quando o fim do período expira, a conta passa para o plano por omissão (`defaultPlan`, que de origem é o Free). Os projetos já criados continuam acessíveis mesmo acima do limite; o que fica bloqueado é criar projetos novos.

### O que o administrador controla (Administração → Planos e preços)

- **Por plano:**
  - nome, frase curta, preço mensal e anual (deixar vazio significa «Sob consulta») e texto do botão;
  - funcionalidades (caixas de seleção) e limites (vazio significa ilimitado);
  - linhas extra do cartão;
  - ordem dos cartões.
- **Visibilidade na página inicial:**
  - **Cartão visível na página inicial**: liga ou desliga cada cartão;
  - **Destacado**: no máximo um plano, que aparece com o selo «Recomendado»;
  - **Mostrar a secção «Preços»**: oculta a secção inteira e a ligação no menu.
- **Opções gerais:** o plano por omissão, a moeda e a nota do preço anual.
- **Pedidos de plano:** aprovar ou recusar, com uma nota opcional. A aprovação aplica o plano e define o fim do período (1 mês ou 1 ano).

### Fluxo do utilizador

1. Na página inicial, o utilizador escolhe um cartão. Para o Free, o simulador abre diretamente; para os outros planos, abre o login e o plano escolhido fica pré-selecionado.
2. No painel, o cartão «O seu plano» mostra o plano em vigor, o uso face aos limites, as funcionalidades e um botão **Mudar de plano**.
3. O utilizador envia o pedido, que fica pendente; só pode ter um pedido pendente de cada vez e pode cancelá-lo.
4. O administrador confirma o pagamento por fora da aplicação e aprova o pedido.

### Onde é aplicado

| Camada | Como |
|---|---|
| Servidor (`server/saas.mjs`) | `POST /api/projects` e os convites passam por middlewares que respondem **HTTP 402** com uma mensagem em PT. Os comentários verificam o plano do autor ou do proprietário do projeto. |
| Supabase | Trigger `enforce_project_limit`, RLS em `plan_requests` e `project_comments`. `protect_profile_role` impede que um utilizador mude o seu próprio plano. |
| Interface | Uma vista não incluída no plano mostra um aviso no lugar do conteúdo: Ladder, GRAFCET, Visualização 3D e o separador Depuração. Os botões PDF, Excel e a importação FluidSIM mostram um aviso de upgrade. «Novo projeto» e «Convidar» avisam quando se atinge o limite. |
| Modo local (sem servidor) | Usa as mesmas regras, guardadas no `localStorage` (`src/auth/localSaas.ts`). **Só na interface**: quem controla o navegador consegue contorná-las. |

## Gestão de componentes (ADMIN-COMP-01)

| Estado | Efeito |
|---|---|
| Ativo | Aparece na biblioteca. |
| Bloqueado | Continua visível, com cadeado, mas não se pode inserir. Exige um motivo, que os utilizadores veem. |
| Arquivado | Sai da biblioteca e pode ser reposto. |
| Eliminado | Sai do catálogo; fica visível no filtro «Eliminados» e pode ser reposto. |

- **Plano mínimo:** o componente fica reservado a esse plano ou superior.
- **Projetos existentes:** os projetos que já usam o componente abrem sempre.
- **Ações em lote e exportação:** há ações em lote e uma exportação CSV com as colunas `estado` e `plano_minimo`.
- **Registos:** cada alteração fica registada com uma destas ações: `component.block`, `component.archive`, `component.delete`, `component.restore` ou `component.plan`.

## Gestão de utilizadores (ADMIN-USERS-01)

- **Pesquisa:** por nome, e-mail ou nota interna.
- **Filtros:** por papel, estado (ativas/bloqueadas) e plano, incluindo «Período expirado».
- **Ordenação:** por nome, mais recentes, último acesso ou n.º de projetos.
- **Contagem por plano:** pastilhas com o número de contas de cada plano, que também servem de filtro.
- **«Plano…»:** permite definir o plano, o fim do período e a nota interna.
- **«Detalhes»:** mostra a nota, os limites e o histórico de pedidos.
- **Bloquear e desbloquear:** pede confirmação e termina as sessões; no Supabase, o login de uma conta bloqueada é recusado.
- **Ações em lote:** mudar o plano, bloquear e desbloquear.
- **Contas fixas:** as duas contas fixas só permitem alterar o plano e a nota interna da conta «User».

## Comentários (PROJ-COMMENTS-01)

- **Onde se abrem:**
  - no editor, pelo botão **Comentários** na barra do projeto, que mostra o número por resolver;
  - no painel, pelo menu «⋯» do projeto, também nos projetos partilhados consigo.
- **Conteúdo:** cada comentário tem até 2000 caracteres e uma âncora (Geral, Esquema, 3D, Ladder, GRAFCET).
- **Permissões:**
  - o autor edita o seu comentário;
  - o autor, o proprietário e o administrador eliminam ou marcam como resolvido.
- **Quem pode escrever:** quem tem «Comentários» no seu plano ou no plano do proprietário do projeto.
- **Atualização:** a lista atualiza a cada 20 s enquanto está aberta.
- **Limite no servidor:** 20 comentários por minuto.

## Compilar no Ladder (LADDER-COMPILE-01)

O botão **Compilar** na barra do editor Ladder (atalho Ctrl+Shift+B) usa o módulo puro `src/ladder/ladderCompile.ts`. A compilação faz três tipos de verificação:

1. **Verificações locais por bloco:** endereços, operandos, LBL/JMP e presets. As etiquetas são locais a cada bloco.
2. **Referências cruzadas no programa completo:** bobinas duplicadas entre blocos, SET sem RESET, endereços lidos e nunca escritos, e tags.
3. **Verificações de chamadas:**
   - CALL sem destino ou para um bloco inexistente;
   - recursão direta e ciclos de chamadas;
   - CALL para um OB que já corre automaticamente;
   - FC nunca chamado;
   - Main vazio.

O separador «Compilação» mostra o resumo («Compilação concluída: X erro(s), Y aviso(s) · blocos, networks, instruções»), a hora e o aviso «programa alterado desde a última compilação», que compara uma impressão digital do programa. Cada linha leva ao bloco e à network do problema.

A opção **Bloquear RUN com erros** fica guardada no navegador. Com ela ativa, o RUN recusa arrancar enquanto houver erros e mostra uma mensagem no registo de eventos.

## Testes

- `npm run test:saas` — 58 verificações: planos, componentes, comentários, modo local e compilação.
- `npm run test:server` — inclui o bloco `saas:` (pedidos, aprovação, HTTP 402, comentários e registos).
- `npm run test:admin-saas-ui` — Playwright, 22 verificações: página inicial, separador de planos, utilizadores, componentes, pedido e aprovação de plano, comentários e compilação. Requer o Vite em `EDITORS_TEST_URL`.

## Pendências

- **Pagamento:** falta integrar um gateway de pagamento (por exemplo Stripe ou Easypay), com webhooks para aprovar os pedidos automaticamente.
- **Supabase:** a migração tem de ser executada manualmente.
- **Valor por omissão para contas existentes:** as contas existentes entram no plano por omissão (Free). Para manter o acesso total durante a transição, o administrador pode mudar o plano por omissão.
- **Comentários:** não há notificações por e-mail nem respostas em fio.
