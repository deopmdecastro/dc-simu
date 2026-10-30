# Paridade tablet ↔ PC, barras sem cortes, editor offline e cabos do motor

Incremento de 2026-10-30, a partir de uma inspeção completa da plataforma (landing, entrada,
carregamento, painel, administração, editor de componentes 3D, Esquema 2D/3D, Ladder e GRAFCET)
em PC (1440 × 900, 1280 × 800) e tablet (1180 × 820, 820 × 1180, 744 × 1133), sobre a build de
produção (`vite preview`).

## Problemas encontrados

| # | Área | Problema | Gravidade |
| --- | --- | --- | --- |
| 1 | Cabos 3D do motor (projeto nativo) | Os commits `1775647`/`9075c72` (furo real do bucim M20) deixaram 7 verificações de `test:native-wires-3d` a falhar: cabos a atravessar a carcaça, quatro cabos colados dentro do furo e chegada ao borne fora do eixo do olhal. | Alta |
| 2 | Editor (Esquema/3D) | Os rótulos 3D (`Text` do drei/troika) iam buscar dados de fontes à CDN jsdelivr. Sem essa CDN (offline, PWA, rede escolar com firewall) o pedido falhava, o Suspense nunca resolvia e o editor ficava preso em «A carregar o editor…». | Alta |
| 3 | Tablet | Regras `(pointer: coarse)` aplicavam o layout de telemóvel a qualquer ecrã tátil, de qualquer largura; tablets em retrato (744–1024 px) caíam ainda em pontos de quebra de 760–1199 px. O tablet não abria como o PC. | Alta |
| 4 | Barras do editor | A 1280 px os separadores de vista apareciam cortados («quema», «M») e o zoom ficava fora do ecrã; a 1440 px a 2.ª linha escondia 154 px (Esquema) e 197 px (GRAFCET); acima de 1800 px os rótulos voltavam e o botão «Caixa-preta» ficava sempre fora do ecrã. | Média |
| 5 | Editor de componentes 3D | A 1280 px a fita principal transbordava 51 px («Adicionar forma» tapado por «Organizar»); o botão «Canvas» (só telemóvel) aparecia no PC e amontoava o cabeçalho do painel. | Média |
| 6 | Administração | Cartões de indicadores com ícone, rótulo, detalhe e seta sobrepostos em todas as larguras (CSS para a marcação antiga); a cor de tom dos ícones era anulada. | Média |
| 7 | Capa dos projetos | Os cabos da capa eram «Z» com dobra a meio, todos sobrepostos e por cima dos aparelhos. | Baixa |

## Correções

1. **Cabos do motor** (`src/three/wireGeometry3D.ts`): o troço exterior volta a contornar o motor
   pela esquerda e pela frente (`MOTOR_CAD.maxZ + 22 mm`) e só então segue o eixo do furo real do
   bucim; cada cabo tem o seu quadrante no furo (±2,6 mm); dentro da caixa há um ponto por fila de
   bornes e o U1/W2 sobe logo à saída do furo para passar por cima do olhal do PE. O olhal (terminal
   plano) passa a apontar para o interior do bucim e o cabo chega-lhe alinhado.
2. **Fonte local dos rótulos 3D** (`src/three/SceneText.tsx`, `public/fonts/inter-latin-600-normal.woff`,
   OFL em `public/fonts/Inter-OFL.txt`): `Panel3D` e `WireDraw3D` usam um `Text` com a fonte local;
   o `.woff` entra no precache da PWA.
3. **Paridade tablet ↔ PC**:
   - `index.html`: tablet = tátil com o lado curto ≥ 600 px. Se a largura atual for < 1280 px, a
     meta viewport passa a `width=1280` e o navegador escala a página — o mesmo layout do PC.
     Atualiza ao rodar o ecrã.
   - `src/ui/device.ts`: `TABLET_LAYOUT_WIDTH`, `PHONE_TOUCH_QUERY`, `isTabletDevice`, `isPhoneTouch`.
   - CSS: as regras `(pointer: coarse)` que mudam o layout passam a só telemóvel
     (`(pointer: coarse) and (max-width: 743px), (pointer: coarse) and (max-height: 520px)`);
     `(pointer: coarse) and (max-height: 700px)` passa a `520px`. Ficam para todos os ecrãs táteis
     apenas as revelações de botões que no PC aparecem ao passar o rato (`opacity: 1`).
   - JS (`simUi`, `LadderEditor`, `cleanMode`, `Toolbar`, `toolbarKit`, `ComponentEditor3D`, `App`):
     a mesma definição de telemóvel.
4. **Barras sem cortes** (`useOverflowCompact` em `src/ui/toolbarKit.tsx`): a barra passa a compacta
   quando o conteúdo completo não cabe — medido, com confirmação após 400 ms para não piscar durante a
   troca de vista — e volta à completa quando a janela tiver a largura que faltava (memorizada por
   vista). Usado na barra do simulador e na do editor de componentes. Os rótulos das ferramentas de
   edição/GRAFCET ficam só ícone a partir de 1101 px (antes só até 1800 px).
5. **Editor de componentes**: `.dc-side-panel-actions > .ce-mobile-panel-close` fica escondido fora
   do telemóvel.
6. **Administração** (`admin-refine.css`): grelha do cartão por linhas (topo · valor · rodapé) e tons
   `adm-tile-<tom>` reais.
7. **Capa** (`projectPreview.ts`, `ProjectCover.tsx`): cada borne guarda o lado de saída (topo/base) e o
   limite do aparelho; o cabo sobe/desce para uma calha fora do aparelho, numa faixa própria.

## Verificação

- `npx tsc -b` e `npm run test:ci`: 1147 verificações, 0 falhas (inclui `test:native-wires-3d`).
- `npm run test:tablet-parity-ui` (novo, 36 verificações): tablets 1180 × 820, 820 × 1180 e 744 × 1133
  reconhecidos e com layout de 1280 px, painéis fixos, nenhum botão da barra cortado em Esquema,
  Ladder e GRAFCET (também PC 1440/1280), sem erros JS, indicadores da administração sem sobreposição.
- `npm run test:toolbar-ui`: 95 verificações (igual à base); a viewport passou a 1920 px porque a
  1440 px a barra completa não cabe e compacta (os «Atalhos» ficam no «Mais»).
- `test:admin-ui`, `test:landing-ui`, `test:barras-padrao` e `test:admin-saas-ui` já falhavam no commit
  de partida (`9075c72`) com as mesmas mensagens; não são regressões deste incremento.
- `npm run inspect:platform` (novo): capturas de todos os ecrãs em PC e tablet com métricas de
  transbordo, erros e largura de layout (`PLATFORM_OUT`, `PLATFORM_URL`, `PLATFORM_CHROME`).

## Pendências

- Confirmar em iPad/Android reais (Safari e Chrome) a escala `width=1280`, sobretudo em retrato, onde
  o texto fica a ~64 % do tamanho.
- O registo de contas continua desativado por desenho (só as contas Admin e User).
- As quatro suítes de UI que já falhavam antes precisam de revisão própria.
