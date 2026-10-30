# Componentes CAD recebidos em 2026-10-30

Foram inspecionados os 17 ZIP de `public/models/componentes novos/`, preservando
os originais. Catorze contêm STEP utilizável; os restantes três só contêm CAD
nativo SolidWorks/Inventor. Os recursos de execução são os GLB convertidos em
`public/models/importados/`: 33 039 900 bytes no total, carregados a pedido.

> Seguimento: textura real, animação, luzes e bornes de todos os modelos em
> [COMPONENTES-IMPORTADOS-ACABAMENTO](COMPONENTES-IMPORTADOS-ACABAMENTO.md).

## Integração e limites

| Referência | Integração | Bornes / comportamento |
| --- | --- | --- |
| Schneider DF103NV | GLB, 3P+N | 8 encaixes medidos; três fusíveis e neutro seccionado |
| Schneider DF101V | GLB, 1P | 2 encaixes medidos; fusível e seccionamento |
| Schneider DF81N | GLB, 1P+N | 4 encaixes medidos; fusível e neutro seccionado |
| EAO 61-2101.0/D | GLB, atuador com chave e retorno | Mecânico; referência do bloco de contactos por confirmar |
| Siemens 3RU1116-1AB0 | GLB, relé térmico 1,1–1,6 A | Potência contínua; disparo comuta 95/96 e 97/98; posição dos bornes funcional |
| Hager CFC225P | GLB, 2P, 25 A, 300 mA | 4 encaixes medidos; manobra/disparo manual dos dois polos |
| Fim de curso 40.108 | Referência preparada, inserção bloqueada | Falta STEP/GLB e identificação dos contactos |
| Schneider XA2ED33 | GLB, seletor de 3 posições mantidas | Esquerda 13/14, centro aberto, direita 23/24; posição dos bornes funcional |
| WEG CWBC65 | GLB, contactor para condensadores | Bobina e três polos; pré-contactos/resistências e auxiliares não modelados; bornes funcionais |
| WEG SPW02 | GLB, DPS CA | 2 encaixes medidos; sem curto permanente L–PE ou simulação de impulsos |
| WEG SPW12 | GLB, DPS fotovoltaico CC | Sem curto permanente; posição e identificação física das ligações a confirmar |
| Siemens 3TK2840 | GLB, relé de segurança | Alimentação, dois canais, retorno e rearme didáticos; saídas estáticas 14/24; bornes funcionais |
| Schneider GV2ME | GLB, disjuntor-motor 3P | Manobra/disparo manual; calibre da variante e calibração dos bornes por confirmar |
| START 22 mm | Referência preparada, inserção bloqueada | Falta STEP/GLB do conjunto e referência do bloco de contactos |
| STOP 22 mm | Referência preparada, inserção bloqueada | Falta STEP/GLB do conjunto e referência do bloco de contactos |
| Torre SB2-3011 | GLB, modelo visual | Fabricante, tensão e pinagem por confirmar; sem ligações elétricas presumidas |
| Telemecanique XUKT1KSML2 | GLB, reflex, três fios | V+/0V/OUT, PNP/NPN e NA/NF; alimentação necessária; ligações funcionais na saída do cabo |

Os modelos novos têm tipos próprios: não substituem os aparelhos já colocados
em projetos anteriores. A biblioteca tem agora 39 tipos com GLB, contra 25
anteriormente. As três referências sem formato neutro continuam bloqueadas.
Os limites aparecem na ficha técnica do inspetor e nos metadados do editor 3D.

O relé 3TK2840 não foi tratado como o Allen-Bradley já integrado. O modelo de
simulação não reproduz certificação PL/SIL, pulsos de teste, falhas cruzadas,
temporização térmica nem cálculo de correntes de fuga ou de surto.

## Como a implementação é feita

1. `scripts/prepare-component-cad.py` identifica cada ZIP, extrai apenas os
   ficheiros necessários e regista SHA-256 da origem numa pasta de trabalho.
2. `scripts/build-imported-components.mjs` usa o OCCT/WASM já instalado no
   projeto. Preserva as cores CAD disponíveis, triangula e orienta as peças
   com rotação rígida, converte mm para metros e gera GLB sem recursos externos.
3. `scripts/imported-components.config.json` define a orientação e a montagem;
   `src/data/imported-component-models.json` regista dimensões medidas, origem
   e hashes. `modelPaths.ts` serve o mesmo modelo ao esquema, painel e editor.
4. `src/electrical/importedComponents.ts` define referências, bornes funcionais,
   estado, manobra e pontes elétricas. A fábrica, o motor e a store consomem
   estas regras; Esquema e Painel 3D partilham a manobra.
