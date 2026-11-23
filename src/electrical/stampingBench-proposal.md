# Proposta de Reposicionamento dos Componentes da Maquete (dc-simu)

## 1. Peça do Motor (mecDcGearmotor)
- **Estado Atual:** Posicionado no eixo do braço (`A.x`, `A.z`) com deslocamento para a esquerda e ajuste de `+ 6` mm.
- **Alteração Proposta:**
  - O motor não é tão grande e deve ser virado pelo lado das estampagens (eixo `+Z` ou `+X` dependendo da orientação).
  - Ajustar `x`, `y`, `z` para que a face do motor fique voltada para a estação de estampagem (lado `+X` ou `+Z` conforme a imagem).
  - Reduzir a dimensão `x` (comprimento) se necessário, mantendo a altura `y` e profundidade `z` relativas ao braço.
  - Orientação: `{ x: 0, y: 90, z: 0 }` (virado para o lado das estampagens).
  - Coordenadas estimadas: `x: A.x - MEC_DIMS.gearmotor.wheelDiameterMm / 2 - mechatronicsSizeMm('mecDcGearmotor')!.x / 2 + 12` (ajuste para lado das estampagens), `y: top + h('mecDcGearmotor') / 2`, `z: A.z + 15` (ajuste para o lado).

## 2. Rampas (mecDischargeRamp)
- **Estado Atual:**
  - Ângulos: `[270, 300, 240]` (direita: BRANCA, PRETA, METALICA).
  - Comprimentos: `[170, 180, 140]`.
  - Pilares: `[110, 95, 80]`.
  - Posicionamento: `x: drop.x + size.x / 2 - 22`, `z: drop.z`.
- **Alteração Proposta:**
  - **Alinhar as rampas** (ajustar `x` e `z` para que fiquem coladas ou com um espaçamento uniforme).
  - **Espaçamento uniforme:** Definir um valor fixo (ex: `20 mm` ou `30 mm` entre rampas).
  - Ajustar `BENCH_RAMP_ANGLES` para `[270, 285, 300]` ou similar conforme a imagem (se houver mudança de ângulo).
  - Ajustar `BENCH_RAMP_LENGTHS_MM` para um valor uniforme ou ajustado (ex: `[150, 150, 150]`).
  - Coordenadas:
    - Rampa 1 (METALICA): `x: drop1.x + ...`, `z: drop1.z`
    - Rampa 2 (PRETA): `x: drop2.x + ...`, `z: drop2.z` (com espaçamento uniforme)
    - Rampa 3 (BRANCA): `x: drop3.x + ...`, `z: drop3.z` (com espaçamento uniforme)

## 3. Fim de Cursos (FC 1 e FC 2)
- **Estado Atual:**
  - **FC 1 (Alimentador/Gaveta Magazine):**
    - `x: pickup.x`, `y: top + magRiser.heightMm + 8 + FC_ABOVE_SEAT_MM`, `z: pickup.z + FC_FROM_POCKET_MM`
    - Orientação: `{ x: 0, y: -90, z: 0 }`
    - Estado: `actuation: 'feeder'`, `labelText: 'FC 1'`
  - **FC 2 (Gaveta Estampagem):**
    - `x: load.x`, `y: top + tableTop + FC_ABOVE_SEAT_MM`, `z: load.z + FC_FROM_POCKET_MM`
    - Orientação: `{ x: 0, y: -90, z: 0 }`
    - Estado: `actuation: 'drawer'`, `labelText: 'FC 2'`, `slideAxis: [0, 0, 1]`, `slideMm: 0`
- **Alteração Proposta:**
  - **FC 1 (Detetar peças na gaveta alimentada pela magazine):**
    - Ajustar posição `z` para que o rolete toque no tarugo (conforme imagem).
    - Manter `actuation: 'feeder'`.
    - Coordenadas: `x: pickup.x + 5` (ajuste lateral), `y: top + magRiser.heightMm + 8 + FC_ABOVE_SEAT_MM`, `z: pickup.z + FC_FROM_POCKET_MM - 10` (ajuste para frente/trás).
  - **FC 2 (Detetar peça na gaveta de estampagem):**
    - Ajustar posição `z` e `x` para detetar a peça na gaveta de estampagem.
    - Manter `actuation: 'drawer'`.
    - Coordenadas: `x: load.x - 5` (ajuste lateral), `y: top + tableTop + FC_ABOVE_SEAT_MM`, `z: load.z + FC_FROM_POCKET_MM + 10` (ajuste para frente/trás).

## 4. Cilindros (CILINDRO 1 e CILINDRO 3)
- **Estado Atual:**
  - **CILINDRO 1 (Alimentador):**
    - `x: feederX`, `y: top + magRiser.heightMm + feederSize.y / 2`, `z: pickup.z`
    - Estado: `labelText: 'CILINDRO 1'`, `sensorRecLabel: 'B8'`, `sensorAvaLabel: 'B9'`
  - **CILINDRO 3 (Gaveta Estampagem):**
    - `x: drawerCylX`, `y: tableY - 4`, `z: load.z`
    - Orientação: `{ x: 0, y: -90, z: 0 }`
    - Estado: `labelText: 'CILINDRO 3'`, `sensorRecLabel: 'B2'`, `sensorAvaLabel: 'B1'`
- **Alteração Proposta:**
  - **CILINDRO 1:** Manter posição, mas garantir que o sensor de recolha (`B8`) e disponibilidade (`B9`) estão alinhados com o FC 1.
  - **CILINDRO 3 (Gaveta Estampagem):**
    - **Virado no mesmo lado do cilindro alimentador (CILINDRO 1):**
      - Ajustar orientação para `{ x: 0, y: 90, z: 0 }` (se o alimentador estiver em `y: -90` ou vice-versa).
      - Coordenadas: `x: drawerCylX - 10` (ajuste lateral para alinhar com o alimentador), `y: tableY - 4`, `z: load.z + 5` (ajuste de profundidade).
      - Garantir que o cilindro puxa a gaveta no mesmo sentido que o alimentador empurra (eixo `X`).

## Notas Adicionais
- **Imagens:** As imagens fornecidas (IMG_5944.jpeg, IMG_5943.jpeg, etc.) devem ser analisadas para confirmar as distâncias exatas e ângulos.
- **Implementação:** As alterações devem ser feitas em `src/electrical/stampingBench.ts` na função `stampingBenchLayout`.
- **Commit:** Após as alterações, fazer commit e push no repositório `dc-simu`.

---
**Próximos Passos:**
1. Ler as imagens (se possível, ou pedir ao utilizador para confirmar as medidas exatas).
2. Aplicar as alterações no código `stampingBench.ts`.
3. Testar a visualização no simulador.
4. Documentar as alterações no BrainNet.
