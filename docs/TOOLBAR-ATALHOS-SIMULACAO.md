# Barra de ferramentas: Atalhos, Compilar, Simulação e nomes editáveis

Data: 2026-10-26 · Smoke: `npm run test:toolbar-ui` (37 verificações)

## O que mudou

| Código | Alteração |
|---|---|
| TOOLBAR-SHORTCUTS-01 | Botão **Atalhos** na barra de ferramentas em todos os simuladores (Esquema 2D/3D, Ladder, GRAFCET, Monitor). Cada um abre a sua lista: o Esquema inclui ferramentas (teclas 1–5), câmara, cabos e vistas; o Monitor mostra as teclas de vista (Ctrl+1…4, F1/F2/F5/F4). O pedido segue pelo evento `dcsimu:shortcuts` (`src/ui/simUi.ts`). |
| LADDER-COMPILE-TB-01 | **Compilar** saiu da barra do programa e passou para a barra de ferramentas (segunda linha). Um ponto colorido mostra o estado da última compilação: ok, aviso, erro ou desatualizada (programa alterado depois de compilar). Estado partilhado em `useLadderUi.compileState`. |
| STATUS-GRAFCET-01 | Cartão na barra de estado, ao lado do `scan #`: nome do GRAFCET, página (se houver várias) e **Etapa Xn** ativa com comentário e «+N» quando há várias ativas. Clicar abre a vista GRAFCET (`src/components/GrafcetStatusCard.tsx`). |
| TOOLBAR-SCROLL-01 | As barras com muitos botões ficam numa só linha com deslocamento horizontal (sem passar para baixo): barra principal, segunda linha (incluindo GRAFCET), barra do programa Ladder e barra de páginas do GRAFCET. Os menus usam `position: fixed`, por isso o deslocamento não os corta. |
| SIM-PANEL-01 | Botão **Simulação** (igual ao do GRAFCET) no Ladder e no Esquema 2D/3D. No Ladder mostra/esconde o painel inferior de simulação; no Esquema abre um painel lateral com RUN/pausa/passo/parar/repor, sinais do PLC (ou entradas/saídas virtuais sem PLC) e etapas GRAFCET ativas (`src/components/SimulationDock.tsx`). O estado fica guardado no navegador. |
| INLINE-RENAME-01 | Nomes editáveis «no sítio», como o nome do documento: sem `window.prompt`. Um clique no nome da página ativa (ou duplo clique noutra) abre um campo; Enter grava, Escape cancela. A linha separada «Nome do GRAFCET» foi substituída por um título editável no início da barra de páginas (marcador «GRAFCET sem nome»). As folhas do Esquema 2D usam o mesmo componente (`src/ui/InlineName.tsx`). |

## Evidência

- `npx tsc -b` limpo; `vite build` concluído.
- `npm run test:ci` e `npm run test:server` (166) a passar.
- `npm run test:toolbar-ui` (37 PASS): atalhos nas 4 vistas, Compilar na barra e estado desatualizado, Simulação no Ladder/Esquema/3D, cartão GRAFCET com «Etapa X0», barras a 760 px com 40 px de altura e `scrollWidth > clientWidth`, renomear sem caixas nativas, sem erros de página.
- UI smokes de regressão a passar: editor3d, terminal-geometry, editor3d-autodetect, editors-sweep, motor, plc-signals, admin-saas, ladder-blocks, grafcet, grafcet-modals, grafcet-construction, blocks, grid.

## Pendente

- Validação manual pelo utilizador em ecrã tátil (deslocamento das barras com o dedo).
- O painel «Simulação» do Esquema é estreito (312 px) em portáteis com a biblioteca e o painel direito abertos.

## Base comum e ferramentas por ambiente (2026-10-26)

`src/ui/toolbarKit.tsx` é a base partilhada. Cada ambiente usa os mesmos blocos e acrescenta apenas as suas ferramentas em `src/components/Toolbar.tsx`.

| Bloco comum | Componente |
| --- | --- |
| Desfazer / Refazer | `HistoryGroup` |
| Simulação (mostrar/esconder painel) | `SimToggleButton` (`data-sim-toggle`) |
| Atalhos | `ShortcutsButton` (`data-shortcuts-button`) |
| Malha · ímã · passo · zoom | `ViewControls` |
| Botão, grupo, separador | `TbButton`, `ToolSeg`, `ToolSep` |

Para acrescentar uma ferramenta a um ambiente: usar `TbButton` dentro do bloco `mode === '<ambiente>'` da segunda linha. Não duplicar o markup dos blocos comuns.

Ferramentas específicas atuais: Ladder (Compilar, Bloco, Nova network, secções), GRAFCET (Componentes, ferramentas de seleção, modelos, disposição, ficheiro), Esquema (ferramentas de cabo, alinhamento, diagnóstico).

### Editor de componentes 3D

O botão «Atalhos» (`data-shortcuts-button="component"`, F1) passou do cabeçalho para o fim da barra secundária e usa o `ShortcutsButton` comum. «Editar/Simular» mantém-se como separadores de modo no cabeçalho.

## Espaçamento, cubo de vistas e painéis (2026-10-26)

- `src/styles/toolbar-spacing.css`: grupos `dc-seg` com moldura e botões planos separados por 3 px; 10 px entre grupos; separadores com margem maior. Aplica-se a todas as barras.
- Cubo de vistas: `top` de 14 px e sem margem negativa no palco, para a seta de cima não ficar sob a barra (`clean-mode.css`).
- `src/styles/panel-system.css`: ver secção «Sistema de painéis» abaixo (substitui o antigo `panels-polish.css`).

## Sistema de painéis (2026-10-26)

`src/styles/panel-system.css` dá o mesmo desenho a todos os painéis, com variáveis `--pn-*` (fundo, linhas, tinta, margem 14 px, cabeçalho 46 px, separador 36 px, raio 8 px, anel de foco).

| Elemento | Regra comum |
| --- | --- |
| Cabeçalho | 46 px, título 13 px/650 + subtítulo 10,5 px, linha inferior suave |
| Etiqueta de secção | 10,5 px, maiúsculas, espaçamento 0,06 em |
| Separadores | 36 px, ativo com fundo do painel, cor da marca e linha inferior de 2 px |
| Corpo | margem 14 px, intervalo 12 px, deslocamento fino |
| Rodapé / dicas | fundo secundário, linha superior suave |

Painéis abrangidos: hierarquia e inspetor do editor de componentes, componentes e propriedades do GRAFCET, simulação do Esquema e estado do PLC no Ladder. Um painel novo usa as variáveis `--pn-*` ou acrescenta o seu seletor às listas do ficheiro.

### Classes `pn-*` para componentes em Tailwind

A biblioteca do Esquema (`Sidebar.tsx`) e o Monitor (`MonitorPanel.tsx`) usam classes `pn-*` do mesmo ficheiro: `pn-panel` (contentor lateral), `pn-tabs`, `pn-section` (`is-compact`), `pn-body`, `pn-label`, `pn-page` (página com fundo) e `pn-card` (cartão). Novos painéis em Tailwind devem usá-las em vez de repetir bordas, fundos e margens.
