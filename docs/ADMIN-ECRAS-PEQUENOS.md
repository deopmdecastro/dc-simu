# Administração em ecrãs pequenos

Nota técnica do incremento de 2026-10-27 sobre o painel de administração
(`/admin`): o que estava errado no telemóvel e no portátil, o que mudou e como se
verifica. Contexto e decisões de produto ficam no cofre (`BrainNet`), em
`03-Projects/DC-Simu/Validation-2026-10-27-Admin-Ecras-Pequenos.md`.

## Como foi observado

Chromium headless (Playwright) a **390 × 844** (telemóvel), **768 × 1024**
(tablet), **1024 × 900** (portátil) e **1440 × 900** (secretária), com
`localStorage` descartável, `/api/*` bloqueado e a conta `dcsimu-admin`. Foram
percorridas as nove secções (Resumo, Contribuições, Componentes, Biblioteca 3D,
Projetos, Utilizadores, Planos e preços, Registos, Sistema), medindo alturas de
linha, deslocamento horizontal e alvos de toque.

## Problemas medidos (antes)

| # | Largura | Medição | Efeito |
| --- | --- | --- | --- |
| 1 | 390 px | faixa de secções com 1 087 px de conteúdo em 350 px visíveis | só se viam três das nove secções; não havia sinal de que as outras existiam |
| 2 | 390 px | cabeçalho com 250 px de altura em todas as secções | um quarto do ecrã gasto antes de qualquer conteúdo |
| 3 | 390 px | cada componente com ≈ 170 px (cinco botões em três linhas) | a lista de 72 componentes ficava com dez ecrãs |
| 4 | 390 px | barra «Guardar planos» fixa sobre os últimos campos | tapava o que se estava a editar |
| 5 | 390 px | campos de data nativos sem nome (`mm/dd/yyyy`) | não se sabia qual era o início e qual era o fim do intervalo |
| 6 | 768 px | faixa de secções com 1 087 px em 707 px | as mesmas seis secções escondidas atrás de um deslize |
| 7 | 1024 px | página 31 px mais larga do que o ecrã em Componentes e 114 px em Utilizadores | a lista e os filtros saíam do ecrã; aparecia deslocamento horizontal |
| 8 | 390 px | ícones da conta em fila com quebras (`Mais ações` sozinho na terceira linha) | altura desperdiçada em cada conta |

## O que mudou

### Navegação (`AdminPanel.tsx`, `admin-refine.css`)

- **≤ 720 px:** a secção atual aparece num **seletor único** (grupo + nome +
  contador «por tratar»); ao tocar abre uma **folha inferior** com as nove
  secções, agrupadas em Geral · Conteúdo · Gestão · Sistema, com ícone, contador
  e a secção atual marcada. Usa o `ToolMenu` comum de `src/ui/toolbarKit.tsx`
  (setas, Home/End, Escape, foco devolvido ao botão), o mesmo dos editores.
- **721–960 px:** as nove secções passam a **duas linhas** em vez de uma faixa
  que desliza (`1 087 px` de conteúdo em `707 px`); todas ficam visíveis.
- **> 960 px:** navegação lateral como antes (208 px).
- **Cabeçalho ≤ 720 px:** 131 px em vez de 250 px — título a 20 px, subtítulo
  escondido (repete o que o menu diz), estado e as duas ações na mesma linha,
  com altura de toque de 38 px.

### Lista de componentes (`ComponentsTab.tsx`)

- ≤ 1180 px: a linha fica com **plano mínimo**, a ação do estado atual
  (`Bloquear…` / `Desbloquear` / `Repor`) e **Mais ações** (menu `RowMenu` com
  «Arquivar…», «Eliminar…» e «Ver contribuições», cada um com o motivo ou o
  efeito). Acima disso mantêm-se os cinco botões em fila.
- ≤ 720 px: a linha passa a duas filas (129 px medidos, antes ≈ 170 px) e a
  caixa de seleção fica na linha do nome.
- A nota «O que faz bloquear, arquivar e eliminar» passou a `<details>`: aberta
  na secretária, **fechada no telemóvel** (devolve ≈ 130 px à lista).

### Planos e preços (`PlansTab.tsx`)

- A barra de gravação fixa tem versão estreita: **Guardar planos** (principal) e
  **Mais** (Descartar · Repor valores de fábrica). O conteúdo reserva
  `84 px` no fundo, por isso a barra deixou de tapar os últimos campos.
- Funcionalidades passam a uma coluna no telemóvel.

### Utilizadores (`UsersTab.tsx`)

- Ações da conta em grelha de duas colunas (altura 34 px cada), ícones e
  pastilhas alinhados à esquerda, métricas em duas colunas.
- «+ Nova conta» explica por que está desativada no modo local (exige servidor
  ou Supabase) — `title` e a nota que já existia.

### Registos (`LogsTab.tsx`)

- «De» e «Até» com nome visível por cima do campo de data.
- Paginação com botões largos; a limpeza de registos fica num grupo com rótulo
  («Limpar registos»), separada por uma linha.

## Verificação

```bash
npm run typecheck             # tsc -b
npm test                      # núcleo
npm run test:admin-ui         # NOVO: 43 verificações a 390, 768, 1024 e 1440 px
npm run test:admin-saas-ui    # fluxo completo (planos, contas, componentes, pedidos)
npm run test:saas             # 58 verificações das regras de planos
npm run test:style            # guarda de estilo (sem barras laterais de destaque)
npm run test:editor3d-ui      # percursos do 3D (a correção de deriva está descrita em baixo)
```

O `test:admin-ui` cobre: seletor de secções e folha com as nove entradas e os
quatro grupos; troca de secção; cabeçalho ≤ 160 px; ausência de deslocamento
horizontal a 390/768/1024/1440 px; altura máxima de 150 px por componente;
«Arquivar…» no menu da linha e «Bloquear…» à mão; nota de ajuda fechada;
campos «De»/«Até»; barra de gravação dentro do ecrã e conteúdo com folga;
altura mínima de 32 px nos botões da conta; faixa do tablet em duas linhas sem
deslize; navegação lateral e barra de gravação em linha na secretária.

## Correção de deriva de teste (não é mudança de produto)

`scripts/editor3d-ux-ui-smoke.mjs` falhava já antes deste incremento: o esquema
3D deixou de ter o botão «Manobrar» e passou a permitir acionar equipamentos
quando a simulação está a correr (`runState === 'running'`), mas o teste ainda
alternava `useSimUi.schematic`. Passou a ligar/desligar a simulação (`play()` /
`stop()`), mantendo o que o teste quer provar.

## Limites conhecidos

- As medições são de Chromium headless; a revisão num telemóvel físico continua
  pendente (UI-VISUAL-01 no cofre).
- A Biblioteca 3D não foi medida a 390 px (é o editor largo, com canvas WebGL):
  o cabeçalho e a navegação são os mesmos, mas o conteúdo do editor segue o
  documento `docs/UI-ECRAS-PEQUENOS.md`.
- A vista com servidor (SQLite/Supabase) não foi revista: o ambiente de trabalho
  corre em modo local, sem API.
