# DC-Simu — Simulador de Comandos Elétricos Industriais

Simulador educacional/profissional com **três áreas sincronizadas por um único modelo de dados**:
**Editor de Esquema (SVG)** ↔ **Painel 3D (Three.js)** ↔ **Editor Ladder**, com monitor de I/O,
medições, injeção de falhas e sonda de continuidade.

Não é uma interface decorativa: existe um **motor de continuidade elétrica** baseado em grafo de
bornes/cabos, um **motor Ladder** que executa ciclos de varredura (scan) reais e um **motor de
sequência de fases** que decide o sentido de rotação do motor a partir de como as fases chegam em
U1/V1/W1.

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
                    COIL/SET/RESET, TON/TOF/TP/estrela-triângulo e contadores CTU/CTD.
    LadderEditor.tsx Editor visual completo com inserção de contatos, ramos, bobinas, timers e
                    contadores, e estado energizado em tempo real.
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