5. `audit-imported-terminals.ts` mede cavidades por raios. As associações
   elétricas revistas são normalizadas por `calibrate-imported-terminals.py`;
   `realInterfaces.ts` aplica os 20 encaixes confirmados. Os outros pontos
   continuam identificados como funcionais, sem alegar calibração concluída.
6. `vite.config.ts` copia os recursos públicos prontos e exclui a pasta de
   entrada. Os 17 ZIP acrescentavam 474 047 735 bytes ao build local; permanecem
   preservados e excluídos de Git, contexto Docker e build.

Exemplo, a partir da pasta da aplicação:

```powershell
python scripts/prepare-component-cad.py 'public/models/componentes novos' '../../../runtime/new-component-cad-20261030'
node scripts/build-imported-components.mjs '../../../runtime/new-component-cad-20261030'
npm run audit:imported-terminals -- '../../../runtime/new-component-cad-20261030'
python scripts/calibrate-imported-terminals.py '../../../runtime/new-component-cad-20261030'
npm run test:imported-components
npm run test:ci
npm run build
```

Uma nova exportação CAD exige rever orientação, encaixes e rótulos, mesmo que
o nome do ficheiro seja igual. A deteção geométrica não identifica o circuito.

## Pesquisa técnica

Foram usadas fontes dos fabricantes e os metadados dos ZIP:

- [Schneider TeSys DF](https://download.schneider-electric.com/files?p_Doc_Ref=9400HO1601&p_File_Ext=.PDF): composição dos polos e indicador de fusível fundido.
- [Hager CFC225P](https://assets.hager.com/step-content/P/PDS_156170925001PT/Document/std.lang.all/PDS_CFC225P_5001_pt-PT.pdf): dois polos, 25 A e 300 mA.
- [EAO 61-2101.0/D](https://www.eao.com/api/action/component/datasheet?lang=en&objectID=61-2101.0%2FD): atuador de duas posições com retorno.
- [Siemens 3RU1116-1AB0](https://sieportal.siemens.com/en-be/products-services/detail/3RU11161AB0): relé térmico de 1,1–1,6 A.
- [Schneider XA2ED33](https://www.se.com/sg/en/product/XA2ED33/complete-selector-switch-harmony-xa2-plastic-black-22mm-3-positions-stay-put-2no/): três posições mantidas e dois contactos NA.
- [WEG CWBC](https://static.weg.net/medias/downloadcenter/h97/h0e/WEG-capacitors-for-power-factor-correction-50033846-en.pdf): aplicação em condensadores e variantes de auxiliares/bobina.
- [WEG SPW](https://static.weg.net/medias/downloadcenter/hff/heb/WEG-product-line-automation-50019085-brochure-en.pdf): distinção SPW02 CA / SPW12 fotovoltaico CC.
- [Siemens 3TK28, pp. 110–113](https://cache.industry.siemens.com/dl/files/445/58843445/att_904331/v1/manual_safety_relay_3TK28_en-US.pdf): canais Y11/Y12 e Y21/Y22, retorno Y33/Y34 e saídas estáticas 14/24.
- [Telemecanique XUKT1KSML2](https://downloads.telemecaniquesensors.com/dam/datasheets/en/XUKT1KSML2_EN.pdf): três fios, saída única configurável PNP/NPN, NA/NF, reflex.
- [Schneider TeSys GV2](https://download.schneider-electric.com/files?filename=Catalog&p_Doc_Ref=MKTED210011EN): família tripolar de comando por botões; o nome genérico do CAD não fixa um calibre.

## Verificação e pendências

- `test:imported-components`: 103 verificações, incluindo os GLB, lógica,
  inserção e guardar/reabrir os 14 tipos.
- `test:ci`: passou, com geometria de 25 modelos / 162 bornes e importação
  funcional do editor 3D sem rede externa.
- `test:imported-components-ui`: passou; biblioteca, bloqueio do formato nativo,
  guardar/reabrir, painel 3D e renderização dos 14 GLB em quatro vistas.
- Build passou; os avisos de chunks grandes mantêm-se.
- A tentativa de conversão dos formatos nativos através do Inventor instalado
  falhou ao iniciar o servidor COM (`0x80080005`); não houve conversão desses três.

Pendente: exportações STEP/GLB de fim de curso, START e STOP; confirmar os
contactos/variantes ainda desconhecidos, completar a calibração dos sete tipos
com ligações funcionais e identificar a pinagem/tensão da torre. O modelo EAO
precisa de identificação do bloco de contactos antes da ligação elétrica.
