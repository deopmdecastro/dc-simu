# DC-Simu — Simulador de Comandos Elétricos Industriais

Simulador educacional/profissional com **três áreas sincronizadas por um único modelo de dados**:
**Editor de Esquema (SVG)** ↔ **Painel 3D (Three.js)** ↔ **Editor Ladder**, com monitor de I/O,
medições, injeção de falhas e sonda de continuidade.

Não é uma interface decorativa: existe um **motor de continuidade elétrica** baseado em grafo de
bornes/cabos, um **motor Ladder** que executa ciclos de varredura (scan) reais e um **motor de
sequência de fases** que decide o sentido de rotação do motor a partir de como as fases chegam em
U1/V1/W1.

## Novidades — v2.2

**Top bar reorganizada**
- Linha 1: marca · arquivo (Novo/Abrir/Salvar/BOM em grupo segmentado + Projetos) · vistas centradas (atalhos F1–F4) · simulação (Run/Pause/Stop/Passo/Reset, modo, velocidade) e estado do PLC.
- Linha 2 contextual à vista: histórico, ferramentas de edição, opções do **novo cabo** (quando a ferramenta Cabo está ativa), menu **Organizar** (alinhar/distribuir/cabos), malha/zoom, cenário e caixa-preta. Botões sem bordas duplicadas e sem etiquetas redundantes.

**Adicionar componentes — uma única forma**
- Clique **ou** arraste um item da biblioteca: o esquema mostra o **fantasma real do símbolo** encaixado na malha; solte/clique para posicionar (centrado no cursor).
- Botões, sensores, contatores e temporizadores da biblioteca também podem ser largados diretamente numa network Ladder.

**Editor Ladder estilo TIA Portal (grelha padronizada de 20px)**
- Networks desenhadas em SVG numa grelha fixa: barramento esquerdo, ramos OR, blocos TON/TOF/TP/CTU/CTD com pinos (IN/PT/Q/ET, CU/R/PV/Q/CV) e bobinas alinhadas à direita.
- Monitorização online como no TIA: verde contínuo = fluxo de corrente, azul tracejado = sem fluxo, valores ET/CV ao vivo.
- Barra única de elementos por network (clique insere · arraste para a posição exata), paleta e mosaicos de ferramentas arrastáveis, contatos arrastáveis para reordenar/mover entre ramos e networks, `Del` remove o elemento selecionado, marcador `<??.?>` para bobina em falta.

**Cabos**
- Duplo clique em qualquer ponto do cabo (área de clique alargada) adiciona um ponto de curva arrastável; duplo clique no ponto remove-o.
- **Rígido** = dobras vivas a 90° pelos pontos, brilho contínuo no centro; **flexível** = curva suave (spline) com textura multifilar.
- A cor escolhida é sempre visível (energia passa a ser um brilho por baixo + fluxo animado, também no 3D). Cor automática pela função do cabo (IEC 60204-1) ou cor fixa para novos cabos.
- **Terminal do cabo** (opção única para as duas pontas): ponteira, ponteira dupla, olhal, forquilha, pino, faston, estanhado ou nu — desenhado nas pontas no esquema.

## Novidades — v2.1

- **Toolbar reorganizada**: grupos visuais com etiqueta (Cenário · Ferramentas · Organizar ·
  Simulação · Vista · Treino), linha de arquivo/vistas/estado separada e botões consistentes.
- **Posicionar componentes com o mouse**: clique num item da biblioteca e o componente segue o
  cursor (fantasma) — clique posiciona, `Shift+clique` posiciona vários, `Esc` cancela.
  Arrastar da biblioteca para o esquema e duplo clique (inserção imediata) continuam a funcionar.
- **Editor Ladder estilo TIA Portal**: cabeçalho "Network n: título" com faixa cinza-aço,
  networks recolhíveis (chevron ou duplo clique no cabeçalho), linha de comentário por network e
  grelha de células padronizada (passo fixo por elemento) com barramentos escuros.
