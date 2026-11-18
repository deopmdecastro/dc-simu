# LCDs físicos — D52-2066, KWS-306 e ATV320

## Requisito e âmbito

> Os novos componentes apresentam LCD fiel ao dispositivo real, quando aplicável.

Implementação do **mostrador identificável**: disposição, capacidade de dígitos,
sete segmentos, cores, unidades/precisão e ausência de conteúdo sem alimentação.
O mesmo desenho serve o simulador, o Editor 3D do Admin e as instâncias de versões
publicadas do catálogo. Não se acrescentam LCDs aos aparelhos que não os têm.

Esta revisão parte de `20150c06d4d05e0ef38d2ba9bb59978e86a660c0` (r212).
A fidelidade do mostrador não certifica firmware completo, CAD oficial,
metrologia, proteção elétrica nem aceitação visual de toda a carcaça.

## Faces implementadas

| Aparelho | Face física e dados apresentados |
| --- | --- |
| D52-2066 | Duas linhas superiores W/amarelo e kWh/laranja; duas linhas inferiores divididas em V/ciano, Hz/branco, A/vermelho e PF/azul. Energia com cinco posições e resolução adaptativa; potência com 0,1 W até 9999,9 W, depois 1 W. |
| KWS-306 | Janela horizontal de **52 × 35,1 mm**, não toda a frente quase quadrada. Grelha de três fases: V/azul-violeta, A/vermelho, kW/amarelo; rodapé com energia agregada/ciano, Hz e temperatura/branco. Quatro posições por canal e sete para energia. A energia real disponível é agregada: marca **SUM**, não a letra A da fotografia. |
| Schneider ATV320 | Quatro posições vermelhas de sete segmentos; `rEF-`, `COnF`, referência, frequência monitorizada e rampa em segundos. Uma avaria booleana sem diagnóstico mostra `----`, nunca o impossível texto de cinco caracteres `FAULT`; só códigos conhecidos explícitos são representados. |

- Os algarismos, letras do terminal ATV e pontos decimais são polígonos de
  segmentos; apenas as legendas/unidades usam texto. Não são fotografias coladas,
  fontes de algarismos ou valores de demonstração incorporados na face.
- Os três perfis ficam sem dígitos e sem legendas luminosas quando não alimentados.
  KWS alimentado com saída aberta mantém medições e mostra OFF no rodapé.
- Valores não finitos, negativos em campos não assinados ou fora da capacidade
  física usam traços; não são comprimidos, saturados, convertidos em expoentes
  visíveis ou truncados silenciosamente. A temperatura pode ser negativa;
  temperatura ausente é `---`, não um valor de demonstração plausível.
- As três apresentações KWS existentes conservam a grelha física: kW/energia,
  PF/energia e kW/potência total. PF deriva de W/(V×A) da mesma fase e potência
  total é a soma das fases. Não se implementam configurações/proteções/Wi-Fi ou
  contadores de energia por fase que o runtime não mede.
- As grandezas vêm do estado elétrico existente. RESET mantido durante 5 s e
  conservação de energia do D52 não foram substituídos por um simulador de visor.

## Integração e preservação do conteúdo do Admin

`src/three/deviceLcd.ts` centraliza formatação, disposição e desenho. Os modelos
nativos D52/KWS e ATV e o overlay do catálogo usam a mesma implementação.
Cada instância mantém a sua textura; uma assinatura evita redesenhos quando a
face visível não mudou. Os valores de exemplo usados nas capturas são entradas
explícitas do ensaio ótico, nunca os valores iniciais de uma peça nova.

O ATV criado de novo no Admin declara `DisplayDef.deviceFace = 'atv320'`.
No separador Ecrãs pode escolher **ATV320 · visor físico** ou **Texto personalizado**.
A escolha não apaga linhas, IDs, coordenadas, geometria, bornes ou controlos.
O modo personalizado continua a expandir as variáveis e guarda exatamente o
conteúdo escrito pelo utilizador.

Uma definição antiga só recebe adaptação visual em memória se for o **overlay
fábrica exato e intacto**, no modelo ATV correto. Nome, linhas, estilo, cores ou
retroiluminação alterados, ou escolha explícita `custom`, impedem essa adaptação.
Não há migração que reescreva rascunhos/versões publicadas ou resemeie controlos
eliminados pelo autor. Um GLB isolado permanece um ativo estático; é a definição
do componente, montada no runtime do catálogo, que restitui o mostrador dinâmico.

### Falhas de integração encontradas e corrigidas

1. `editorStore.open()` conservava valores de pré-visualização da sessão anterior.
   Um KWS novo podia herdar ON/energia de um D52 anteriormente testado. Agora só
   esse estado efémero é limpo; as variáveis iniciais e a definição persistida
   permanecem intactas.
