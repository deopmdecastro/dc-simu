# Ecrã de carregamento

Atualização visual implementada e testada localmente em 29 de outubro de 2026.

O carregamento das rotas usa `src/ui/RouteLoading.tsx`: marca DC-SIMU, pequeno
circuito decorativo com sinal azul indeterminado, rótulo contextual e uma frase
curta em português europeu. O cartão tem maior presença, texto mais legível e
adaptação ao telemóvel. Os estilos estão limitados a `.dx-route-loading*` em
`src/styles/dx.css`.

O componente foi extraído de `src/account.tsx`; os mesmos fallbacks e os sete
rótulos existentes continuam a ser usados. Não se acrescentaram atrasos,
percentagens, fases de progresso, dependências ou recursos externos. O logótipo
é o componente existente `Brand`.

O estado mantém `role="status"`, `aria-live="polite"` e `aria-busy="true"`.
O circuito é decorativo e está oculto das tecnologias de apoio. Com
`prefers-reduced-motion: reduce`, as animações contínuas ficam desativadas.

Validação:

- `npm test`: núcleo do simulador passou.
- `npm run typecheck` e `npm run build`: passaram; mantém-se o aviso de chunks grandes.
- Chrome local: sete rótulos, 1920×1000, 768×1024, 390×844, 320×568 e 844×390;
  sem transbordo horizontal, erros JavaScript ou pedidos externos.
- Fallback sob cabeçalho, sem rolagem vertical a 390×844; movimento reduzido
  sem animações contínuas.
- Revisão visual independente: PASS, sem correções obrigatórias. O avaliador
  usou um modelo OpenAI; não estava disponível um fornecedor diferente.
- BrainNet: 45 testes e verificação documental passaram.

Evidências locais no BrainNet: `runtime/loading-{core-test,build,ui}.log` e
`runtime/loading-ui/loading-{1920,390,reduced-motion}.png`.
As capturas usam o componente real numa pré-visualização isolada, sem contas
ou projetos reais. Publicação em produção e reconstrução do Docker não
fazem parte desta alteração.
