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
| Emergência Metaltex P20ACR | `comando/metaltex-p20acr-r-1b.glb` | Frente do painel |
| Botoeira NHD NPB22-D11 | `comando/nhd-npb22-d11.glb` | Frente do painel |
| Relé Allen-Bradley MSR127TP | `reles/allen-bradley-msr127tp.glb` | Calha DIN |
| CLP LS XBM-DN32S | `controladores/ls-xbm-dn32s.glb` | Calha DIN |
| Siemens TS Adapter IE Basic | `controladores/siemens-ts-adapter-ie-basic.glb` | Calha DIN |
| Phoenix Contact PTI 6 | `bornes-e-barras/phoenix-pti6-3213972.glb` | Calha DIN |
| Borne PE genérico | `bornes-e-barras/terminal-pe.glb` | Calha DIN |
| Motor SEW-EURODRIVE DRN80MK4/B3 | `motores/DRN80MK4-B3.glb` | Máquina / montagem com pés B3 |

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
