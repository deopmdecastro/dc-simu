# Proposta de Acabamento, Som e Cabo Editável do Compressor (dc-simu)

## 1. Acabamento do Compressor (Baseado no Datasheet Maxxim 24L)
- **Estado Atual:**
  - Componente `AirCompressor3D` em `src/three/PneumaticsDevices3D.tsx` já possui geometria básica (`compressorGeometry.ts`) e materiais (azul, preto, latão, crómio).
  - Dimensões corrigidas para `520×420×280 mm` (conforme validação `Validation-2026-11-22-Compressor-VTUG-Fidelidade.md`).
- **Alteração Proposta (Acabamento Realista):**
  - **Peças Flutuantes:** Verificar as malhas do tanque (`tank`), carenagem (`shroud`), e tubos (`hose`, `copper`, `rib`, `inset`, `elbow`).
  - **Ajuste de Curvas (Cabo Editável):**
    - O cabo editável (fio de alimentação) deve ser adicionado como um componente separado ou parte da geometria do compressor.
    - Utilizar `createCompressorTube` com pontos dinâmicos que possam ser editados (curvas de Bézier ou Catmull-Rom).
    - Adicionar uma "ficha de alimentação" (plug/socket) no fim do cabo.
  - **Detalhes do Datasheet (Maxxim 24L Manual):**
    - **Tanque:** 24 L, 8 Bar (já implementado no código, mas verificar selo e logótipo).
    - **Carenagem:** Perfil SMC VM100 (já implementado com chanfro e grelhas).
    - **Peças Flutuantes:** Garantir que o `compressorShroudBulge` e as malhas `hose`, `copper`, `rib`, `inset`, `elbow` estão corretamente unidas ao tanque e carenagem (sem espaços vazios).
    - **Acabamento:** Adicionar textura de "fio trançado" mais realista e acabamento metálico nos racores.

## 2. Som / Ruído (Realismo)
- **Estado Atual:**
  - Não existe implementação de áudio no componente `AirCompressor3D`.
- **Alteração Proposta:**
  - **Integração de Áudio (Three.js `PositionalAudio`):**
    - Adicionar um `AudioListener` à cena.
    - Criar um `PositionalAudio` ligado ao grupo do compressor.
    - **Som de Trabalho:** Loop de compressor (motor + ar comprimido) quando `running === true`.
    - **Som de Ligação/Desligamento:** Clique ao alternar `onToggleRun`.
    - **Som de Pressão:** Som de libertação de ar quando a pressão desce (se aplicável).
  - **Implementação:**
    - Importar `THREE.AudioListener`, `THREE.PositionalAudio`, `THREE.AudioLoader`.
    - Adicionar `useEffect` para carregar e reproduzir o som baseado no estado `running`.
    - Ajustar o volume com base na pressão (`tankBar`).

## 3. Ficha de Alimentação e Cabo Editável
- **Estado Atual:**
  - O compressor tem uma tomada (`socket-compressor` / `XS-COMP`) e um cabo definido em `stampingBenchWiring.ts` (`mq-3g25-compressor`).
  - O cabo é estático (pontos fixos na esteira e descida).
- **Alteração Proposta:**
  - **Ficha de Alimentação:**
    - Adicionar um componente `socketFamatelSwitch` ou similar (já existe `socket-compressor`) mas com uma ficha ligável (plug) no fim do cabo.
    - Criar uma geometria de "Ficha" (`PneumaticsDevices3D` ou `ElectricalDevices3D`) que se liga ao socket.
  - **Cabo Editável:**
    - Substituir o `cableTrayStraight` estático por um componente `EditableCable3D` (já existe em `src/three/EditableCable3D.tsx`).
    - Permitir que o utilizador arraste os pontos de controlo (curvas) entre a tomada (`XS-COMP`) e o compressor (`airCompressor`).
    - **Implementação em `stampingBenchWiring.ts`:**
      - Alterar a função `feed` para criar um `EditableCable3D` em vez de apenas registar os pontos na esteira.
      - Adicionar a ficha de alimentação no fim do cabo (ponto `socket-compressor`).

## 4. Implementação (Passos)
1. **Acabamento (src/three/PneumaticsDevices3D.tsx):**
   - Refinar as malhas do compressor (remover flutuações, ajustar `compressorShroudBulge`).
   - Adicionar o cabo editável como um componente filho do grupo do compressor ou como um componente independente ligado à tomada.
2. **Som (src/three/PneumaticsDevices3D.tsx):**
   - Importar `AudioListener`, `PositionalAudio`, `AudioLoader`.
   - Adicionar lógica de som no `useFrame` ou `useEffect` baseado em `running`.
3. **Ficha de Alimentação e Cabo (src/electrical/stampingBenchWiring.ts & src/three/EditableCable3D.tsx):**
   - Criar o cabo editável com pontos de controlo (curvas).
   - Adicionar a ficha (plug) no fim do cabo.
4. **Documentação (BrainNet):**
   - Registar a tarefa no BrainNet.

---
**Próximos Passos:**
1. Ler o datasheet PDF (se possível, ou usar as informações da validação anterior).
2. Implementar as alterações no código `PneumaticsDevices3D.tsx` e `stampingBenchWiring.ts`.
3. Testar o som e o cabo editável no simulador.
4. Documentar as alterações no BrainNet.
