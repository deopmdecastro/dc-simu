# Recuperação DC-Simu — 17 de novembro de 2026

**Regressões locais aprovadas; registo de preparação da release.** Esta nota
acompanha o commit da recuperação, mas não é uma confirmação de push, CI remoto
ou publicação de produção. O utilizador autorizou commit/push/publicação de
`deopmdecastro/dc-simu` e `deopmdecastro/BrainNet`. A confirmação final deve
identificar os dois commits e o `buildId` público exato, não apenas a autorização.

Os relatórios antigos são históricos e não aprovam a árvore atual. Baselines
recuperadas: aplicação `d474ab3e99383e1e8ede6cc75a2b8ae1277b3323` e BrainNet
`dac3a94e6e3964b56018a935ef4c51193f4b903e`. O resultado da operação de release
fica no registo BrainNet `Validation-2026-11-17-Recuperacao-Industrial-Editores.md`.

## Feito

### Aparelhos e interfaces físicas

- Integrados os sete industriais: Schneider ATV320, base Finder 90.23, relé
  Finder 55.34, Geya GRT8-M1 e GRT8-B1, Avel 411 e Metaltex TBY-301. GLB,
  fichas locais, dimensões, levantamento de ligações e SHA-256 encontram-se
  em `src/data/industrial-device-geometry.json` e nas fontes de cada ativo.
- D52-2066, KWS-306 e TC externo partilham a reconstrução entre simulador,
  Admin, catálogo, capas e exportação. O TC tem passagem primária vazada e
  secundário isolado: o primário não é uma ponte fase–neutro.
- iC60H, iIL mono/trifásico, iID 4P e iDPN N Vigi usam derivações STEP
  documentadas. O iIL 3P é de 18 mm e tem três canais independentes.
  Logótipos Schneider/Hager são vetores locais, não aproximações tipográficas.
- Corrigido o referencial físico no Admin: conversão uniforme metro → mm,
  sem esticar CAD à caixa dos patins/manípulos. Exportações procedurais declaram
  a unidade; pontos medidos de passagens abertas são preservados.
- MSR127 conserva o GLB original e ganha réguas/lentes/serigrafia reconstruídas,
  alimentação, arranque, recuperação e saídas comandadas pela cablagem.
- Calhas DIN têm profundidade individual, fixações e batentes. A sobretampa
  oferece sólido/contorno tracejado/oculta, sem face opaca no contorno;
  obturadores ocupam apenas as vagas sem aparelhos.

**Limite de realismo:** D52/KWS/TC são reconstruções procedurais, não CAD
oficial nem réplicas aceites pelo utilizador. Contactos Finder, complementos
MSR127/PLC e adaptações Schneider têm origem reconstruída explícita. Não se
alega certificação, PL/SIL, metrologia ou emulação de firmware do fabricante.

### Simulação, catálogo e editores

- Tipos `cat:…:v…`, IDs de bornes, controlos do autor e extremos dos cabos são
  conservados. A origem integrada explícita delega o comportamento sem mudar
  o tipo guardado da instância nem inventar controlos invisíveis.
- LCD e lâmpadas dependem do circuito real, com texturas independentes. RESET
  D52 exige cinco segundos; cancelamento não limpa energia. O KWS tem três
  páginas de apresentação, sem alegar reprodução integral do firmware.
- STOP apaga sinalização e arranque sem perder energia; RUN varre logo;
  STEP avança uma vez e permanece em PAUSA viva, sem temporizador concorrente.
- IEC/GRAFCET conservam geometria personalizada, rotas, barras, comentários,
  clipboard misto/de destino, undo/redo e deslocação por teclado. Gestos são
  cancelados por transporte real e desmontagem, incluindo arrasto IEC de
  grupos cujos textos são pré-visualizados ao vivo.
- Identidade nativa usa UUID exato, nunca nomes/prefixos. Sem resementeira
  automática de projetos pessoais ou cópia offline com identidade cloud.
  O QGD mantém 47 componentes e 76 cabos.

### Fecho dos três bloqueios encontrados no browser

1. **Publicação iDPN:** o GLB acabado ultrapassava o limite existente de
   6 000 000 caracteres base64. O acabamento/clonagem passou a preservar a
   partilha de materiais dentro de cada peça, mantendo peças/cache isolados.
   O diagnóstico real passou de **4 531 324 para 4 405 348 bytes**, de 27 para
   24 materiais e de 35 para 32 imagens exportadas. Não se aumentou o limite,
   não se baixou a resolução e não se contornou a publicação. Os oito tipos
   completaram depois a publicação real e os ensaios de catálogo recarregado.