- **Cabos**:
  - **Duplo clique no cabo adiciona um ponto de curva** (waypoint) arrastável; duplo clique no
    ponto remove; vários pontos por cabo; botão "Limpar pontos de curva" no inspetor.
  - **Rígido vs flexível de verdade**: condutor rígido desenha segmentos retos com dobras vivas e
    traço duplo (alma sólida); flexível desenha curvas suaves com cantos arredondados.
  - **Seletor de cor com amostras reais** no inspetor — a cor é aplicada imediatamente no esquema.
  - Ao editar o cabo também se escolhe o **tipo de terminal** físico de cada ponta (anel, garfo,
    pino, faston, tubular…).

## Como rodar

```bash
npm install
npm run dev        # ambiente de desenvolvimento
npm run build      # build de produção (passa sem erros de tipo)
npm run test       # testes de fumaça dos motores (continuidade, ladder, fases, sonda)
npm run preview    # serve o build
```

## O que o simulador faz

### Editor de esquema (completo)
- **Malha (grid)** configurável: passo 5/10/20/25/50 px, estilo pontos ou linhas, e **ímã (snap)**.
- **Arrastar** componentes (com multi-seleção por *shift* e seleção por retângulo).
- **Editar**: TAG, descrição, X/Y, largura/altura, rotação (0/90/180/270), espelhamento, cor do
  corpo, bloqueio contra arraste acidental, duplicar e **eliminar**.
- **Zoom** e **panorâmica** (scroll, Ctrl+scroll, tecla Alt, botão do meio).
- **Desfazer / refazer** (Ctrl+Z / Ctrl+Y) com pilha de histórico.
- Atalhos: `R` gira, `D` duplica, `Del` apaga, `1/2/3` troca de ferramenta, `Esc` cancela,
  `Ctrl+A` seleciona tudo, `Ctrl+C` / `Ctrl+V` copia/cola (mantém os cabos internos entre os
  componentes colados), setas move 1px (`Shift`+seta move o passo da malha).

### Cabos (edição completa)
- Ferramenta de **desenho de cabo**: clique no borne de origem, clique no borne de destino.
- **Cor** (13 cores normalizadas: vermelho, azul, verde-amarelo, preto, laranja, cinza, marrom,
  branco, rosa, violeta, verde, amarelo, azul-claro).
- **Seção transversal**: 0,5 / 0,75 / 1 / 1,5 / 2,5 / 4 / 6 / 10 / 16 mm² — a espessura desenhada
  acompanha a seção.
- **Tipo / função**: força, comando, sinal, neutro, terra (PE), barramento.
- **Condutor rígido ou flexível** (flexível = traço contínuo; rígido = traço segmentado, indicando
  condutor sólido).
- **Roteamento**: ortogonal, manhattan (vertical), curvo, direto — mais o controle do **ponto de
  dobra** (0…100 %).
- **Identificação** (nº do fio/etiqueta) e **metragem** em mm.
- Cabos energizados ficam amarelos automaticamente.

### Bornes
- Adicionar e remover bornes em qualquer componente.
- Definir **rótulo**, **função lógica** (força entrada/saída, bobina A1/A2, contato NA/NF, neutro,
  terra, I/O, analógico, barramento), **tipo físico** (parafuso, mola/push-in, faston, olhal, plug),
  **cor** e **posição (x,y)** dentro do footprint.

### Componentes (biblioteca com 50 tipos)
Proteção (mono/bi/tri/tetrapolar, disjuntor-motor, DR 30 mA, fusível, porta-fusível, DPS, térmico),
Comando (botão NA/NF, cogumelo, seletor 2 e 3 posições, chave com segredo, pedal, fim de curso),
Sensores (indutivo PNP, fotoelétrico, pressostato, termostato, boia), Contatores (tripolar,
tetrapolar, bloco de contato auxiliar), Relés (auxiliar 1NA+1NF, 2NA+2NF, TON, TOF,
**temporizador estrela-triângulo**, contador, relé de segurança de duplo canal), Sinalização
(LED verde/vermelho/amarelo/branco, buzzer, torre de sinalização), Motores e acionamentos
(trifásico, monofásico, **inversor de frequência** com rampa, **soft-starter**), Controladores
(LOGO!/CLP compacto 8I/4Q, CLP modular 12I/8Q, IHM), Bornes e barras (borne de passagem, borne de
terra, barramento L1/L2/L3, barramento de neutro, barra de terra), Fontes (transformador
380/24 V, fonte chaveada 24 Vdc, amperímetro analógico).

