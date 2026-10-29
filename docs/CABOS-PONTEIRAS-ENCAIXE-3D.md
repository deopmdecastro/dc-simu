# Organização dos cabos e encaixe das ponteiras 3D

Implementado e testado localmente em 29 de outubro de 2026.

## Correções

- O colar duplo mantém-se centrado no borne. Apenas os cabos se deslocam para
  as respetivas bocas; anteriormente o colar e o cabo eram deslocados juntos,
  desenhando as entradas ao lado dos condutores.
- O desenho e a geometria partilham as dimensões do colar e o espaçamento
  dos canais. Os comprimentos das ponteiras simples/duplas terminam na saída
  física do isolamento. As sondas tocam a entrada livre do mesmo colar.
- A separação entre cabos conserva o troço junto às terminações e o percurso
  físico de aproximação ao motor, passagem pelo bucim e chegada aos bornes.
  Não pode transformar esse percurso em voltas grandes ou atalhá-lo.
- Os quatro condutores mantêm afastamento no bucim e têm percursos distintos
  dentro da caixa, com chegada axial às ponteiras.
- As colisões do motor são verificadas no seu referencial físico orientado.
  Os cantos vazios da caixa mundial deixaram de bloquear ligações do PLC.
  O troço exterior contorna o motor também depois de rodar, espelhar ou mudar
  a escala. O cache de edição inclui essa transformação.

Os bornes, IDs dos cabos, circuito, cores e pontos manuais do projeto são
preservados. A alteração atua no cálculo e no desenho 3D.

## Evidências

- `npm test`: núcleo do simulador passou.
- `npm run test:native-wires-3d`: 37 cabos visíveis, zero colisões entre cabos,
  passagem no bucim preservada e sem voltas fora da zona da caixa. Verificados
  ainda quatro casos de orientação/espelho/escala, sem atravessar a carcaça.
- `npm run test:solid-cables-meter`: medição 0 → 400 → 0 V, persistência,
  terminações partilhadas, pontos manuais e obstáculos orientados passaram.
- `npm run test:multimeter-ui`: Chrome local; 22 contactos nas bocas reais do
  modelo, desvio lateral inferior a 0,01 mm, 400 V em marcha e zero erros JavaScript.
  Capturas gerais, motor, fonte e saídas do PLC.
- `npm run build`: TypeScript/Vite/PWA passaram; aviso existente de chunks grandes.
- BrainNet: 45 testes e `npm run check` passaram.

Logs locais no BrainNet: `runtime/wires-fit-*.log`; imagens em
`runtime/wires-fit-ui/`. Dados sintéticos, com API real bloqueada nos testes UI.
Publicação em produção e reconstrução Docker não efetuadas nesta tarefa.
