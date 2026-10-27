# Administração — resumo responsivo (2026-10-27)

Nota técnica do incremento sobre o ecrã **Resumo** da administração (`/admin`),
a partir das capturas de telemóvel do responsável. Contexto, decisão e
evidência ficam no cofre (`BrainNet`), em
`03-Projects/DC-Simu/Validation-2026-10-27-Admin-Resumo-Responsivo.md`.

## Problemas nas capturas

| # | Problema | Efeito |
| --- | --- | --- |
| 1 | «Modo local» e os dois botões do cabeçalho partilhavam a linha; os botões empilhavam na metade direita | metade do ecrã vazia, botões estreitos |
| 2 | «Sem pendências»: o ponto verde ficava sozinho numa linha por cima da frase | banner partido, ar amador |
| 3 | Indicadores sem ícone no código (só rótulo/número) e com tons trocados (aprovadas roxo, rejeitadas verde) | leitura lenta; cor contra o significado |
| 4 | Acesso rápido com descrição cortada a meio da palavra («quadros qu…») e seta esquerda rodada por CSS | texto ilegível |
| 5 | Atividade recente: «Admin · admin@…» e outra vez «admin@…», com a data numa pílula na linha seguinte (≈110 px por evento) | repetição e altura desperdiçada |
| 6 | Últimas contribuições / Cobertura com duas ações para o mesmo destino («Ver fila» + «Abrir contribuições», sublinhadas) e estados vazios em texto solto | ruído e indecisão |

## O que mudou

- **`AdminPanel.tsx`** — o Resumo passa a componentes próprios reutilizáveis:
  `OverviewTile` (indicador com ícone, valor, detalhe e seta; o cartão inteiro
  é o botão, com `aria-label` completo), `OverviewCard` (cabeçalho com título,
  subtítulo e **uma única ação** em botão-pílula) e `OverviewEmpty`.
  `activityMeta()` constrói a linha de contexto **sem repetir identificações**
  e dá prioridade ao alvo («Admin · Teste») sobre repetir o e-mail.
  A atividade usa o ícone da categoria do evento e a gravidade
  (`severityOf`) para o tom do ícone. Navegação lateral/tablet e seletor de
  secção passam a usar o mapa de ícones que já existia para a folha mobile.
- **`admin-refine.css`** — indicadores 3 colunas → 2 no telemóvel; acesso
  rápido 4 → 2×2 → 1 (≤360 px), descrição em até duas linhas sem corte a meio
  da palavra; atividade/listas com ícone + título/meta + data/estado à
  direita, também no telemóvel; cabeçalho ≤720 px em grelha (estado em linha
  própria, botões lado a lado a 44 px); separadores do tablet compactos para
  continuarem em duas linhas já com ícone. Só tokens `--dx-*`; sem barra
  lateral de destaque (guarda `test:style`).
- **`src/ui/icons.tsx`** — novos ícones no ficheiro único do sistema:
  `IconCheckCircle`, `IconXCircle`, `IconPending`, `IconUsers`, `IconStorage`,
  `IconInbox`, `IconHistory`, `IconPdf`.
- **`scripts/admin-ui-smoke.mjs`** — +15 verificações do Resumo (58 no total).

## Verificação

Chromium headless (Playwright) a 390, 768, 1024 e 1440 px, `localStorage`
descartável, `/api/*` bloqueado, conta `dcsimu-admin`; atividade revista
também com registos semeados iguais aos das capturas.

| Comando | Resultado |
| --- | --- |
| `npx tsc -b` | sem erros |
| `npm run test:admin-ui` | **58 verificações** |
| `npm run test:admin-saas-ui` | 22 verificações |
| `npm run test:saas` | 58 verificações |
| `npm run test:style` | `no-accent-border: ok` |
| `npm test` | «TODOS OS TESTES PASSARAM» (inclui a correção de deriva dos limites de cabos, ver abaixo) |
| `vite build` | não executado neste ambiente (2 GB; ENV-01 pede 3 GiB — o build de produção é feito pela Vercel a partir do `main`) |

## Correção de deriva incluída (teste, não produto)

`npm test` falhava já no `main` publicado em duas verificações de cabos: a
escala intencional de `wireMetrics.ts` passou a 1,6–8,5 px (ponteiras até
≈1,55) e `scripts/smoke.ts` manteve os limites antigos (≤6,2 px; ≤1,5). Os
limites do teste foram alinhados com a escala documentada; sem alteração de
comportamento do produto.