2. **Botão T no Panel3D:** a fixture passa a terminar a animação de auto-fit
   antes de tomar conta da câmara, evitando mover o alvo entre projeção e
   pointerdown. O ensaio mantém rato real, disparo retido e mola premida.
3. **Gestos IEC e RUN do painel:** o editor de grupos passou a cancelar
   sincronicamente ao mudar o transporte de qualquer motor. As fixtures
   limpam seleções e enquadram antes de tomar coordenadas; verificam que o
   texto realmente se moveu antes do cancelamento. A suite ampliada confirma
   reposição exata e ausência de entradas falsas no histórico.

## Evidência executada na recuperação

Logs completos: `/home/user/work/industrial-devices-audit/`, no workspace de
execução. Não é um endereço público. Os scripts reprodutíveis estão no Git.
As contas, projetos e catálogos dos browsers são sintéticos e descartáveis.
[Resumo e logs desta execução](validation/recovery-2026-11-17/summary.json)
ficam também versionados; não confundir com o diretório histórico anterior.

| Verificação | Resultado confirmado | Âmbito/limite |
| --- | --- | --- |
| TypeScript + `test:ci`, sétima execução | **exit 0 / exit 0**, 102 comandos encadeados | Inclui hooks, geometria, persistência, política nativa, elétrica, exportação, compatibilidade e transporte; não é CI remoto |
| Medidores/Schneider no Admin e catálogo fresco | **110 PASS**, zero exceções | Oito tipos: guardar/reabrir/publicar/bake, refresh total, duas instâncias ligadas, tipos/IDs/endpoints e save/load; LCD publicado ligado versus segundo desligado |
| Sete industriais no Admin e catálogo fresco | **78 PASS**, zero exceções | Fichas PDF reais, controlos, publicação, refresh, cablagem independente e projeto guardado/recarregado |
| Medidores/Schneider no Panel3D | **41 PASS**, zero exceções | Rato físico, T/rocker/RESET, instâncias independentes e comparação dos SVG locais |
| Ciclo de vida IEC/GRAFCET, suite ampliada | **62 PASS**, zero exceções | RUN/STEP reais, gestos individuais/mistos, rollback, histórico, destino clipboard, rotas, save/load e teclado |
| `test:meters-schneider` | **53 PASS** | Referencial nominal, endpoints Admin, encaixes, exportação, elétrica e propriedade de recursos |
| `test:terminal-geometry` | **48 CAD, 303 cavidades + 39 contactos = 342 ligações** | Cinco tipos procedurais explicitamente excluídos não contam como PASS CAD |
| `test:terminal-seat` | **303 encaixes, 43 correções de boca, 80 colocações** | Tampa ATV realmente aberta, sem ignorar obstruções finitas |
| `test:industrial` | **95 PASS** | Ativos, dimensões, interfaces e comportamento elétrico |
| `test:builtin-sync` | **883 verificações**, 117 integrados/66 GLB | Inclui oito novas verificações de partilha/isolamento de materiais |
| `test:editor3d-functional` | **57 PASS** | Importação e atualização compatível; não é aprovação visual do fabricante |
| `test:browser-fixtures` | **10 PASS** | Prontidão síncrona; não substitui os percursos UI acima |
| Servidor E2E | **188 PASS / 0 FAIL** | SQLite/contas/permissões/reinício; não é Supabase/RLS |
| Dependências de produção | **0 vulnerabilidades** | `npm audit --omit=dev`, execução local |
| Capas | **18 tipos regenerados; 69 capas + 69 frontais presentes** | Captura falhada não é aprovada por existir uma imagem antiga |
| MSR127 / industriais no Panel3D | **12 / 38 PASS**, execuções anteriores conservadas | UI realmente montada; não reclassificadas como novas repetições |
| Sondas/cabos do motor | **68 PASS** + **30 bloqueios** | Quatro alimentadores M20 separados das sondas diretas; quatro poses físicas; PAUSA bloqueia edição |
| BrainNet `npm test` | **18 PASS, 27 SKIP** | Não são 45 testes executados |
| Fundação do checkout pessoal BrainNet | **2 links partidos** | Falha visível, sem alterar a cópia protegida |
| Fundação de exportação candidata independente | **exit 0; 386 Markdown, 950 links, 3 workflows** | Ensaio do filesystem candidato; não equivale a commit/push/publicação |

Execuções finais: `global-recovery-seventh-{typecheck,test-ci}.log`,
`meters-admin-recovery-tenth/`, `industrial-admin-recovery-final/`,
`meters-panel-recovery-final/` e `editor-lifecycle-recovery-framed-final/`.
A falha de enquadramento no ensaio intermédio de grupos permanece registada;
foi resolvida antes da execução final de 62 PASS, não apagada dos resultados.

