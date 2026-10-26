# Ladder — «Bloco»/«Nova network» na barra, network automática e barra de deslocamento

Data: 2026-10-26 · Projeto: BN-DCSIMU-001

## LADDER-TB-ADD-01 — botões na barra de ferramentas
- «+ Bloco» e «+ Nova network» passaram da barra do programa (e da barra do bloco) para a barra de ferramentas do Ladder, logo a seguir a «Compilar».
- Os botões emitem ações pelo barramento do Ladder (`ladderBus`: `addBlock`, `addNetwork`).
- «Nova network» adiciona ao bloco aberto (FC/FB) ou, sem bloco aberto, ao programa Main (OB1), foca a nova network e mostra a notificação «Nova network criada».
- «Bloco» abre o diálogo «Adicionar novo bloco».

## LADDER-AUTO-NET-01 — network vazia automática
- `src/ladder/autoNetwork.ts`: `rungHasContent()` e `withEmptyNetworkBelow()`.
- Quando uma network passa de vazia a ter conteúdo (contactos, bobinas, temporizador, contador, MOVE, operações, CALL, LIMIT, SCALE, salto) e a network de baixo não existe ou não está vazia, é inserida uma network vazia logo abaixo.
- Nome e comentário sozinhos não contam como conteúdo; mais elementos na mesma network não criam outra.
- Aplica-se ao programa principal (`updateRung` na store, na mesma entrada de histórico: um «Anular» remove as duas) e aos blocos FC/FB.

## TOOLBAR-SCROLL-02 — barra de deslocamento igual às outras
- As barras de ferramentas (`.dc-toolbar-main`, `.dc-toolbar-row2`, `.ladder-editor-toolbar`, `.grafcet-pages`) usam agora a mesma barra personalizada do resto da aplicação: 10 px, polegar `#cbd5e1` arredondado com margem transparente, `#94a3b8` ao passar, sem setas.
- Causa: `scrollbar-width: thin` fazia o Chrome ≥ 121 ignorar `::-webkit-scrollbar` e mostrar a barra nativa (escura, com setas). Fica `scrollbar-width: auto`; o Firefox usa `thin` + `#cbd5e1` (via `@supports not selector(::-webkit-scrollbar)`).
- Ecrãs ≤ 800 px (toque): mantém-se o deslize sem barra visível.

## Testes
- `npm run test:ladder-auto-network` (16 verificações, incluído em `test:ci`).
- `npm run test:toolbar-ui`: botões na barra, saída da barra do programa, network automática, diálogo de bloco, barra de deslocamento personalizada em Esquema/Ladder/GRAFCET.