### Simulação
- **Quatro modos**: tempo real, turbo, passo a passo e contínuo; velocidade de 0,25x a 10x.
- **Passo a passo** com avanço manual de um ciclo de varredura.
- **Modo caixa-preta**: esconde o Ladder para forçar o diagnóstico por medição.
- **Injeção de falhas**: falta de fase, curto entre fases, fuga à terra (> 30 mA), sobretensão e
  sobrecarga mecânica.
- **Medições calculadas** do circuito real: tensão de comando, tensão trifásica, corrente estimada
  por motor (a partir dos cv e da tensão), frequência do inversor, frequência da rede, metragem
  total de cabo.
- **Sonda (multímetro)**: dois cliques em bornes e o simulador informa continuidade, número de
  elementos em série, resistência estimada e se há diferença de potencial.

### Ladder (editor funcional)
- Rungs com **ramos paralelos (OR)** e séries (AND), adicionar/remover contato, trocar tipo
  clicando (NA → NF → subida → descida), mover/duplicar/excluir/reordenar rungs.
- Bobinas **COIL / SET / RESET**; temporizadores **TON, TOF, TP e estrela-triângulo** com preset e
  tempo de transição; **contadores CTU/CTD** com preset e endereço de reset.
- Estado energizado de cada rung, contato e bobina em tempo real.
- **Tabela de Tags** (aba dedicada, inspirada na organização do TIA Portal): uma tabela por área de
  memória — Entradas (I), Saídas (Q), Memórias (M), Temporizadores (T), Contadores (C) — cada linha
  com **Nome simbólico, Endereço, Tipo de dados (Bool/Time/Int/Real) e Comentário**. Botão
  **"Detectar do programa"** cria automaticamente uma tag para todo endereço já usado no programa
  Ladder que ainda não tenha nome. Os nomes aparecem por baixo do endereço nos contatos/bobinas do
  editor e junto aos bits no Monitor, e os campos de endereço sugerem (autocompletar) os endereços já
  nomeados — o endereço continua a ser a referência real usada pelo motor de varredura; a tag é só
  documentação/organização.

### Cenários prontos
1. **Partida direta com selo** — STOP (I1) + START (I2), selo por M1 → Q1 → KM1 → motor.
2. **Reversão de motor** — KM1/KM2 com intertravamento lógico (contatos NF cruzados) *e* elétrico,
   com duas fases trocadas para inverter o campo girante (o motor realmente gira ao contrário).
3. **Partida estrela-triângulo** — KM1 principal + KM2 estrela + KM3 triângulo, comutados pelo
   temporizador KT1 (4 s) e trava T1 no Ladder.
4. **Partida sequencial + contagem** — M1 parte imediato, M2 após 3 s e sensor indutivo dispara um
   contador CTU (5 peças).

### Diagnóstico automático
Intertravamento violado, motor sem térmico, térmico disparado, bobina sem alimentação, cabo órfão,
borne de força desconectado, curto entre fases, motor sem condutor de proteção (PE), componentes
sobrepostos no esquema e faixa do térmico incompatível com a corrente nominal do motor.

### Alinhamento e distribuição
Com 2+ componentes selecionados: alinhar à esquerda/direita/topo/base e centralizar
horizontal/verticalmente. Com 3+ selecionados: distribuir espaçamento igual na horizontal
ou na vertical (útil para organizar trilhos DIN e filas de bornes rapidamente).

### Biblioteca de etiquetas padrão (IEC 60445 / 60947)
Botão 📋 no rótulo do borne e na identificação/etiqueta do cabo: catálogo de rótulos
normalizados (L1/L2/L3/PE, A1/A2, 13-14, U1/V1/W1, 95-96-97-98, DI/DO…) organizados por
categoria, para inserir com um clique em vez de digitar.

### Numeração automática de cabos e BOM
- **Numerar cabos**: atribui `Wn` a todos os cabos sem identificação, continuando a
  sequência já usada no projeto.
- **Exportar BOM (CSV)**: lista de materiais agrupada por tipo de componente (com TAGs) e
  um resumo de cabos (quantidade, metragem total e por seção).