O teste antigo de cabos foi repetido no HEAD de origem e reproduziu onze
falhas: exigia M20 para sondas apesar do contrato já implementado de ligação
direta. A revisão distingue sondas/alimentadores e controla corpo, haste e
caixa aberta em quatro poses. A fixture de desbloqueio foi corrigida para
usar STOP após STEP, conservando e testando o bloqueio em PAUSA. O comando
agregado e o CI global passaram depois; não ficaram testes desativados.

### Perfil 3D: não aprovado como desempenho de GPU

Cinco ciclos estabilizaram em 44 geometrias, 14 texturas e 3 programas.
O perfil de 15 aparelhos, 1440×900, DPR 1, Chrome/SwiftShader mediu
**1,922 FPS** (16 frames/8324,4 ms), CPU média 3,62 ms e p95 5,4 ms.
São recursos e submissão CPU num rasterizador de software, **não aprovação
de fluidez numa GPU física**. Não se anuncia desempenho bom a partir disso.

## Operação de release e pendências de aceitação

- Executar o build estático **sobre o novo commit**, conferir o carimbo e
  testar os assets minificados. O script `qgd-production-ui-smoke.mjs` deixou
  de pressupor que o alias nativo antigo existe. `--static-guard` testa a
  recusa correta de sessões locais fabricadas em `VERCEL=1`; não representa
  um teste autenticado do projeto cloud nem autoriza afrouxar o guard.
- Rever/stage/commit/push dos dois repositórios, com autenticação transitória;
  observar CI/deploy e conferir o novo hash + carimbo exatos em
  `https://dc-simu.vercel.app/version.json`. **Esta nota de preparação não
  certifica estes passos posteriores**; usar o registo final BrainNet.
- Aceitação visual do utilizador face às fotos, sobretudo D52/KWS/TC, e
  medição de desempenho em hardware/GPU reais continuam pendentes.
- Supabase/RLS/cloud, login de produção e colisões reais de rede não foram
  aprovados por fixtures locais com API externa/service workers bloqueados.

## Preservação do checkout pessoal BrainNet

`BrainNet/03-Projects/DC-Simu/dc-simu/` não foi editado, limpo, reposto ou
atualizado por checkout. Comparação com o arquivo correto:

- **1039 ficheiros regulares idênticos, zero diferenças**;
- HEAD pessoal `adf9fbf3f1505b11759fc63b8741d5b96ffef327`;
- 122 entradas; SHA-256 do estado porcelain
  `e6a8e6453b62c04058de6bddb883b3d210304e3293cd4e610855d75f1f64f751`;
- gitlink pessoal já preparado no índice: `10e555bf47a68d8ab7cb7a0a5d1966f2fa13e666`,
  distinto do HEAD pessoal e da release a publicar.

A release BrainNet é preparada numa **worktree independente**, sem fazer
`git add -A` no checkout pessoal nem preparar o seu HEAD aninhado. O gitlink
da release deve apontar apenas para o novo commit canónico da aplicação.

O arquivo é `work/qgd-release/brainnet-nested-source-before.tar.gz`;
`local-files-before.json` pertence a outro checkout e não é a baseline.
Os dois links ausentes são de `docs/AI-ASSISTANCE.md` para
`.github/copilot-instructions.md` e `.vscode/extensions.json` na cópia
protegida. A aplicação canónica versiona ambos: não se criam ficheiros na
cópia pessoal nem se enfraquece o verificador para esconder essas diferenças.

## Reprodução

```sh
npm ci
npm run typecheck
npm run test:ci
npm run test:server

# Vite em modo uitest; browsers em série num host de 2 GB:
npm run test:meters-schneider-ui
npm run test:meters-schneider-admin-ui
npm run test:industrial-admin-ui
npm run test:industrial-panel-ui
npm run test:msr127-panel-ui
npm run test:grafcet-lifecycle-ui
npm run test:panel3d-profile

# Build estático, não efetua deploy:
VERCEL=1 npm run build
# Servir o build com Vite preview e testar o guard, sem inventar autenticação:
npm run test:qgd-build-ui -- --static-guard
```

Detalhes: [interfaces físicas](TERMINAL-GEOMETRY.md) e
[medidores/Schneider](MEDIDORES-SCHNEIDER-3D.md). Credenciais não pertencem a
ficheiros, URLs, Git config, logs, notas ou commits. A sessão temporária deve
ser encerrada e o token revogado depois da publicação.
