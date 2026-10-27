# Interface em ecrãs pequenos — barra do editor e menus

Este documento descreve o incremento de interface de 2026-10-27: a barra do editor de
componentes 3D, os menus de ações partilhados e o ajuste do Esquema 3D, Ladder e GRAFCET a
ecrãs de 390 px. Complementa [EDITOR-3D-UX](EDITOR-3D-UX.md) e [TOOLBAR-ATALHOS-SIMULACAO](TOOLBAR-ATALHOS-SIMULACAO.md).

## Problema observado

Num telemóvel de 390 px de largura (capturas de 2026-10-27, Chromium headless a 390 × 844):

1. **Barra do editor de componentes** — a segunda faixa (`ce-ribbon-secondary`) deslizava e as
   últimas ações (Biblioteca de bornes, olho dos bornes, «Organizar») ficavam cortadas na borda,
   sem qualquer sinal de que existiam. O menu «Organizar» só abria por cima da faixa e a dica da
   ferramenta ativa desaparecia, por isso nada explicava a ferramenta escolhida.
2. **Zoom do editor 3D** — a barra mostrava «100 %» impresso no código, sem relação com a câmara;
   não havia forma de aproximar sem usar a roda do rato ou a pinça.
3. **Enquadramento** — a câmara usava a esfera envolvente, o que num ecrã ao alto deixava o modelo
   pequeno: com o PKZM, o modelo ocupava cerca de um terço da altura do canvas.
4. **Esquema 3D no telemóvel** — o cartão «Selecionar / Clique para selecionar · arraste para
   mover / Manobrar» ocupava um quarto do canvas; e as ações de painel (Biblioteca, GRAFCET,
   Objetos) estavam no fim de uma faixa que desliza, portanto fora de vista.
5. **Cabeçalho do editor** — com logótipo, separador, «Projetos», «Comentários» e «Guardar» na mesma
   linha, o nome do projeto ficava reduzido a uma letra («E.»).
6. **Ladder no telemóvel** — a network (720 px) não cabia em 390 px: a bobina ficava fora do ecrã e
   o auto-ajuste levava a escala a um mínimo de 70 % (ainda insuficiente). O resumo cortava
   «Bobinas» e «Timers/Counters» na borda e a linha «Programa Ladder» repetia o separador de cima.
7. **GRAFCET no telemóvel** — a gaveta de propriedades ocupava 48 % da altura e tapava a barra de
   zoom/ajuste do canvas (ambas no canto inferior direito); qualquer seleção a abria sozinha.

## O que mudou

### Menu de ferramentas partilhado (`src/ui/toolbarKit.tsx`)

Novo `ToolMenu` + `tool-menu.css`, usado pela barra do editor de componentes:

- botão com `aria-haspopup="menu"`; o menu é um `role="menu"` com itens `role="menuitem"`;
- navegação por setas, Home/End, Escape (devolve o foco ao botão) e foco inicial no primeiro item;
- em ecrã largo abre em popover medido (escolhe o lado com mais folga e limita a altura);
- até 720 px abre como **folha inferior** (junto ao polegar, com pega e botão de fechar);
- cada ação tem nome, ícone, descrição do efeito, atalho e — quando está desativada — o motivo
  («Selecione uma peça do modelo», «Nada selecionado», «O modelo ainda não tem bornes»…).

### Barra do editor de componentes (`ComponentEditor3D.tsx`)

- linha 1: histórico · as seis ferramentas (ícone; o nome fica na dica) · **Mais** (fixo à direita);
- linha 2: malha · ímã · zoom com percentagem real · enquadrar · bornes · dica da ferramenta;
- o menu «Mais» reúne tudo o que não cabe: formas e GLB, duplicar/agrupar/desagrupar/separar partes,
  manipulador (mover/rodar/escalar/eixos), biblioteca e bornes por face, opções de cena, ajuda.

