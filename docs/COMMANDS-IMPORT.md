# Importar esquemas IEC (FluidSIM e CADe SIMU)

No editor **Esquema IEC**, use **Importar** (barra de ferramentas ou card vazio).

## FluidSIM 4 (`.ct`)

- Ficheiros de **circuito elétrico ou pneumático** do FluidSIM 4.
- O expansor CT é o mesmo do importador GRAFCET (leitura local no browser, sem código do fabricante).
- Símbolos conhecidos (pólos, contactos, bobinas, lâmpadas, motores, válvulas, cilindros, etc.) são mapeados para a biblioteca IEC do DC-Simu.
- Cabos são reconstruídos a partir das ligações `EConnection` / `HConnection` (aproximação por proximidade dos bornes).
- **GRAFCET** em `.ct` continua a importar-se no editor GRAFCET → Importar.

## CADe SIMU (`.cad`)

- O formato `.cad` é proprietário e pouco documentado.
- O DC-Simu tenta extrair **referências** (K1, S1, F1, …) e coloca-as numa grelha para completar cabos e tipos.
- Para importação estruturada, use o **JSON intermédio**:

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
- Tipos de símbolo FluidSIM sem mapeamento são listados como ignorados.
- Reveja sempre o esquema antes de simular.
