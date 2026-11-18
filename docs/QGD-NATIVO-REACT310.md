# QGD nativo e estabilidade do inspetor

## Projeto disponível

O dashboard inclui **Quadro Geral de Distribuição Completo Multi-Circuitos (QGD)**,
ID estável `native-quadro-distribuicao-v1`, para a conta Admin e para as restantes
contas, incluindo Free. A conta Admin é proprietária da semente; o utilizador
normal recebe acesso de edição sem consumir uma vaga de projeto próprio.

A semente revista tem **47 componentes e 76 condutores**: corte geral 4P,
DPS 3P+N, medidor KWS-306, sinalizador trifásico Acti9, repartidor em escada,
diferenciais, RCBO, dois pentes, iluminação, duas tomadas gerais independentes,
tomada especial, tomada CEE, disjuntor-motor e motor. O armário tem cinco
entradas inferiores para bucins.

É um exemplo de simulação didático, não um projeto de execução nem uma
certificação de conformidade de uma instalação real.

### Correções da semente

- Bornes dos barramentos regenerados depois de aplicar o modo/número de polos
  específico da semente, em vez de conservar o modo 1P do catálogo.
- Pentes com entradas e saídas efetivamente cabladas. No A9XPC712 deste setor
  monofásico usam-se apenas L1/N; L2/L3 ficam isoladas e os dentes sem uso cobertos.
- Neutros explicitamente classificados e separados a jusante dos diferenciais.
- DPS em derivação, com L1/L2/L3/N/PE distintos e sem pontes internas permanentes.
- Diferencial monofásico efetivamente Hager CFC225P; proteção magnetotérmica
  dedicada ao motor e segundo circuito de tomadas com a sua própria saída.
- Diagnóstico de fábrica sem erros/avisos; testes negativos confirmam que abrir
  cada proteção corta o circuito correspondente sem cortar os restantes.

### Abrir, guardar e repor

Pesquisar «QGD» no dashboard e abrir o cartão do projeto. Nas contas não-admin,
as alterações são rascunhos isolados por utilizador; não modificam a semente
Admin. Guardar e recarregar recupera as alterações. Repor elimina o rascunho e
volta à semente. Revisões antigas são recusadas para evitar sobrescritas entre
separadores. A abertura/gravação continua disponível com a quota Free cheia.

## React #310 ao adicionar elementos

O erro era reproduzível ao inserir e selecionar um componente:

1. `Sidebar` chamava uma subscrição Zustand (`useSimStore`) dentro do JSX
   condicional do inspetor. A seleção acrescentava hooks ao render seguinte.
2. `BusbarControls` devolvia os inspetores de pente/conector antes de executar
   `useState`/`useEffect`, mudando o número de hooks ao trocar de família.

As subscrições/hooks passam a executar sempre, pela mesma ordem, antes de
qualquer retorno condicional. O auxiliar de inserção do GRAFCET foi renomeado
para `insertPaletteItem`: não é um hook e é chamado por eventos.

Há também uma correção do despacho 3D: uma peça procedural Acti9 pode montar
em DIN sem ter um GLB. Só se entra em `CadComponentReal3D` quando existe uma
especificação de modelo; as peças procedurais seguem para o seu renderizador,
evitando o acesso a `spec.path` inexistente durante a geração de capas.

A perda de contexto WebGL reportada depois do erro React não foi tratada como
prova de um defeito independente da GPU. Os testes verificam primeiro que a
aplicação deixa de lançar exceções nos fluxos reproduzidos.

## Permissões e ícones preservados

Supabase/n8n e detalhes técnicos da sessão continuam reservados a administradores.
As ações normais de conta mantêm-se. Os pictogramas da interface e do cartão do
plano usam SVG; os símbolos técnicos e a notação elétrica não são removidos.

## Regressões

Com Node compatível com `package.json` e dependências instaladas:

```sh
npm run typecheck
npm run test:hooks
npm test
npm run test:qgd
npm run test:ci
# Num segundo terminal, manter npm run dev em execução:
npm run test:inspector-hooks-ui
npm run test:qgd-ui
npm run test:account-icons-ui
```

`test:hooks` percorre todo o código `src` e é bloqueante em `test:ci`.
Os testes de navegador usam contextos descartáveis, API/integrações externas e
service workers bloqueados. Não alteram contas reais.

`test:qgd`: 42 verificações de topologia, proteções, registo, quotas e persistência.
`test:inspector-hooks-ui`: 39 verificações com o mesmo root React, incluindo
inserção real da biblioteca, seleção vazia/simples/múltipla, bornes, cabos,
eliminar/desfazer e alternância de famílias de barramentos.
`test:qgd-ui`: 19 verificações de dashboard, abertura, seleção, duplicação,
gravação e reabertura, nas contas User e Admin.

Publicação deve ser confirmada por commit remoto, estado do deployment e
`version.json` da aplicação, não apenas pelo resultado de `git push`.

### Estado da suite global

A validação desta entrega distingue os testes específicos acima da suite global.
A execução sequencial dos restantes comandos de `test:ci` encontrou sete suites
com falhas também reproduzidas numa cópia isolada de `origin/main` (`a9356e9`),
com as mesmas dependências/GLBs: `editors-sweep`, `terminal-geometry`,
`terminal-seat`, `builtin-sync`, `native-wires-3d`, `grafcet-live-dock` e
`native-iec`. Não foram omitidas nem convertidas em testes opcionais. O CI global
não deve ser apresentado como inteiramente verde.

A primeira interrupção, na visibilidade da proteção interior do armário, foi
corrigida dando-lhe uma face independente (`innerCover`), com restauração e
raycast cobertos pelo teste existente. As sete pendências restantes pertencem à
validação geral do catálogo/rotas/migrações e não foram confundidas com a
correção de hooks ou a disponibilização do QGD.
