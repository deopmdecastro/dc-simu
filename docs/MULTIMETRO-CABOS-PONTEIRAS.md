# Cabos das sondas e ponteiras duplas no motor

Implementado e testado localmente em 29 de outubro de 2026.

Os cabos de ensaio saem axialmente da ficha banana e do punho da sonda.
O percurso usa uma curva contínua; quando um aparelho obriga a um desvio,
reserva-se folga antes de arredondar os cantos e verificar novamente os sólidos.
Os pontos 3D definidos manualmente continuam a ser respeitados pelo encaminhamento.

No nativo de partida direta, os cabos de alimentação de U1 e V1 terminam
em ponteiras duplas: uma manga metálica no borne e um colar com duas entradas.
A alimentação entra de um lado e a ponta metálica da sonda toca a outra entrada.
A posição visual depende da normal do borne, incluindo a orientação do motor.
As ligações elétricas continuam nos mesmos bornes; não se cria uma ponte entre fases.

Ao abrir uma cópia anterior do nativo, a atualização acrescenta a marca
`motor-meter-double-ferrule-v1` e altera apenas as terminações que partilham
o borne com as sondas existentes. Preserva cores, aparelhos e traçados manuais.
Não repõe sondas eliminadas. A alteração fica por guardar; premir **Guardar**
para a conservar na cópia do projeto.

Verificações concluídas:

- `npm test`: núcleo do simulador.
- `npm run test:solid-cables-meter`: migração, persistência, medição
  0 → 400 → 0 V e proteção dos corpos sólidos.
- `npm run test:native-wires-3d`: 37 cabos visíveis, sem colisões entre cabos;
  saídas axiais, curvas sem cotovelos agudos e sondas nas segundas entradas.
- `npm run test:terminal-geometry` e `npm run test:terminal-seat`: bornes e encaixes.
- `npm run test:multimeter-ui`: Chrome local, duas fichas banana, duas sondas,
  dois colares duplos/quatro entradas, 400 V em marcha e zero erros JavaScript.
- `npm run build`: TypeScript, Vite e PWA; mantém o aviso de chunks grandes.
- BrainNet: `npm test` (45 testes) e `npm run check`.

Evidências locais no BrainNet: `runtime/motor-leads-{regression,wires,ui,build}.log`
e `runtime/motor-leads-ui/native-motor-double-ferrule-detail.png`.
Os testes de interface usam dados sintéticos e bloqueiam a API.
Publicação em produção não verificada nesta tarefa.
