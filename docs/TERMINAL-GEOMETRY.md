# Posição física dos bornes 3D

## Cobertura atual

A execução da recuperação de 17 de novembro de 2026 de
`npm run test:terminal-geometry` passou com **48 modelos CAD: 303 encaixes
com cavidade e 39 pinos/fios/contactos de superfície**, num total de 342
ligações medidas. Não são 342 cavidades; cada tipo de contacto tem a sua
verificação. A mensagem desse script lista ainda cinco tipos procedurais
excluídos do varrimento CAD — não se contam como aprovação geométrica.

D52, KWS e TC têm verificações específicas em `test:meters-schneider`
(53 asserções no conjunto da suite): referencial procedural idêntico no
Admin/simulador, encaixe real de tensão/secundário, passagem primária vazada
e conservação dos pontos na exportação. Os primários de passagem não são
tratados como parafusos com um fundo inexistente.

O estado agregado, limitações e publicação estão em
[RECUPERACAO-2026-11-17.md](RECUPERACAO-2026-11-17.md). Um ensaio geométrico não
substitui a aceitação visual nem uma medição/certificação do fabricante.

## Um referencial para o modelo e os cabos

`fitComponentModel` aplica a rotação base, espelho e ancoragem. Os novos
Schneider derivados de STEP conservam **fator uniforme de 1000 na conversão
metro → milímetro** porque os GLB estão em metros; patins abertos e manípulos salientes não servem
para esticar o corpo. Os medidores procedurais também declaram o seu
referencial nominal e a unidade de construção. Os CAD antigos continuam a
usar a calibração histórica pela caixa orientada, por compatibilidade.

Painel 3D, capturas, catálogo e Admin partilham esse contrato. Os bornes Admin
Schneider usam a implantação nominal, não a caixa variável dos patins/manípulos.
Os novos GLB procedurais guardam a unidade do referencial: o Admin converte-os
rigidamente, sem a normalização genérica para 50 mm. `preservePosition3D`
conserva pontos medidos de passagens abertas na publicação, sem inventar um
fundo ou um recuo de parafuso para impedir a projeção na envolvente.
O contrato verifica o ponto realmente usado por `terminalLocal3D`, e não apenas
uma coordenada de metadados que nunca chega ao cabo.

`src/electrical/realInterfaces.ts` contém bocas e normais na convenção Y=0 no
topo; `realTerminalPosition` faz a conversão e o recuo. Cavidades escalonadas
não podem ser orientadas pela face mais próxima da caixa exterior.
`industrial-device-geometry.json` contém o levantamento das sete peças
industriais. As tabelas WEG SPW02/SPW12 já estão no referencial final rodado:
**não aplicar novamente a inversão X/Z usada durante a recuperação**.

## Cavidades e marcadores

- O ensaio lança raios contra as malhas efetivamente visíveis e compara boca,
  fundo, aro, recuo e ponto real do condutor.
- A dimensão do marcador é limitada pela abertura e pela folga restante.
  Também se verifica a ampliação de seleção/hover de 1,32 ×. O diâmetro físico
  do terminal não foi reduzido para ocultar obstruções; `Terminal.diameter`
  continua a controlar a representação 2D.
- No ATV320 os terminais de comando são verificados com a **tampa de serviço
  genuína aberta**. A tampa fechada continua a ocultá-los; não foi perfurada
  nem removida para fazer o teste passar.
- O Finder 90.23 usa bocas medidas no aro local escalonado, não no máximo Z
  global. As folhas de contacto recuadas P1–P11 são **reconstrução funcional**,
  não contactos autenticados no CAD original.
- Um raio exatamente num vértice comum de uma triangulação pode não devolver
  interseção. Apenas nesse caso vazio se repetem raios a ±1 nm e se escolhe o
  fundo mais próximo. Uma obstrução finita nunca é ignorada por esse mecanismo.

## Complementos funcionais do MSR127 e PLC LS

O GLB MSR127 original permanece inalterado. A representação acrescenta quatro
bancos escalonados de quatro ligações, serigrafia e três lentes, referenciados
no manual Rockwell local. São complementos reconstruídos, não CAD oficial nem
validação PL/SIL. O PLC LS mantém as réguas funcionais necessárias às suas 34
ligações. A caixa do motor tem sete encaixes para enrolamentos e PE.

`terminalSocketGeometry.ts` recorta tampas sobrepostas e constrói cavidades
sem alterar a geometria de origem em cache. Isto não é metrologia de conectores
que o ficheiro original não continha.

## Projetos e calibrações guardadas

`legacyRealInterfaces.ts` conserva padrões automáticos antigos, incluindo as
posições WEG e Finder anteriores a esta recuperação. A migração estreita só
reconhece esses padrões intactos; mantém IDs, cabos, posições 2D e ajustes
manuais distintos. Bornes fixados (`pinned`) não são deslocados.

O multímetro conserva COM, VΩ, mA e 10A. A atualização da antiga tomada
VΩmA mantém o ID e acrescenta apenas as tomadas ausentes. A migração é
idempotente. Uma definição criada/editada por uma pessoa conserva a sua
calibração, sem uma nova deteção automática silenciosa.

Os scripts de colocação/calibração fazem merge preservando os restantes tipos.
Devem ser usados contra o modelo já orientado e ajustado, não contra eixos
brutos do fornecedor. Guardar as tabelas antigas antes de uma nova calibração.

## Verificação

```sh
npm run typecheck
npm run test:terminal-geometry
npm run test:terminal-seat
npm run test:meters-schneider
npm run test:industrial
npm run test:ci
```

`test:terminal-geometry` rejeita centros fora dos furos, pontos dentro do
material, marcadores sem folga, normais erradas e deformações do referencial.
A suite industrial verifica também SHA-256 dos GLB, fichas PDF, dimensões e
continuidade elétrica. A carga de imagens embutidas pode produzir avisos do
GLTFLoader em Node; os materiais/texturas são testados adicionalmente no browser.

Para inspeção visual local: iniciar Vite e abrir
`/scripts/terminal-geometry-view.html`. O cenário partilha a normalização e os
marcadores do produto. O teste de editor completo usa uma conta sintética,
sem API, service workers ou escrita cloud:

```sh
TERMINAL_TEST_URL=http://127.0.0.1:5173 npm run test:terminal-geometry-ui
```

Reiniciar o Vite depois de mudanças que dupliquem módulos de estado/React evita
confundir HMR com comportamento de produção. As novas fixtures esperam pela
geometria montada com predicados síncronos; uma Promise que resolve `false`
não é uma condição válida de prontidão em `waitForFunction`.

## Bornes e comandos criados no Admin

**Bornes → Encaixe dos bornes → Verificar encaixe** usa `terminalSeat.ts` para
medir boca e fundo; distingue cavidade, superfície, material e ausência de
apoio. **Encaixar** procura um furo livre na mesma face e grava a profundidade e
o recuo, em vez de projetar o marcador na face exterior.

A deteção de comandos infere botão, manípulo, seletor, visor e LED por nome e
forma. Os novos integrados usam controlos físicos explícitos; não se põe uma
caixa de atuação automática invisível sobre o corpo. Áreas de interação
criadas expressamente pelo autor continuam suportadas. Mola/retenção e
`holdVar` distinguem o retorno físico de uma ação elétrica retida.
