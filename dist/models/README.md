# Ficheiros 3D dos componentes

Cada pasta corresponde a uma categoria da Biblioteca. Use ficheiros **`.glb`**
(preferencial: geometria, materiais e texturas num só ficheiro) ou `.gltf`
(com os recursos associados na mesma pasta). Nomes curtos, sem espaços nem
acentos, por exemplo `disjuntor-2p.glb`.

| Categoria da Biblioteca | Pasta |
|---|---|
| Proteção | `protecao/` |
| Comando | `comando/` |
| Contatores | `contactores/` |
| Relés | `reles/` |
| Controladores | `controladores/` |
| Motores | `motores/` |
| Acionamentos | `acionamentos/` |
| Sensores | `sensores/` |
| Sinalização | `sinalizacao/` |
| Bornes e barras | `bornes-e-barras/` |
| Fontes | `fontes/` |
| Aparelhos de medir | `aparelhos-de-medir/` |

## Modelos disponíveis

`controladores/logo-siemens-1224rc.glb` é o modelo Siemens LOGO! 12/24RC.
É usado no Painel 3D, na imagem frontal do Esquema e na miniatura da
Biblioteca. A URL pública correspondente é
`/models/controladores/logo-siemens-1224rc.glb`; os três usos partilham o
caminho definido em `src/three/modelPaths.ts`.

O modelo é ajustado à orientação e escala da cena pelo código. O ecrã é
identificado pelo material verde e reage à alimentação no borne L+.

Os CAD integrados pelo renderizador comum de `src/schematic/cad3DImage.ts` e pela tabela única de
`src/three/modelPaths.ts` são:

| Tipo | Ficheiro | Vista no painel |
|---|---|---|
| Disjuntor WEG MDW-C10 | `protecao/weg-mdw-c10.glb` | Calha DIN |
| Disjuntor Steck SD C25 1P | `protecao/steck-sd-c25-1p.glb` | Calha DIN |
| Disjuntor Schneider Easy9 EZ9 1P (`breaker1p`) | `protecao/schneider-ez9-1p.glb` | Calha DIN |
| Disjuntor Schneider Easy9 EZ9 2P (`breaker2p`) | `protecao/schneider-ez9-2p.glb` | Calha DIN |
| Disjuntor Schneider Easy9 EZ9 3P (`breaker3p`) | `protecao/schneider-ez9-3p.glb` | Calha DIN |
| Emergência Metaltex P20ACR | `comando/metaltex-p20acr-r-1b.glb` | Frente do painel |
| Botoeira NHD NPB22-D11 | `comando/nhd-npb22-d11.glb` | Frente do painel |
| Relé Allen-Bradley MSR127TP | `reles/allen-bradley-msr127tp.glb` | Calha DIN |
| CLP LS XBM-DN32S | `controladores/ls-xbm-dn32s.glb` | Calha DIN |
| Siemens TS Adapter IE Basic | `controladores/siemens-ts-adapter-ie-basic.glb` | Calha DIN |
| Phoenix Contact PTI 6 | `bornes-e-barras/phoenix-pti6-3213972.glb` | Calha DIN |
| Borne PE genérico | `bornes-e-barras/terminal-pe.glb` | Calha DIN |
| Motor SEW-EURODRIVE DRN80MK4/B3 | `motores/DRN80MK4-B3.glb` | Máquina / montagem com pés B3 |
| Sinaleiro LED AD22-22DS | `sinalizacao/ad22-22ds-24v.glb` | Frente do painel · furação 22 mm |
| Multímetro digital RGK DM-20 | `aparelhos-de-medir/rgk-dm20-multimetro.glb` | Aparelho portátil / bancada |

O sinaleiro AD22-22DS mede aproximadamente 29,3 × 29,3 × 51,5 mm no CAD recebido. O eixo já aponta
para +Z e a face fica frontal sem correção de origem. A lente vermelha está isolada no material
`FF0000FF`, permitindo que cada instância altere cor e emissão sem modificar o GLB original.

O motor DRN80MK4/B3 usa o GLB CADENAS/3Dfindit recebido sem alterar o ficheiro de origem. O export
já tem Y para cima e o eixo em +X; o código apenas normaliza escala e posição. A ficha integrada
confirma 0,55 kW, 1435 rpm, 400 V / 1,29 A, cos φ 0,75, 3,65 Nm e massa de 11 kg.

