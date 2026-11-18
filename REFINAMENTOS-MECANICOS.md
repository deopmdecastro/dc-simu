# Refinamentos mecânicos — revisão local

**Estado:** implementação validada localmente e publicação expressamente autorizada pelo utilizador nos repositórios `deopmdecastro/dc-simu` e `deopmdecastro/BrainNet`. O comprovativo dos SHAs remotos e do deploy integra a documentação de release no BrainNet.

Base preservada: `7990560a8873e58561042a7025888a09286bc8a9` (LCD aceite). O build local de revisão usou um identificador distinto e não substituiu o build aceite.

Os JSON de validação anexos são o registo imutável do checkpoint local anterior à autorização. Os seus campos `PAUSED`, `committedMechanicalChanges: false` e equivalentes descrevem esse momento histórico, não o estado permanente de publicação.

## Os seis ajustes

| # | Ajuste | Implementação |
|---|---|---|
| 01 | CWBC65 · frente e movimento | Frente física corrigida sem deformar o CAD; carcaça cinzenta e resistências expostas preservadas. Só as duas peças reais da carruagem avançam 2,8 mm para dentro. Alimentação por fios e retorno em STOP confirmados no nativo, no Admin e no catálogo. Os terminais antigos são migrados apenas quando ainda correspondem à geometria de fábrica; IDs, fios e edições manuais são preservados. |
| 02 | GEYA · parafusos reais | GRT8-M1 e GRT8-B1 com seis parafusos metálicos por aparelho. Cruz rebaixada na própria geometria, com 0,52 mm de profundidade — não uma cruz pintada. Bornes de alimentação e contactos mantidos; o acabamento sobrevive a guardar, reabrir e publicar localmente. |
| 03 | D52 · ferragem sem perder o LCD | Parafusos dos bornes 1 e 2 com cruz geométrica rebaixada. Passagem transversal de corrente de 15 mm continua aberta; a variante com CT interno não recebe um terceiro borne nem CT externo inventado. LCD, cores, precisão, alimentação, STOP e energia acumulada preservados. A captura mostra o LCD apagado em STOP; a regressão dedicada confirmou-o também alimentado. |
| 04 | Proteção acrílica · opcional | Proteção transparente nas seis fontes/conjuntos de bornes: monofásico, trifásico e 24 V. Escolha «Com acrílico / Sem acrílico» no inspetor; peça opcional real no Admin, inicialmente desligada. O valor escolhido no Admin define o início da versão publicada. Guardar/reabrir conserva a escolha. Não duplica a proteção e não recria uma peça que o autor eliminou. |
| 05 | AVEL 411 · frente legível | Frente reconstruída a 1408 × 3200 píxeis, sem esticar as proporções do aparelho. Inscrições de poço, depósito, indicadores e alimentação legíveis ao aproximar. Paridade de píxeis visíveis confirmada entre o Admin e a publicação local, respeitando a orientação UV da textura. |
| 06 | Pente e conector · entrada correta | O conector entra de cima para baixo na zona frontal da boca de cabo escolhida, não no acesso da chave de fendas. Pente e conector ocupam planos separados, ajustados aos seis CADs medidos. Não foi aplicada uma profundidade universal a todos os modelos. Alimentação real → fio → IN/PINO → borne do disjuntor → saída confirmada. A fase selecionada, os encaixes e todos os IDs sobrevivem à reabertura. |

## Validação final

- TypeScript: 0 erros (`typecheck-final.log`).
- `test:ci`: 104 comandos, exit 0; inclui 76 asserções de LCD e 169 mecânicas.
- `test:mechanical-ui`: 43 verificações, sem exceções React/WebGL.
- `test:mechanical-catalog-ui`: 68 verificações, guardar/reabrir/publicar realmente pelo Admin; 11 versões na IndexedDB isolada.
- `test:device-lcd-ui`: 86 verificações nativo/Admin/publicado, alimentação por fios, STOP, textos do autor e roundtrip; sem exceções.
- CWBC65 assado no navegador: 19,562,544 → 4,484,520 bytes; base64 5,979,360 < 6 000 000. Todos os 447 bufferViews descodificados iguais byte a byte, 95 PNGs com SHA-256 igual e metadados de malhas/materiais/nós preservados. Meshopt sem quantização, simplificação, reordenação ou conversão de imagens. O limite de publicação não foi aumentado.
- Auditoria: 66 modelos/520 bornes inventariados. A heurística legada `nearSurface` sinaliza os mesmos 15 tipos da base aceite, sem avisos novos; o ensaio inicial dessa heurística global termina em 1 e foi conservado em `audit-final.log`. Não foi enfraquecida. As cavidades/lanes dos seis CADs são ensaiadas separadamente na regressão geométrica.
- Proteção do checkout pessoal: 1039 ficheiros e 0 diferenças; HEAD/estado/gitlink preservados.
- Build estático local: exit 0; `mechanical-local-446ee38bb1c5d4c1.r213.mwmlqehr`. 10 verificações do guard de sessão e 6 recursos servidos com SHA-256 igual; não prova fluxo autenticado Supabase/RLS.

## Preservação

IDs de componentes/terminais/fios, rotas, cores e bitolas permanecem nos projetos antigos. Migrações reconhecem apenas padrões de fábrica; posições fixadas/movidas, normais, faces, nomes e transformações do autor mantêm prioridade. A rotação do CWBC65 é uma correção única já aplicada; não se deve rodar novamente o asset.

As seis proteções acrílicas são peças reais opcionais no Admin. A marca de seed impede ressuscitar uma peça eliminada; publicações antigas sem essa marca recebem apenas o overlay de compatibilidade. A remoção de instâncias não destrói a geometria partilhada nem os materiais de outra instância.

O sincronizador de relés térmicos trata apenas relés térmicos e já não apaga `mountedOn` do pente/conector ao acrescentar uma fonte ou reabrir o projeto.

## Limites explícitos

- Encaixe visual no CAD não é certificação de compatibilidade elétrica de acessórios.
- O `breaker4p` genérico não tem CAD. O bloqueio de inserção existente é mantido e os testes legados cobrem montagem/identidades/continuidade/isolamento, não uma cavidade inexistente no seu modelo simplificado.
- Os testes de publicação usam IndexedDB local descartável, com pedidos externos bloqueados. Nenhuma conta, projeto cloud, política RLS ou remoto foi alterado.
- A publicação depende de autorização explícita; o utilizador autorizou agora o commit, push e publicação nos dois repositórios. Isso não alarga o âmbito a alterações em contas, projetos cloud, RLS ou dados pessoais.

## Evidências

[Resultados e imagens](docs/validation/mechanical-refinements/) · [fonte SHA-256](docs/validation/mechanical-refinements/source-sha256.json) · [exportação sem perda](docs/validation/mechanical-refinements/lossless-export.json) · [auditoria comparativa](docs/validation/mechanical-refinements/audit-comparison.json).

O diretório de auditoria completo desta sessão é `/home/user/work/mechanical-refinement-audit/`; inclui logs de desenvolvimento, falhas corrigidas e os logs finais, sem apagar o histórico.
