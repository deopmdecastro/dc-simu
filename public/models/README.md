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

## Modelo já disponível

`controladores/logo-siemens-1224rc.glb` é o modelo Siemens LOGO! 12/24RC.
É usado no Painel 3D, na imagem frontal do Esquema e na miniatura da
Biblioteca. A URL pública correspondente é
`/models/controladores/logo-siemens-1224rc.glb`; os três usos partilham o
caminho definido em `src/three/modelPaths.ts`.

O modelo é ajustado à orientação e escala da cena pelo código. O ecrã é
identificado pelo material verde e reage à alimentação no borne L+.

**Adicionar um ficheiro à pasta não o ativa automaticamente.** Para usar um
novo modelo num componente, associe a sua URL em `src/three/modelPaths.ts`
e configure o respetivo carregamento/renderização no Painel 3D e, se
pretendido, no Esquema ou na Biblioteca. O modelo procedural existente
continua a servir de reserva. A pasta `public/` é servida na raiz: não inclua
`public` na URL usada no código.

As pastas vazias contêm apenas `.gitkeep`, para que existam no Git; substitua
esse marcador por modelos reais quando estiverem disponíveis.