### Zoom e enquadramento do editor 3D (`editorStore.ts`, `Viewport.tsx`)

- `camStats = { yaw, pitch, fit, zoom }`: **100 % = modelo enquadrado**; a percentagem é
  distância de enquadramento ÷ distância atual, arredondada (o arrasto da câmara não escreve no
  estado a cada fotograma);
- nova ação `zoom(factor)` (≈ roda do rato) usada pelos botões −/+; clicar no valor enquadra;
- `frameBox` mede a caixa projetada nos eixos da câmara (direita/cima) em vez de usar a esfera:
  o modelo enquadrado passa de ≈ 33 % para ≈ 70 % da altura do canvas em 390 × 844.

### Esquema 3D (`Panel3D.tsx`, `Toolbar.tsx`, `index.css`)

- cartão de contexto numa linha (ferramenta + «Manobrar» + enquadrar); a explicação abre no «?»;
- «Biblioteca», «GRAFCET» e «Objetos» passam para o início da faixa, a seguir ao histórico.

### Cabeçalho do editor (`account.tsx`, `dx.css`)

- o nome do projeto recebe a largura disponível e corta com «…»; «Projetos» passa a seta e
  «Comentários» a ícone com contador (o rótulo continua acessível por `aria-label`).

### Ladder (`ladderZoom.ts`, `LadderEditor.tsx`, `ladder-editor.css`, `Toolbar.tsx`)

- `LADDER_ZOOM_MIN` desce de 0,7 para 0,4 (uma network de 720 px cabe em 390 px);
- novo `fitLadderZoom(natural, disponível)` e botão **«Ajustar à largura»** no grupo de zoom;
- em ecrãs ≤ 900 px o programa ajusta-se à largura ao abrir e ao redimensionar, **até** o
  utilizador escolher a escala à mão (pinça ou botões);
- resumo em pastilhas deslizantes (deixa de cortar métricas); a linha «Programa Ladder» e o alvo
  do PLC (quando não há PLC) desaparecem; estado vazio compacto; réguas recolhidas de 34 → 24 px.

### GRAFCET (`GrafcetEditor.tsx`, `grafcet-editor.css`)

- a gaveta de propriedades passa a folha flutuante sobre o diagrama (46 % de altura, com sombra);
  fechada é uma barra de resumo fina no fundo — o canvas deixa de ser esmagado para 352 px;
- selecionar um elemento já não abre a gaveta no telemóvel (escondia o que se acabou de tocar);
- a barra de zoom/ajuste do canvas sobe para o topo do diagrama (deixou de ficar tapada);
- a guia de construção só aparece quando há uma ligação em curso.

## Como verificar

```bash
npm run typecheck
npm test                     # núcleo (motor elétrico, Ladder, GRAFCET, componentes)
npm run test:editor3d-toolbar  # 22 verificações da barra/menu/zoom (Playwright, 390 px)
npm run test:editor3d-ui       # percursos dos dois editores 3D (desktop + 390 px)
npm run test:logo-editor-ui    # 62 verificações do editor de componentes (1920→390 px)
npm run test:toolbar-ui        # barras do simulador (Esquema/Ladder/GRAFCET)
npm run test:pinch             # pinça e limites de zoom
```

Os testes de UI exigem um servidor Vite (`npm run dev`) e um Chromium do Playwright; usam
`localStorage` descartável e bloqueiam `/api/*`, não tocam em dados reais.

## Limites conhecidos

- `npm run build` exige memória: no ambiente desta alteração (2 GB) o processo foi terminado pelo
  sistema (137); o registo de ENV-01 no cofre já documenta a necessidade de 3 GiB. O build de
  produção **foi confirmado na Vercel** a partir deste commit (`buildId` `53ade78…`, 2026-10-27) —
  falta apenas reproduzi-lo localmente num runner com memória suficiente.
- O editor de componentes não foi revisto visualmente num dispositivo físico; as capturas são de
  Chromium headless a 390 × 844.