### Guardar o projeto (navegador + arquivo)
- **`Ctrl+S`**: guarda no navegador (localStorage). Se o projeto ainda não tem nome, abre o
  painel "💾 Projetos" para o nomear; depois disso, `Ctrl+S` sobrescreve silenciosamente.
- **`Ctrl+Shift+O`** ou botão **💾 Projetos**: lista os projetos guardados neste navegador,
  com data/hora, para reabrir ou eliminar.
- **Autosave**: a cada 15 s (e ao fechar a aba) com alterações pendentes, guarda uma cópia de
  segurança silenciosa. Ao reabrir a aplicação, recarrega automaticamente o último projeto
  guardado (ou o autosave, se nada foi guardado por nome) — não é preciso reimportar nada.
- Isto é armazenamento **local, neste navegador/computador** — não sincroniza entre
  dispositivos (isso exigiria um backend; ver "Próximos passos naturais"). Para levar o
  projeto a outro computador, continua a existir o **Salvar JSON / Abrir JSON** (arquivo).

### Arquivo
Salvar / abrir projeto em JSON e criar projeto em branco.

## Arquitetura

```
src/
  types/            Modelo de domínio único (componente, borne, cabo, ladder, simulação, editor).
  electrical/
    factory.ts      Biblioteca de 50 tipos com templates de bornes IEC reais (A1/A2, 1L1/2T1,
                    13-14, 21-22, 95-96-97-98, U1/V1/W1, V+/0V/OUT, DI/U/V…), TAG automático.
    engine.ts       Motor de continuidade: grafo borne→borne (cabos + pontes internas
                    condicionais), BFS a partir das fontes, detecção de bobina energizada,
                    sonda/multímetro e estimativa de metragem de cabo.
    phases.ts       Propagação de identidade de fase (L1/L2/L3/N/PE) e decisão do sentido de
                    rotação do motor a partir da sequência real de fases.
  ladder/
    ladderEngine.ts Varredura completa: contatos NO/NC/subida/descida, ramos OR, séries AND,
                    COIL/SET/RESET, TON/TOF/TP/estrela-triângulo, contadores CTU/CTD, e utilidades
                    da Tabela de Tags (deteção de endereços usados, tipo de dados padrão).
    LadderEditor.tsx Editor visual completo com inserção de contatos, ramos, bobinas, timers e
                    contadores, estado energizado em tempo real, e abas Programa/Tabela de Tags.
    TagTable.tsx    Tabela de Tags (Nome/Endereço/Tipo/Comentário) por área de memória (I/Q/M/T/C),
                    inspirada na organização do TIA Portal.
  schematic/
    symbols.tsx     Biblioteca de símbolos SVG (um por tipo), cores de cabo, rótulos de borne.
    SchematicView.tsx Editor de esquema: malha, arraste, seleção, marquise, zoom/pan, cabos,
                    bornes clicáveis, sonda e teclas de atalho.
  three/Panel3D.tsx Painel 3D (R3F): trilho DIN, disjuntores, contator com armadura, CLP com LEDs
                    de I/O, inversor com display, sinaleiros emissivos, torre, botoeiras clicáveis,
                    sensores acionáveis, motor com eixo girando no sentido real e cabos roteados.
  simulation/
    scenarios.ts    Os quatro cenários completos.
  store/useSimStore.ts  Zustand — ÚNICA representação do circuito. Cada ciclo faz três passagens de
                    continuidade (lê entradas → executa Ladder → aplica saídas) e mantém histórico
                    para desfazer/refazer.
  components/       Toolbar (ferramentas, malha, zoom, modos, vistas, alinhar/distribuir,
                    numerar cabos, BOM), Sidebar (biblioteca + inspetor), LabelLibrary
                    (catálogo de rótulos IEC), ProjectsPanel (guardar/reabrir projetos no
                    navegador), MonitorPanel (I/Q/M, timers, contadores, medições, falhas,
                    eventos).
  electrical/
    standardLabels.ts  Catálogo de rótulos normalizados (IEC 60445/60947) por categoria.
  utils/
    errorDetection.ts  Regras de diagnóstico.
    measurements.ts    Medições virtuais calculadas do estado real.
    bom.ts             Lista de materiais (agrupamento por tipo + resumo de cabos) e CSV.
    persistence.ts     Guardar/reabrir projetos e autosave via localStorage.
scripts/smoke.ts    Testes de fumaça dos motores (npm run test).
```

