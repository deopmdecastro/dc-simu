# Componentes CAD importados — textura, funcionamento, animação, luzes e bornes

Incremento de 2026-10-30 sobre a integração dos 14 GLB descrita em
[COMPONENTES-IMPORTADOS-2026-10-30](COMPONENTES-IMPORTADOS-2026-10-30.md).

## O que estava em falta

| Requisito | Antes | Agora |
| --- | --- | --- |
| Textura real | 8 dos 14 STEP chegaram sem cores: todas as peças no mesmo cinzento `#797d81` (porta-fusíveis, seletor, CWBC65, DPS, torre). | Material real por peça, com os nomes que o acabamento PBR comum reconhece (`plastico_ral7035`, `metal_zincado`, `metal_niquel_cromio`, `plastico_lente_policarbonato`, …). |
| Animação ligar/desligar | Nenhuma peça mexia; o estado só aparecia no rótulo. | Gaveta dos porta-fusíveis abre, manípulo do Hager, botões I/O do GV2ME, manípulo do seletor (3 posições), chave EAO, botão de rearme do 3RU1116. |
| Luzes | Nenhuma. | Lentes da torre (com luz pontual), LED POWER/CH1/CH2 do 3TK2840, LED de alimentação e de saída do XUKT1, janela de fusível fundido (DF), janela de estado dos DPS. |
| Bornes no sítio | 20 encaixes calibrados (DF, Hager, SPW02); os outros 7 tipos com bornes numa fila genérica (ex.: 95–98 do 3RU1116 no topo; 3TK2840 com 10 bornes encostados numa aresta). Torre e chave sem bornes. | Todos os bornes no sítio físico do CAD; a torre ganha R/Y/G/COM e a chave o comutador 11/12/14. |

## Implementação

- `src/three/importedFinish.ts` — `paintImportedModel` (cores por região/forma), `rigImportedModel`
  (pivôs nas charneiras, LED e lentes) e `animateImportedRig` (estado → pose com amortecimento).
  As peças escolhem-se por região em mm no referencial do GLB e, quando ajuda, pela cor de fábrica
  (comparação por canal, com tolerância), nunca pelo índice do nó.
- `src/three/Panel3D.tsx` — `CadComponentReal3D`: pintura → `finishCadMaterial` → mecânica → ajuste ao painel;
  `useFrame` anima e pede frames enquanto há movimento. O Hager usa o manípulo de disjuntor já existente.
- `scripts/place-imported-terminals.py` → `src/data/imported-component-terminals.json`: bornes medidos em
  vistas ortográficas com grelha de 5 mm (`scripts/imported-grid-audit.html`) e na auditoria de raios.
- `src/electrical/importedComponents.ts` — novos bornes da torre e da chave; os modelos novos nascem no sítio
  medido (3D) e o símbolo 2D mantém as filas legíveis; `upgradeImportedTerminals` migra projetos gravados
  com a fila genérica (bornes fixados à mão ficam) e acrescenta os fios que faltavam. `updateImportedLoads`
  acende cada cor da torre com o seu fio e o comum.

## Bornes por modelo

| Modelo | Posição | Fonte |
| --- | --- | --- |
| Siemens 3RU1116 | 1L1/3L2/5L3 nos três pinos esquerdos do topo; 95/96/97/98 na fila do meio da frente; 2T1/4T2/6T3 na fila de baixo | gravação no CAD |
| Schneider XA2ED33 | 13/14 e 23/24 nos parafusos dos dois blocos traseiros | CAD + ficha Schneider |
| WEG CWBC65 | 1L1/3L2/5L3/A1 na fila traseira do topo; 2T1/4T2/6T3/A2 por baixo das mesmas colunas | CAD (a saída inferior não está desenhada) |
| WEG SPW12 | +, −, PE nas três entradas inferiores medidas | CAD; ordem dos rótulos por confirmar |
| Siemens 3TK2840 | quatro filas de três parafusos (topo: A1 Y11 Y12 / Y21 Y22 Y20; base: Y33 Y34 14 / 24 A2) | rótulos do manual 3TK28; ordem física por confirmar na etiqueta |
| Schneider GV2ME | 1/3/5 nas cavidades do topo; 2/4/6 na face inferior (o CAD não abre as entradas de baixo) | CAD |
| Telemecanique XUKT1 | V+/0V/OUT na ponta do cabo | CAD + ficha |
| EAO 61 | 11 (comum), 12 (repouso), 14 (chave rodada) nas três lâminas centrais | CAD; numeração IEC por confirmar |
| Torre SB2-3011 | R/Y/G/COM pela base | torre de 4 fios típica; cores dos fios por confirmar |

## Verificação

- `npm run test:terminal-geometry` — 34 modelos: 194 encaixes com cavidade medida por raios (32 novos nos CAD importados) e 20 pinos/fios/faces sem borne desenhado (`RealTerminalSpot.contact`).
- `npm run test:terminal-seat` — 194 bornes assentes nas cavidades (furos de botões/rearme dos CAD importados não contam como bornes).
- `npm run test:imported-components` — 137 verificações (lógica da chave e da torre, todos os bornes com posição
  medida, criação no sítio medido, migração de projetos antigos).
- `npm run test:imported-finish-ui` — 15 verificações: página isolada com os 14 GLB (materiais, pivôs, LED/lentes)
  e Painel 3D real com os tipos com mecânica, sem erros JavaScript.
- Páginas de revisão: `scripts/imported-finish-audit.html` (repouso vs ativo), `scripts/imported-terminal-audit.html`
  (bornes em uso e encaixes detetados), `scripts/imported-grid-audit.html` (medição).

## Limites

- As cores dos CAD sem cores seguem as cores habituais de cada família (RAL 7035, poliamida preta, aço zincado);
  não são amostras do aparelho físico.
- A posição física dos rótulos do 3TK2840, a ordem +/−/PE do SPW12, a numeração da chave EAO e as cores dos fios
  da torre devem ser confirmadas na etiqueta de cada aparelho.
- O CWBC65 não tem indicador mecânico visível no CAD; o contactor não anima.