2. `prepareActuatorHead()` cortava geometricamente todos os modelos do catálogo
   antes de verificar se existia controlo de cabeça de emergência. Ocultava o
   LCD original e deixava uma cópia estática `__head` à frente. A extração passa
   a ser opt-in de um controlo explicitamente ligado a `dcsimu_head`. Os 42
   testes dos botões de emergência continuam a passar.

## Referências usadas

- Fotografias fornecidas `image-17.png`/`image-18.png` (D52), `image-19.png` e
  `image-20.png` (KWS), e `IMG_5811.jpeg` (ATV). A foto controla o arranjo ótico,
  não fornece dados de execução nem prova que todo o firmware foi reproduzido.
- D52/YD52, [instruções do aparelho](https://www.cncele.com/uploads/YD52-2066-Instructions-23.11.29.pdf):
  precisão/autorresolução, RESET e persistência de energia.
- [Manual KWS convertido](https://manuals.plus/m/e39a53ad165a270c6c3e384a5fc1da7121b53a6b7031ddace502aecfbb220cac):
  campos kW/PF/energia/potência total e teclas; fonte de terceiros, não
  certificação de firmware pelo fabricante.
- Schneider, **NVE41295**, manual de programação ATV320; HMI de quatro posições
  e navegação ESC/encoder/ENT. Página HMI 38 da cópia NVE41295 09/2021 inspecionada.
  [Documento oficial](https://www.se.com/us/en/download/document/NVE41295/) e
  [cópia consultada](https://parlock.no/wp-content/uploads/2022/05/ATV320_Programming_Manual_EN_NVE41295_04.pdf).
  SHA-256 do PDF consultado:
  `8e45cf0461b59b6db00e4b118bd61a6422210590935bd0cdfe35fc298910d25e`.

## Validação local executada

| Ensaio | Resultado |
| --- | --- |
| TypeScript | `npm run typecheck`, exit 0 |
| Contratos LCD | **76 PASS** — arranjo/cores/capacidades, arredondamentos, glifos, valores inválidos, opt-out personalizado, não mutação, isolamento das sessões e não corte do LCD no catálogo |
| Navegador real | **86 PASS, zero exceções React/WebGL** — Panel3D e Admin montados, píxeis/campos, instâncias independentes, reutilização da textura, guardar/reabrir, texto personalizado, publicação/bake reais, reload completo do catálogo, cablagem de uma carga, STEP, STOP e roundtrip do projeto com tipos/IDs/endpoints preservados |
| Comparação nativo/Admin | Diferença de ocupação RGB normalizada: D52 **0**; KWS **0**; ATV **0,001266**, entre densidades de textura diferentes |
| Comparação publicado/Admin | **0** para os três aparelhos após reload completo |
| Botões de emergência | **42 PASS** |
| Medidores/Schneider | **53 PASS** |
| Industriais | **102 PASS**, incluindo ausência de LCD nos aparelhos sem mostrador |
| Editor 3D funcional | **57 PASS** |
| Sincronização dos integrados | **883 verificações**, 117 integrados/66 GLB, exit 0 |
| CI local completo | `npm run test:ci`, **exit 0**, 103 comandos encadeados, incluindo o novo contrato LCD |
| Servidor E2E | **188 PASS / 0 FAIL**, exit 0 |
| Dependências de produção | **0 vulnerabilidades**, exit 0 |

Resultados e capturas: [evidência LCD](validation/lcd-fidelity/results.json),
[log do navegador](validation/lcd-fidelity/browser.log) e
[log dos contratos](validation/lcd-fidelity/unit.log).
Os ensaios intermédios que falharam foram conservados separadamente no workspace,
não reclassificados como PASS. A última falha adicional de teste era uma tentativa
de clicar em Guardar depois de o autosave legítimo já o ter desativado; o ensaio
final guarda a alteração antes de aguardar a análise ótica, sem alterar o produto.

Estas fixtures exercitam a aplicação real com persistência/publicação local
isolada e pedidos externos bloqueados. **Não aprovam Supabase/RLS, login cloud,
firmware completo, toda a geometria externa ou desempenho numa GPU física.**
O job informativo legado GRAFCET da release anterior não foi reparado ou declarado
aprovado por esta revisão LCD. CI/build/produção do novo commit devem ter recibos
próprios; os hashes e resultados de r212 não os substituem.

## Reprodução

```sh
# Node 22; dependências e Chromium do Playwright instalados
npm ci
npm run typecheck
npm run test:device-lcd
npm run test:emergency-actuator
npm run test:ci
npm run test:server

# Noutro terminal, servidor de teste (não é publicação)
npx vite --host 0.0.0.0 --port 5173 --strictPort --mode uitest

# Navegadores em série num host com 2 GB
INDUSTRIAL_TEST_URL=http://127.0.0.1:5173 npm run test:device-lcd-ui

# Build estático depois do commit; confirmar a identidade em dist/version.json
VERCEL=1 npm run build
```

Relacionado: [medidores/Schneider](MEDIDORES-SCHNEIDER-3D.md) e
[recuperação de base](RECUPERACAO-2026-11-17.md).