## Tecnologias
React 18 + TypeScript + Vite, Three.js via @react-three/fiber e @react-three/drei, Zustand,
Tailwind CSS, SVG para o esquema e o editor Ladder.

## Próximos passos naturais
- Roteamento de cabos em canaleta/trilha no 3D com anti-colisão e numeração automática de bornes.
- Persistência em backend (sincronização entre dispositivos) e compartilhamento de projetos por link — hoje a persistência é local, no navegador (ver "Guardar o projeto").
- Modo multiusuário / avaliação (professor propõe falha, aluno diagnostica).

### Edição Ladder (estado atual)

- A network ajusta a largura do diagrama ao espaço disponível (mantendo scroll horizontal quando necessário).
- Ao selecionar contactos, bobinas, temporizadores ou contadores é possível alterar o endereço e o nome simbólico da tag no painel contextual.
- FC1 e FC2 permitem criar/eliminar networks e editar contactos, ramos e bobinas; são guardados no JSON do projeto. **Os FC não são chamados pelo OB1 nem executados automaticamente**: copie a lógica relevante para o OB1 para a simular.
- Os blocos MOVE, ADD, SUB e COMPARE ainda não fazem parte do modelo de execução Ladder; não aparecem na paleta até terem semântica e testes completos.

### GRAFCET no esquema

A vista **Esquema** (e Painel 3D) mostra à direita o editor GRAFCET, enquanto a página **GRAFCET (F5)** abre o mesmo programa num espaço maior. Crie etapas iniciais/normais, várias ações por etapa (Q/M, com condição opcional), e transições explícitas entre etapas. Use `I1`, `!I1`, `(I1 & M1) | Q2`, `1` ou `0` nas condições. Uma transição com vários destinos cria uma divergência AND; várias origens exigem convergência AND (todas as etapas ativas). Transições concorrentes que partilham uma origem têm prioridade pela ordem em que aparecem na lista; cada etapa avança no máximo uma vez por scan. Projetos lineares antigos são convertidos em memória sem perda dos campos anteriores. O programa é incluído no JSON, autosave e projetos locais. No scan, Ladder corre primeiro e as ações GRAFCET têm precedência sobre o mesmo endereço Q/M; evite atribuir a mesma saída aos dois editores. A representação gráfica é automática e não inclui ainda posicionamento livre dos elementos nem divergência OR com seleção simultânea de ramos.

### Navegação lateral do Ladder

Os botões Projeto, Biblioteca, Dispositivos, Diagnóstico e Configurações abrem vistas próprias. A Biblioteca insere apenas elementos Ladder suportados e lista equivalências dos componentes do esquema; Dispositivos permite localizar componentes já existentes; Diagnóstico apresenta problemas, bits e eventos do scan; Configurações permite alterar malha e velocidade. Para editar fisicamente um dispositivo, selecione-o em Dispositivos e volte à vista Esquema.

A barra de vistas inclui agora **GRAFCET (F5)**, que abre o mesmo programa do editor lateral numa página dedicada; no Esquema continua disponível o editor compacto. O favicon SVG é servido localmente em `/favicon.svg`.

A biblioteca do Esquema suporta pesquisa por nome, tipo ou categoria, favoritos locais, expansão/recolha de categorias, duplo clique para inserção imediata e indicação/cancelamento do componente em posicionamento.

### Afinação de UI/UX (editores)

A barra principal ajusta-se a ecrãs mais estreitos e aceita `Ctrl+1` a `Ctrl+5` para navegar pelas cinco vistas (fora de campos de texto). A Biblioteca/Inspetor pode ser recolhida e reaberta nas vistas Esquema e Painel 3D; as larguras ajustadas são recordadas neste navegador. O Monitor aproveita agora a largura completa, sem barra lateral do esquema. O Painel 3D vazio sugere cenários para começar. Foram adicionados focos visíveis para navegação por teclado, espaços e estados visuais mais consistentes, e respeito pela preferência de movimento reduzido. Os controlos continuam compactos onde o espaço do editor é limitado.

