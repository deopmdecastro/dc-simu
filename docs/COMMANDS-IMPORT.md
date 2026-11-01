# Importar esquemas IEC (FluidSIM e CADe SIMU)

No editor **Esquema IEC**, use **Importar** (barra de ferramentas ou card vazio).

## FluidSIM 4 (`.ct`)

- Ficheiros de **circuito elétrico ou pneumático** do FluidSIM 4.
- O expansor CT é o mesmo do importador GRAFCET (leitura local no browser, sem código do fabricante).
- Símbolos conhecidos (pólos, contactos, bobinas, lâmpadas, motores, válvulas, cilindros, etc.) são mapeados para a biblioteca IEC do DC-Simu.
- Cabos são reconstruídos a partir das ligações `EConnection` / `HConnection` (aproximação por proximidade dos bornes).
- **GRAFCET** em `.ct` continua a importar-se no editor GRAFCET → Importar.

## CADe SIMU (`.cad`)

O formato não é público. Os ficheiros do CADe SIMU 3.x são texto ISO-8859-1 que começa por
`CADe_SIMU*0*3005#…`; o DC-Simu lê-os por completo (`src/commands/cadeSimuText.ts`): símbolos, bornes,
cabos e textos. A estrutura foi estudada em esquemas de arranque direto, inversão e temporização.

**Registos.** `*<k>*<código>#<segmento>*<23 números>`, por ordem (`k` = 0, 1, 2…), até ao rodapé `$$$…`
(tamanho da folha, data, nome do ficheiro).

- Segmento: `ref##borne1#borne2#…` nos símbolos (ex.: `-KM1##13#14#`); vazio nos cabos e pontos.
- Números: `[0–7]` bornes presentes (1/0) · `[8,9]` posição do 1.º borne ou início do cabo ·
  `[10,11]` fim do cabo · `[12–15]` caixa do símbolo (dx, dy, w, h; o borne de baixo fica a `h − 3`) ·
  `[17]` rotação em passos de 90° · `[21,22]` redes do CADe (não usadas).
- Textos (código `8`): o texto vem depois dos números (`…*0#TEXTO*<k+1>*…`).
- Unidades: 6 por polo (40 px no DC-Simu).

**Códigos mapeados.**

| CADe | DC-Simu | | CADe | DC-Simu |
|---|---|---|---|---|
| 3005 alimentação L1 L2 L3 PE | `supply` | | 7000 contacto NA | `contactNO` |
| 6009 disjuntor 3P | `breaker3` | | 7001 contacto NF | `contactNC` |
| 6008 disjuntor 2P | `breaker2` | | 7008 contacto temporizado 67-68 | `timedNO` / `timedOffNO` |
| 2008, 2001 contactos principais | `contact3` | | 8000 botão NA · 8001 botão NF | `pushNO` · `pushNC` |
| 6007 relé térmico (potência) | `thermal3` | | 8017 contacto térmico 95-96 | `thermalNC` |
| 1000 motor 3~ (U1 V1 W1 PE) | `motor3` + `ground` | | 9000 bobina · 9005 temporizador | `coil` · `timerCoil` / `timerOffCoil` |
| 4000 / 4018 cabo de força / comando | cabo | | 4010 condutor PE | cabo verde-amarelo |
| 4001 ponto de junção | junção em T | | 8 texto | texto livre |

- O temporizador 9005 traz `A1#A2#<tipo>#<segundos>`; o tipo 3 é o atraso à desoperação (TOF).
- As referências perdem o `-` inicial do CADe (`-KM1` → `KM1`); contactos e bobinas ligam-se pelo nome.
- Ligações: pontas de cabos que coincidem; uma ponta a meio de outro cabo só com o ponto de junção 4001.
  Cada rede é refeita no DC-Simu como cadeia de cabos entre os bornes.
- Ficam de fora, listados no resumo: os botões do painel de simulação do CADe (8023; no DC-Simu clica-se
  no próprio símbolo), retângulos (2) e códigos ainda não mapeados.

Ficheiros `.cad` noutro formato (binário) caem na extração de **referências** (K1, S1, F1, …), dispostas
numa grelha para completar cabos e tipos. Para esses, há também o **JSON intermédio**:

```json
{
  "format": "dc-simu-cade-import",
  "name": "Meu esquema",
  "parts": [
    { "id": "p1", "kind": "coil", "x": 100, "y": 200, "tag": "K1" },
    { "id": "p2", "kind": "pushNO", "x": 100, "y": 80, "tag": "S2" }
  ],
  "wires": [
    { "a": { "part": "p2", "term": 1 }, "b": { "part": "p1", "term": 0 } }
  ]
}
```

`kind` usa os `CmdKind` do DC-Simu (`coil`, `contactNO`, `motor3`, …).

## Avisos

- A importação **substitui** o esquema atual (pode desfazer com Ctrl+Z).
- Tipos de símbolo FluidSIM ou CADe SIMU sem mapeamento são listados como ignorados.
- Reveja sempre o esquema antes de simular.