Os GLB recebidos com nomes de conversor/espaços foram renomeados para URLs estáveis. O borne PE não
inclui metadados suficientes para afirmar fabricante/referência e, por isso, continua identificado
como componente genérico.

`fontes/fonte-proauto-dran120-24a.glb` é a fonte com terminais de parafuso:
usada no Painel 3D, Esquema e miniatura. A URL pública é
`/models/fontes/fonte-proauto-dran120-24a.glb`. Os seus pontos de ligação
no Esquema são definidos em `src/schematic/proautoTerminalGeometry.ts`.

**Adicionar um ficheiro à pasta não o ativa automaticamente.** Para usar um
novo modelo num componente, associe a sua URL em `src/three/modelPaths.ts`
e configure o respetivo carregamento/renderização no Painel 3D e, se
pretendido, no Esquema ou na Biblioteca. O modelo procedural existente
continua a servir de reserva. A pasta `public/` é servida na raiz: não inclua
`public` na URL usada no código.

As pastas vazias contêm apenas `.gitkeep`, para que existam no Git; substitua
esse marcador por modelos reais quando estiverem disponíveis.

## Calha DIN perfurada 15 × 5,5 mm

`bornes-e-barras/din-rail-15x5-5-perfurada-1m.glb` — calha galvanizada perfurada
de 1 m (perfil 15 × 5,5 mm, furos oblongos 4,2 × 15 mm, passo 25 mm). O ficheiro é
gerado por `npx tsx scripts/build-din-rail-glb.ts` a partir de
`src/three/dinRailGeometry.ts`, o mesmo gerador que o Painel 3D usa para
desenhar a calha com o **comprimento editável** (Inspetor → Comprimento da
calha, 25–3000 mm). Os furos são regenerados ao mudar o comprimento, nunca esticados.

## Disjuntor Steck SD C25 1P

`protecao/steck-sd-c25-1p.glb` foi gerado a partir do STEP do fabricante
(17,8 × 79,6 × 72,6 mm). Já vem de pé (topo em +Y, frente em +Z), por isso o
`modelPaths.ts` não lhe aplica rotação nem espelho. O manípulo (plástico
vermelho e serigrafia «O-OFF») foi separado em malhas `dcsimu_handle_*`, que o
simulador move por inteiro; o CAD original está na posição desligada, pelo que
OFF = pose do modelo e ON levanta o manípulo. Os bornes 1 (topo) e 2 (base)
foram medidos nas caixas de ligação do próprio GLB.

## Disjuntores Schneider Easy9 (EZ9) 1P / 2P / 3P

`protecao/schneider-ez9-{1,2,3}p.glb` são gerados dos STEP do fabricante (EZ3331, EZ3332 e «1P3 EASY9»)
por `scripts/build-ez9-glb.py` (`pip install cadquery trimesh numpy`):

```
python3 scripts/build-ez9-glb.py <pasta-com-EZ9-1-EZ9-2-EZ9-3> public/models/protecao
```

Substituem os modelos antigos dos tipos `breaker1p`, `breaker2p` e `breaker3p` (o 3P não tinha CAD).
Os STEP não trazem cores: o script atribui plástico branco ao corpo, preto à alavanca, cinzento ao patim
e aço aos parafusos.

- **Dimensões:** 84,5 mm de altura, passo de 17,7 mm por polo (17,7 · 36 · 54 mm de largura) e
  74,6–75,4 mm de profundidade com a alavanca em OFF. Já vêm de pé (topo +Y, frente +Z, traseira em z = 0),
  sem rotação nem espelho no `modelPaths.ts`.
- **Normalização:** o patim da calha do STEP do 1P vem 1,9 mm para fora e é recolhido (−2,5 mm), para os
  três assentarem igual; a alavanca do 1P vem na horizontal e é rodada 35,8° para a pose OFF dos 2P/3P.
- **Manípulo:** alavanca(s) e barra de ligação (2P/3P) em malhas `dcsimu_handle_*`. O cubo da alavanca está
  a y = 32,5 mm e z = 61,5 mm; `BREAKER_HANDLE_RIG` (`modelPaths.ts`) guarda a charneira e o curso (70°).
  OFF = pose do CAD; ON levanta a alavanca; disparado pára a meio.
- **Bornes:** nas entradas de cabo (topo 1/3/5, base 2/4/6), centrados em cada polo (x = 9,15 + 17,7·n mm
  nos 2P/3P; 8,85 mm no 1P) e a z ≈ 0,285 da profundidade. O fundo de 3 mm da entrada é uma estimativa.