O painel GRAFCET ao lado do Esquema/Painel 3D funciona agora **apenas como visualizador**: diagrama adaptado à largura do painel e estado da simulação, sem propriedades ou controlos de edição. O botão «Abrir editor» leva à página GRAFCET (F5), onde se criam e editam etapas, ações e transições. Ambos partilham o mesmo programa do projeto.

No visualizador lateral GRAFCET, arraste o diagrama para o deslocar e use a roda do rato ou os botões `−`/`+` para ajustar o zoom. «Ajustar» repõe a vista à largura do painel. Estes controlos afetam apenas a visualização; a edição continua na página GRAFCET.

### Fios e pontas livres

Na ferramenta **Cabo**, clique no espaço vazio para definir uma ponta livre e clique novamente no vazio ou num borne para terminar. Também é possível começar num borne e terminar no vazio; cabo entre dois bornes continua disponível. Esc ou botão direito cancela o desenho. Pontas livres têm marcação circular, podem ser arrastadas depois de selecionar o cabo e são incluídas no JSON do projeto. Um cabo com ponta livre é **apenas gráfico**: não conduz eletricidade nem transmite fases enquanto não estiver ligado a ambos os bornes. Duplo clique no traçado do cabo adiciona um ponto de curva; arraste-o para mudar o percurso ou faça duplo clique no ponto para o remover.

Durante o desenho de um fio, **Shift+clique no espaço vazio** acrescenta pontos de passagem antes de concluir a ligação. Clique normal no espaço vazio ou num borne termina o fio; a pré-visualização mostra os pontos já acrescentados. Depois de criado, uma ponta livre selecionada pode ser arrastada até um borne para concluir a ligação elétrica. Para mudar a cor de um borne, selecione-o no Esquema e use o seletor de cor ou as cores rápidas no Inspetor (independente da cor do fio); também é possível mudar a cor de cada borne na ficha do componente.

A biblioteca do Esquema apresenta agora miniaturas maiores (44 px, renderizadas em 128 px para ecrãs de alta densidade), com cartões mais legíveis. O botão de favoritos é independente da ação de colocar/arrastar componentes, melhorando o uso com rato, toque e teclado.

O estado do Esquema (ferramenta, malha, zoom e contagem de elementos) passou de três caixas sobrepostas a um HUD compacto. Ao recolher a Biblioteca, o HUD desloca-se para não tapar o botão que a reabre e reduz informação secundária em áreas estreitas.

### Navegação e criação no editor GRAFCET

Na página GRAFCET, o diagrama abre ampliado e centrado; pode ser deslocado por arraste e ampliado com a roda do rato ou com `−`/`+`. O botão «Ajustar» repõe a vista. «+ Etapa ligada» cria uma etapa e uma transição a partir da etapa selecionada (ou da última, se nenhuma estiver selecionada); «+ Etapa solta» cria uma etapa independente. Um projeto vazio oferece um exemplo de três etapas. As transições podem ser reordenadas com as setas para ajustar a prioridade de avaliação. Um retorno da etapa para ela mesma é desenhado como um circuito de retorno legível, em vez de cruzar a etapa.

Na barra de ferramentas do **Esquema**, «Arrastar malha» (ícone de mão) é um modo independente da ferramenta de edição: ao ativá-lo, arraste em qualquer ponto do canvas — mesmo por cima de componentes, fios ou bornes — para deslocar a vista inteira sem mudar a seleção nem mover componentes. Clique novamente no botão, escolha outra ferramenta ou prima Esc para sair. «Mover vista» continua disponível como ferramenta de edição separada.

O editor GRAFCET (página própria) tem agora uma **barra lateral de componentes** pesquisável e recolhível. Clique ou arraste um item para o diagrama: etapa inicial, etapa ligada, transição, ação, ação condicionada, divergência AND ou convergência AND. A divergência cria dois ramos novos a partir da etapa selecionada; a convergência reúne a etapa selecionada e o outro ramo da divergência (ou, sem divergência, outra etapa existente). Os elementos criados podem ser ajustados no painel de propriedades; ferramentas que precisam de etapas suficientes ficam desativadas até o programa as ter. O visualizador lateral do Esquema continua apenas de leitura.
