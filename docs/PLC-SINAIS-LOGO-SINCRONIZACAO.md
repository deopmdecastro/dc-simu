# Simulador de sinais do PLC, LOGO! e sincronização editor ↔ simulador

Data: 2026-10-26 · Itens: PLC-SIGNALS-01, LOGO-LCD-01, LOGO-BORNES-01, BUILTIN-SYNC-01

## 1. Simulador de sinais do PLC (PLC-SIGNALS-01)

Além da tabela de entradas/saídas, cada PLC do esquema (LOGO!, LS XBM…) tem um
simulador de sinais sobre os bornes reais:

- **Onde:** propriedades do PLC selecionado («Simular sinais (entradas)») e
  separador **Entradas/Saídas** do Ladder (antes das tabelas de rede).
- **Entradas:** um botão por entrada física (I0.0…), com o seletor do tipo de
  contacto **INT** (interruptor, mantém), **NO** (pressão, 1 enquanto premido) e
  **NC** (repousa a 1, premido = 0). O estado mostra `1 · cabo` quando o borne
  também tem cabo.
- **Regra elétrica:** o sinal simulado soma-se (OU) ao que chega pelos cabos —
  equivale a um botão ligado entre L+ e o borne. As saídas Q só acendem com o PLC
  alimentado (L+/M); o painel avisa quando não está.
- **STOP:** o tipo de contacto pode ser escolhido em STOP; os botões só atuam com
  o simulador em RUN (como nas E/S virtuais).
- **Gravação:** `plc.state.simInputs` / `plc.state.simInputModes` vão com o
  projeto; premir não entra no histórico (desfazer não apaga sinais).
- **Store:** `setPlcSimInput`, `setPlcSimInputMode`, `clearPlcSimInputs`
  (`src/store/useSimStore.ts`); UI em `src/components/PlcSignalPanel.tsx`.

## 2. LCD do LOGO! (LOGO-LCD-01)

- A janela do LCD é calculada a partir da malha verde do GLB
  (`src/three/logoScreen.ts` · `logoScreenRect`), com valor de recurso medido
  (x −0,277…0,045, y 0,30…0,55, z 0,25 em unidades do painel).
- O ecrã (4 linhas × 12 caracteres: início, I/O, relógio, diagnóstico) fica dentro
  da janela; a moldura verde original passa a moldura escura. Os LED soltos foram
  retirados e as teclas ESC/OK/setas têm zonas de clique sobre o modelo.

## 3. Bornes do LOGO! invertidos (LOGO-BORNES-01)

- O integrado está correto (I0.x/L+/M em cima, Q0.x em baixo) — confirmado pelo
  varrimento. A inversão vem de rascunhos/versões antigas do catálogo do utilizador.
- `fixFlippedTerminals` (em `upgradeBuiltinDraft`) repõe os bornes cuja posição é
  exatamente o espelho em Y (ou Y+Z) da posição correta; bornes editados à mão não
  mudam; a correção é idempotente.
- `flippedRuntimeTerminals` deteta versões publicadas espelhadas → é preciso
  republicar (os projetos existentes recebem o aviso de atualização habitual).

## 4. Sincronização editor ↔ simulador (BUILTIN-SYNC-01)

Admin › Biblioteca 3D › **Sincronização** compara o editor com a biblioteca do
simulador 3D e mostra, por componente, o estado e a correção:

| Diferença | Significado | Correção |
|---|---|---|
| Só no editor | Rascunho nunca publicado | Publicar |
| Por publicar | Rascunho ≠ última versão (comparação independente da ordem das chaves) | Publicar |
| Bornes invertidos | Rascunho espelhado face ao integrado | Corrigir rascunho |
| Publicado invertido | Versão publicada espelhada | Corrigir e publicar |
| Integrado atualizado | Faltam botões/LCD/placa de bornes gerados pelo integrado | Corrigir rascunho |
| Bornes em falta | Etiquetas do integrado em falta (cabos dos projetos ficam soltos) | Editar no 3D |
| Arquivado / Bloqueado | Fora da biblioteca ou bloqueado nas definições | Repor / Desbloquear |
| Sem GLB no simulador | Integrado sem modelo CAD: aparece no editor, bloqueado no simulador | Editar no 3D e publicar |

- «Sincronizar tudo» pede confirmação, corrige os rascunhos e publica as versões
  necessárias (mesmo caminho do diálogo «Publicar»).
- Os cartões dos integrados sem GLB mostram «Bloqueado no simulador».
- Varrimento de código: os 68 integrados têm os mesmos bornes, posições (≤ 2 mm) e
  tamanho no editor e no simulador; 21 têm GLB e 47 não (ficam bloqueados até
  serem publicados a partir do editor).

## Testes

- `npm run test:builtin-sync` — 323 verificações (varrimento, inversão, auditoria, LCD).
- `npm run test:plc-signals` — 18 verificações (store, NC/NO, gravação, histórico).
- `npm run test:plc-signals-ui` — 16 verificações Playwright (Admin, propriedades, Ladder).
- Ambos os testes de node entram em `test:ci`.
