# Ladder: XOR, LIMIT, SCALE, JMP/LBL e depuração passo a passo

Estado: implementado e testado em 2026-10-26 (LADDER-SIM-02 e LADDER-SIM-03). Ainda falta a aprovação do utilizador.

## Blocos novos

| Elemento | Onde está na paleta | Comportamento |
| --- | --- | --- |
| **XOR** | Contatos | Contacto com dois operandos (A = `address`, B = `xorAddress`). Conduz quando exatamente um dos dois bits está a 1. Em série com outros contactos faz E com o RLO à esquerda. Aceita bits I/Q/M/T/C e variáveis BOOL de DB. |
| **LIMIT** | Operações | Com RLO = 1, faz `OUT = MIN(MAX(IN, MN), MX)`, como no TIA Portal. Com MN > MX não limita e o ENO fica a 0. |
| **SCALE** | Operações | Faz NORM_X + SCALE_X numa só caixa: `OUT = OUT_MIN + (IN − IN_MIN)·(OUT_MAX − OUT_MIN)/(IN_MAX − IN_MIN)`, com IN limitado à gama de entrada. Aceita gamas invertidas. Em destinos Int, o resultado é arredondado. O diálogo tem atalhos para 0…27648 (gama analógica S7), 0…32767 e 0…100 %. |
| **JMP / JMPN** | Controlo do programa | Desenhado como uma bobina de salto, com a etiqueta de destino por cima. O JMP salta com RLO = 1 e o JMPN com RLO = 0. |
| **LBL** | Controlo do programa | Etiqueta no canto superior esquerdo da network, também mostrada como chip «LBL x» no cabeçalho. É o destino dos saltos. |

Regras dos saltos:
- Só são permitidos saltos para a frente.
- As networks entre o salto e a etiqueta não são executadas nesse ciclo: as saídas mantêm o último valor e os temporizadores ficam parados. No ecrã, essas networks aparecem esbatidas e com o chip «saltada».

A verificação (lint) trata como erro:
- uma etiqueta inexistente;
- um salto para trás;
- uma etiqueta duplicada (sem distinguir maiúsculas de minúsculas);
- um nome inválido (letras, dígitos ou `_`, a começar por letra, até 16 caracteres);
- LIMIT com MN > MX constantes;
- SCALE com IN_MIN = IN_MAX;
- XOR sem o segundo operando.

Um XOR de um bit consigo próprio gera um aviso.

## Depuração (separador «Depuração»)

- **Pontos de paragem**: o botão ● no cabeçalho da network (ou F9 na network ativa) põe ou tira um ponto de paragem. Há três condições:
  - «ao ligar (RLO 0→1)», a predefinida;
  - «enquanto conduz (RLO = 1)»;
  - «em cada ciclo».

  Os pontos de paragem são avaliados no fim do scan, por isso o ciclo corre sempre inteiro, como num PLC, e as saídas nunca ficam a meio. Quando um dispara, a simulação passa a pausa, a network fica destacada a vermelho com o chip «parou aqui» e o evento «Ponto de paragem: Network N passou a conduzir (ciclo C)» fica registado. Depois de STOP, o primeiro ciclo parte de RLO = 0 em todas as networks. A opção «Parar nos pontos de paragem» desliga a paragem sem apagar os pontos.
- **Passo (1 ciclo)** (ou F10): se a simulação estiver em RUN, põe-na em pausa; depois executa exatamente um ciclo de scan.
- **Rasto do último ciclo**: mostra, pela ordem de execução, para cada network:
  - o RLO;
  - se foi saltada e para onde saltou;
  - os valores que escreveu logo a seguir à sua execução (por exemplo `Q0.0=1 · MW2=100`).

  Os botões «◀ Network» e «Network ▶» percorrem o rasto, network a network, e destacam a network em foco a roxo.
- Os pontos de paragem só existem durante a sessão de depuração, como o forçar: não entram no programa, no projeto guardado nem no desfazer.

Limite conhecido: o passo a passo percorre o rasto de um ciclo já executado. Não executa uma network de cada vez a meio do scan. Esta opção é intencional, porque o ciclo elétrico, o GRAFCET e os vários PLCs correm no mesmo tick e uma paragem a meio do scan deixaria a imagem de processo incoerente.

## Ficheiros

- `src/ladder/ladderEngine.ts`: XOR, LIMIT, SCALE, saltos e rasto do scan (`ScanOptions.trace`, `ScanResult.skipped`).
- `src/ladder/ladderMath.ts`: `computeLimit`, `computeScale`, `execLimit`, `execScale` e `writeNumeric`.
- `src/ladder/ladderDebug.ts`: `findBreakpointHit` e a mensagem do ponto de paragem.
- `src/ladder/LadderDebugPanel.tsx`: o separador «Depuração».
- `src/ladder/NetworkDiagram.tsx`, `LadderElementDialog.tsx`, `LadderEditor.tsx` e `ladderDnd.ts`: desenho, diálogos, paleta, cabeçalho e atalhos F9/F10.
- `src/ladder/ladderLint.ts`: as verificações acima e `LABEL_RE`.
- `src/store/useSimStore.ts`: pontos de paragem, pausa automática e passo.

## Verificação

```bash
npm run test:ladder-blocks      # 57 verificações (motor, lint, paleta, rasto, pontos de paragem)
npm run test:ladder-blocks-ui   # 25 verificações no navegador (requer servidor de desenvolvimento)
npm run test:ci                 # inclui test:ladder-blocks
```
