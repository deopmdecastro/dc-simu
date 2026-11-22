# WAGO 221 + Sensor XUKT + Base BALLUFF — evidências

Fidelização dos conectores WAGO 221 (referências fotográficas do utilizador: 221-413, 221-415 e inline), reutilização do GLB real `photoSensorXukt1ksml2` na esteira de rolos e novo componente de base de sensores BALLUFF (referência fotográfica do suporte).

Gerado por `scripts/wago-sensor-fidelity-ui-smoke.mjs` (regressão visual).

| Captura | Conteúdo |
|---|---|
| `wago221-412-iso.png` | 221-412 (2 vias) ISO |
| `wago221-413-iso.png` | **221-413 (3 vias, novo tipo)** ISO |
| `wago221-415-iso.png` | 221-415 (5 vias) ISO |
| `wago221-415-lateral.png` | alavancas-tecla com impressão "WAGO 221" |
| `wago221-415-fundos.png` | funis de entrada na face inferior (1 por condutor) |
| `wago221-2411-iso.png` | 221-2411 comparador (entradas nas extremidades) |
| `wago221-duplo-iso.png` | composto duplo espelhado |
| `base-balluff-iso.png` | base BALLUFF (mordente, poste, braço, olhal, gravura) |
| `esteira-sensor-balluff.png` | esteira FERPLAST com base BALLUFF na longarina + sensor XUKT no olhal |

`results.json` — resumo da corrida (malhas renderizadas, erros de runtime).

**Testes**: `npm run test:ci:fast` 19/21 (2 pré-existentes Mico46) · `npm run test:cover-version` ok · `npx tsc -b` limpo.
