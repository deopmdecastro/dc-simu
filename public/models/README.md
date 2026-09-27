# Modelos 3D reais dos componentes

Coloque aqui os ficheiros `.glb`/`.gltf` exportados a partir do CAD (SolidWorks,
etc.). O código em `src/three/Panel3D.tsx` já está preparado para carregar
estes ficheiros via `useGLTF`, com o desenho procedural (caixas) apenas como
reserva automática caso o ficheiro não exista ou falhe a carregar.

## Siemens LOGO! 12/24RC

- Ficheiro: `public/models/logo-siemens-1224rc.glb` (já incluído no repositório).
- O código em `src/three/Panel3D.tsx` normaliza automaticamente o modelo ao
  carregar: aplica a rotação de eixo (o export do SolidWorks vem com Z para
  cima; o three.js usa Y para cima), escala-o para uma altura consistente
  com os restantes aparelhos de calha, e recentra-o (base assente no plano
  da calha DIN). Não é necessário ajustar nada manualmente ao substituir
  este ficheiro por uma versão mais recente do mesmo componente.
- O ecrã acende/apaga consoante a alimentação (`L+`): é identificado
  automaticamente pela cor do material original (verde puro), que no
  modelo fornecido é usada apenas nessa peça.
