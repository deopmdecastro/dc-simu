# Posição física dos bornes 3D

As 142 ligações dos 20 equipamentos integrados com bornes usam o mesmo volume físico que o CAD renderizado. A calha DIN não tem ligações elétricas. Componentes importados pelo utilizador mantêm a geometria e a calibração da respetiva definição.

`fitComponentModel` aplica a rotação base, o espelho definido pelo modelo, as três dimensões físicas e a ancoragem. Painel 3D, capturas por face, catálogo, landing e o leitor de medições usam esta normalização. Os GLB originais não são modificados.

`src/electrical/realInterfaces.ts` contém as bocas dos encaixes na convenção Y=0 no topo. `realTerminalPosition` converte para Y=1 no topo e coloca o centro da ligação no interior da cavidade. A normal da ligação usa a face do encaixe medido; escolher apenas a face mais próxima da caixa exterior dá uma direção errada em cavidades recuadas, como as do Phoenix PTI 6.

O diâmetro do marcador vem da abertura física e é limitado pela profundidade disponível. O campo `Terminal.diameter` continua a controlar o símbolo 2D. Os marcadores respeitam a profundidade do modelo e deixam de ser desenhados através do plástico.

## Réguas complementares

Os CAD do relé de segurança e do PLC LS não contêm os encaixes necessários às 16 e 34 ligações configuradas. A pedido do utilizador, a visualização acrescenta réguas vazadas, com fundo recuado e um furo por ligação. A caixa funcional do motor passa a ter sete encaixes alinhados com as seis ligações de enrolamento e PE; as pontes Y/Δ conservam o comando existente.

`terminalSocketGeometry.ts` recorta as tampas sobrepostas e acrescenta estas cavidades sem alterar a fonte GLB em cache. Esta geometria complementa a representação funcional; não representa uma medição dos conectores ausentes no CAD original.

## Projetos guardados

`legacyRealInterfaces.ts` conserva as posições automáticas até ao commit `13896bc`. No carregamento, a migração reconhece as versões com Y invertido, os pontos na superfície e os pontos recuados antigos. Conserva IDs, coordenadas 2D, cabos e posições manuais distintas desses padrões; bornes fixados (`pinned`) não são deslocados.

O multímetro recupera as quatro tomadas `COM`, `VΩ`, `mA` e `10A`. Projetos da versão com apenas duas tomadas recuperam as duas em falta; a ligação antiga `VΩmA` mantém o seu ID e passa a `VΩ`. A migração é idempotente.

## Verificação

Na pasta da aplicação:

```powershell
npm run test:terminal-geometry
npm test
npm run typecheck
npm run build
```

O teste geométrico carrega os GLB locais e mede o fundo e o aro de cada cavidade por raios. Rejeita centros fora do furo, pontos dentro do material, marcadores maiores do que o espaço disponível, dimensões incoerentes e cabos orientados pela face errada. Cobre as 142 ligações, incluindo as réguas complementares.

Para rever visualmente, iniciar Vite e abrir `/scripts/terminal-geometry-view.html`. O cenário usa a mesma normalização e os mesmos marcadores do produto. Permite selecionar componente/face e medir um ponto clicando no modelo.

O percurso automatizado no editor completo usa uma sessão e um projeto sintéticos, sem API real:

```powershell
$env:TERMINAL_TEST_URL = 'http://127.0.0.1:5173'
$env:TERMINAL_TEST_CHANNEL = 'chrome' # opcional, para usar o Chrome instalado
npm run test:terminal-geometry-ui
```

O servidor Vite de teste deve arrancar com as integrações remotas desativadas. Reiniciá-lo depois de alterar módulos de estado evita testar instâncias duplicadas pelo HMR. O script bloqueia API, service workers e consulta de versão; permite apenas os servidores de fontes usados na interface, incluindo os dados do resolvedor Unicode do texto 3D. `TERMINAL_TEST_OUTPUT` permite guardar capturas numa pasta de evidências sintéticas.

## Encaixe dos bornes criados no editor

O editor de componentes usa o mesmo método por raios (`src/catalog/terminalSeat.ts`) para os bornes que o administrador cria:

- **Bornes › Encaixe dos bornes › Verificar encaixe** mede, para cada borne, a boca (anel de 12 raios a 0,65 × Ø) e o fundo (raio central) ao longo da normal, e classifica: dentro da cavidade, à boca do furo, fora do modelo, dentro do material, face plana ou sem superfície.
- **Encaixar / Encaixar todos** move o borne para o furo livre mais próximo na mesma face (até 1,5 × Ø ou 5 mm) ou recua-o para dentro da cavidade que já tem por baixo, e grava `socketDepthMm`/`socketInsetMm`.
- Os bornes criados a partir de furos (`addTerminalInHole`) já nascem recuados, com a profundidade e o recuo medidos; antes ficavam à boca do furo e, sem estes campos, o simulador projetava-os na face exterior da caixa.

Verificação automática: `npm run test:terminal-seat` (142 bornes integrados dentro das cavidades, correção «boca → cavidade» em cada modelo, bornes criados a partir dos furos detetados) e `npm run test:editor3d-autodetect-ui` no editor completo.

## Deteção automática e retorno (mola/retenção)

**Botões › Deteção automática no modelo** (também na aba Bornes) propõe bornes, botões, manípulos, seletores, ecrãs e LEDs pelo nome dos objetos do GLB e, para nomes genéricos de CAD, pela forma (placa fina à face → ecrã; cilindro pequeno a sobressair → botão; disco Ø ≥ 22 mm → seletor; peça pequena emissiva → LED). Para cada botão é inferido o retorno (`ControlDef.returnMode`): mola nas botoneiras de impulso e nos botões TEST/rearme; retenção nos manípulos de disjuntor (basculante, «clique com mola») e nas emergências travadas. Com mola, a variável só fica ativa enquanto o botão está premido. Cobertura: `test:interactables` e `test:auto-detect-models` (GLB reais).
