# Motor SEW DRN80: pá de três pás, caixa de bornes real e biblioteca de texturas

26/10/2026 · carimbo de publicação #57 ou posterior

## Diagnóstico (antes)

- O CAD `public/models/motores/DRN80MK4-B3.glb` (mm, Y para cima, veio em +X) tem a caixa de bornes em x = 46…156, z = ±56,5, y = 98…128. É um bloco maciço com uma ranhura de 2 mm no topo.
- Os bornes e a placa estavam colocados no centro do motor (x = 132), ou seja, 31 mm à frente do centro real da caixa (x = 101). Por isso pareciam "fora do sítio".
- Ficavam também apertados e sem porcas, sem PE e sem bucim.
- A ventoinha do projeto estava em x = 1,76 unidades, para lá da ponta do veio.

## Caixa de bornes (fonte única)

A disposição está toda em `src/three/motorTerminalLayout.ts`, em dados puros. A geometria, os bornes elétricos, as pontes e o editor usam todos esta fonte.

| Elemento | Medidas (CAD, mm) |
|---|---|
| Interior da caixa | paredes de 5 mm desde o fundo y = 104 até ao topo 128; junta de vedação |
| Placa isolante | centro x 101, z −7; 62 × 46 × 8 mm (topo y = 112), com nervuras e parafusos |
| Pernos M4 | passo de 18 mm; anilha de 2 mm; porca sextavada 7 mm entre faces, 6,4 mm de altura; furo Ø4,8 mm |
| Fila de trás | W2 · U2 · V2 (z = −17) |
| Fila da frente | U1 · V1 · W1 (z = +3), alinhada em pares IEC (U1↔W2, V1↔U2, W1↔V2) |
| PE | pedestal em (101, z 36), anilha verde/amarela e símbolo de terra |
| Bucim M20 | x 128, y 114, Ø20 mm |

- `src/three/motorTerminalBox.ts` gera a caixa: paredes, fundo, junta, placa com etiquetas U1…V2, seis pernos com anilha e porca, PE e bucim. O CAD é cortado em y = 104 (o "teto" maciço sai) e a caixa gerada encaixa no lugar.
- `REAL_TERMINALS.motor3ph` é calculado a partir da disposição: furo de 4,8 mm, 5,4 mm de profundidade; PE com 4,2 mm.
- `MotorTerminalBoard3D` desenha só as pontes de latão. Clicar na placa alterna Y → Δ → sem pontes:
  - Y liga W2-U2-V2;
  - Δ liga U1-W2, V1-U2 e W1-V2.

## Pá de três pás

- A pá fica no veio (Ø19, x = 241…264), com o cubo em x = 256. Tem 3 pás elípticas com 28° de passo, Ø110 mm.
- Roda com a velocidade simulada (`rpmVisual`) e respeita o sentido (cw/ccw).
- No projeto, as propriedades do motor têm o grupo «Peças visíveis», com um olho para «Pá do veio (3 pás)» (`state.showFan`). O estado fica guardado no projeto.
- No editor de elementos, o rascunho do motor traz o grupo «Pá do veio (3 pás)» com:
  - `optional: true` (olho no projeto);
  - `spin: { axis: 'x', turnsPerSecond: 1,5, source: '$rpm' }`.
- Qualquer peça pode ter rotação contínua. Em Objeto → «Rotação contínua» define-se:
  - eixo e voltas/s;
  - a fonte: `$rpm` do motor, `$run` ou uma variável da definição;
  - inverter, «Testar rotação» (passa para Simular) e trocar o sentido.
- Em Objeto → «No projeto» há duas opções:
  - «Peça opcional (olho)»: aparece no grupo «Peças visíveis» das propriedades do componente publicado (`state.hiddenParts`);
  - «Só no editor»: a peça serve só de pré-visualização e não vai para o GLB publicado. As pontes Y do rascunho usam esta opção para não duplicar as pontes do projeto.
- Migração dos rascunhos antigos:
  - os bornes que ainda estavam no centro do motor passam para os pernos;
  - as pontes antigas são substituídas;
  - a pá é acrescentada uma única vez. Se o utilizador a eliminar, não volta a aparecer.
  - A migração não mexe em bornes editados à mão e é idempotente.

## Biblioteca de texturas reais

- Fica no editor de elementos, separador Materiais → «Biblioteca de texturas reais».
- Tem 15 materiais PBR fotografados, com cor, relevo (normal), rugosidade e, nos metais, metal, à escala física («Padrão (mm)»):

| Categoria | Texturas |
|---|---|
| Tintas | pintura industrial (tingível), pintura em pó texturada (tingível) |
| Metais | aço escovado, aço inox, alumínio fundido, ferro fundido, aço zincado, latão, cobre, chapa xadrez |
| Plásticos e borracha | plástico preto, plástico técnico (tingível), borracha |
| Construção | betão, madeira |

- Clicar aplica a textura ao material atual. ⊕ cria um material novo com essa textura. «Remover textura» limpa os mapas.
- Nas texturas tingíveis, a cor do material multiplica o mapa, o que permite escolher a cor RAL.
- Primitivas: UV por projeção em caixa (`boxProjectUv`), com repetição em mm, independente da escala da peça.
- Peças GLB: «Substituir os materiais do CAD» aplica o material escolhido às malhas do GLB, incluindo as paredes e o fundo da caixa gerada.
- «Aplicar a» também funciona em peças GLB.
- Os ficheiros estão em `public/textures/lib/<slug>/`: `color.jpg`, `normal.jpg`, `roughness.jpg`, `metalness.jpg` e `thumb.jpg`, com cerca de 1,2 MB no total. São carregados a pedido (não entram no precache da PWA).
- Ao publicar, as texturas são assadas no GLB. Se os assets tiverem sido retirados, o caminho da biblioteca serve de reserva.

### Créditos

As texturas são do [ambientCG](https://ambientcg.com) e estão em domínio público (CC0 1.0):

| Textura | Material de origem |
|---|---|
| pintura-industrial | Paint004 |
| pintura-texturada | Paint005 |
| aco-escovado | Metal009 |
| aco-inox | Metal055A |
| aluminio-fundido | Metal041A |
| ferro-fundido | Metal038 |
| aco-zincado | Metal032 |
| latao | Metal042A |
| cobre | Metal035 |
| chapa-xadrez | DiamondPlate008A |
| plastico-preto | Plastic006 |
| plastico-claro | Plastic010 |
| borracha | Rubber004 |
| betao | Concrete034 |
| madeira | Wood051 |

## Testes

- `npm run test:motor` (13 verificações) cobre:
  - posição dos bornes na caixa real e frações vs. `REAL_TERMINALS`;
  - pontes Y/Δ e caixa gerada;
  - `spinRate`, rotação e olho na `ComponentRig`;
  - publicação sem peças «só no editor»;
  - migração idempotente;
  - ficheiros da biblioteca, `applyLibraryTexture` e `boxProjectUv`.
  - Está incluído em `test:ci`.
- `npm run test:motor-ui` (12 verificações, requer Vite em 5173) cobre:
  - pá e «Testar rotação» no editor;
  - biblioteca (15 miniaturas, aplicar e ⊕);
  - olho no projeto;
  - capturas em `runtime/motor/` quando `EDITOR3D_TEST_OUTPUT` está definido.

## Pendências

- O motor já publicado no catálogo continua com a versão antiga (bloco maciço). É preciso abrir o rascunho (que é migrado automaticamente) e publicar de novo para assar a nova caixa e a pá.
- O motor integrado (não publicado) já usa a nova caixa.
