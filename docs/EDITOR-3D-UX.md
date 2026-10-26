# Editor de componentes e esquema 3D

## Editor de componentes

A barra «Elementos» reúne pesquisa e filtros com contagens para Peças, Bornes, Controlos, Ecrãs e Luzes. As secções podem ser recolhidas; o LCD e os controlos aparecem antes da lista de bornes. O inspetor acompanha a seleção e organiza as propriedades em Construção, Funcionamento e Componente. Em desktop, arraste os separadores laterais ou use as setas para ajustar a largura; `Home` ou duplo clique repõe o valor inicial. A preferência fica guardada no browser.

As ferramentas principais ficam na primeira linha. Vista, biblioteca de bornes e «Organizar» ficam na segunda. O menu Organizar reúne duplicar, agrupar, separar/juntar partes, eliminar, pousar e centrar; os atalhos mantêm-se. Os menus abrem por cima da barra para continuarem acessíveis quando esta tem deslocamento horizontal.

### PLC Siemens LOGO!

Ao importar o LOGO! 12/24RC, o editor cria um LCD de texto e seis teclas — ESC, OK e quatro cursores — além dos 19 bornes. Selecionar o LCD abre Ecrãs; selecionar uma tecla abre Botões. É possível selecionar ambos diretamente no modelo, alterar o texto e aspeto do visor e ajustar as áreas de clique das teclas.

Na pré-visualização, OK e os cursores percorrem as páginas; ESC regressa ao início. As variáveis do LCD podem ser editadas no componente. Nas instâncias do catálogo derivadas do LOGO, o visor recebe alimentação, estado RUN/STOP/PAUSE, bits I/O e diagnósticos do PLC. A navegação do visor não programa o firmware do equipamento físico.

Rascunhos anteriores sem estes elementos recebem-nos ao abrir, preservando peças, bornes e IDs. Controlos ou ecrãs personalizados são conservados. O importador regista que introduziu os elementos para não recriar aqueles que o autor eliminar depois.

O CAD junta várias teclas na mesma malha. Cada tecla usa uma área de clique local à peça, independente das restantes; premir a tecla não desloca o corpo do PLC. As dimensões/posição dessa área ficam nas propriedades do controlo, e uma área inválida é assinalada na validação.

### Operações gerais

- A pesquisa da hierarquia encontra objetos, bornes, botões, luzes e ecrãs, sem distinguir acentos. `Esc` limpa o filtro.
- As linhas da hierarquia têm foco de teclado. `Enter` ou espaço seleciona; as setas percorrem objetos e expandem/recolhem grupos. A seleção de um borne abre as suas propriedades em ecrãs pequenos.
- «Enquadrar seleção» inclui todas as peças selecionadas e também serve para bornes, controlos, luzes, ecrãs e cabos de teste.
- Até 1024 px, «Canvas 3D», «Objetos» e «Propriedades» alternam a área disponível. Biblioteca, Guardar e Publicar permanecem acessíveis no cabeçalho.
- Agrupar, desagrupar e arrastar uma peça para outro grupo conserva as transformações mundiais, na pose base e nos estados. Uma escala nula ou uma combinação que exija deformação por cisalhamento recusa a operação com uma mensagem, conservando o modelo.
- O bloqueio de um grupo também protege os filhos contra o gizmo e a ferramenta Apagar. As operações válidas ficam no histórico.

Os 20 modelos CAD integrados usam a normalização física partilhada com o simulador. Os 142 pontos de ligação mantêm-se dentro dos encaixes; o marcador visível tem o tamanho limitado pelo diâmetro e profundidade, enquanto a área de clique é independente. Os blocos vazados do relé de segurança, PLC LS e motor também fazem parte da geometria importada.

Ao abrir uma importação antiga reconhecida como intacta, o editor atualiza a geometria e os pontos sem mudar os IDs dos bornes. Rascunhos com ajustes de posição, peças separadas, estados personalizados ou outros elementos que impeçam uma atualização segura são preservados. Versões já publicadas conservam o conteúdo existente.

A preparação para o catálogo conserva a posição interior, o tamanho do encaixe e a normal de saída do cabo. O teste deste percurso regista versões sintéticas apenas em memória; não publica componentes.

## Esquema 3D

- «Selecionar» permite selecionar e mover equipamento sem acionar os seus controlos. `Ctrl`/`Shift` + clique permite seleção múltipla.
- «Manobrar» ativa os controlos dos equipamentos desbloqueados. `Esc` sai da manobra, limpa a sonda e regressa a Selecionar.
- «Apagar» elimina componentes e cabos, respeita bloqueios e permite recuperar com `Ctrl+Z`.
- «Sonda» permite escolher bornes e usa a medição existente do simulador. Oriente a câmara para a face do encaixe para o alcançar.
- «Mover vista» desloca a câmara, incluindo por toque.
- `F` enquadra o volume de toda a seleção. `Home` enquadra o conjunto; o teclado numérico escolhe vistas, incluindo `Numpad7` para o topo com NumLock desligado.

## Verificação local

```powershell
npm run test:editor3d-functional
npm run test:logo-editor
npm run test:terminal-geometry
npm run dev -- --host 127.0.0.1 --port 5173
```

Noutro terminal, com Chrome instalado:

```powershell
$env:EDITOR3D_TEST_URL = 'http://127.0.0.1:5173'
$env:EDITOR3D_TEST_CHANNEL = 'chrome'
npm run test:editor3d-ui
$env:LOGO_EDITOR_TEST_URL = 'http://127.0.0.1:5173'
$env:LOGO_EDITOR_TEST_CHANNEL = 'chrome'
npm run test:logo-editor-ui
```

O teste UI usa um contexto descartável, bloqueia API, serviços remotos e atualização de versão, e permite apenas os recursos locais e as fontes do renderizador. Use uma execução Vite sem alterações de código pendentes para evitar módulos duplicados por HMR. `EDITOR3D_TEST_OUTPUT` permite guardar capturas num diretório local de evidências.
