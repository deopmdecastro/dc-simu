# Modelos 3D reais dos componentes

Coloque aqui os ficheiros `.glb`/`.gltf` exportados a partir do CAD (SolidWorks,
etc.). O código em `src/three/Panel3D.tsx` já está preparado para carregar
estes ficheiros via `useGLTF`, com o desenho procedural (caixas) apenas como
reserva automática caso o ficheiro não exista ou falhe a carregar.

## Siemens LOGO! 12/24RC

- Caminho esperado: `public/models/logo-siemens-1224rc.glb`
- Como obter: no SolidWorks, `File > Save As` → escolher `.glb`/`.gltf`
  (ou exportar `.step`/`.obj` e converter para `.glb`, por exemplo com o
  Blender: `File > Import` do STEP/OBJ e depois `File > Export > glTF 2.0`).
- **Nota:** o ficheiro `Logo_Siemens.SLDPRT` fornecido não pôde ser usado —
  o cabeçalho binário não corresponde a um ficheiro SolidWorks válido
  (não é reconhecido como OLE/Compound File, que é o formato real do
  `.SLDPRT`). Terá de re-exportar/reenviar o modelo.
- Depois de colocar o `.glb` aqui, dê nomes às malhas do ecrã que contenham
  "screen"/"display" (case-insensitive) para que o código acenda/apague o
  ecrã automaticamente consoante a alimentação (`L+`).
- Pode ser necessário ajustar `LOGO_1224RC_SCALE`, `LOGO_1224RC_ROTATION` e
  `LOGO_1224RC_OFFSET` no topo de `Panel3D.tsx` conforme a escala/orientação
  do export.
