# Anotações na barra e comentários de projeto

Implementado e testado localmente em 29 de outubro de 2026.

## Interface

**Comentário** e **Texto** pertencem à barra de ferramentas do Esquema/3D e
do GRAFCET. Em ecrãs estreitos ficam na secção **Anotações** do menu
**Ferramentas**, na mesma barra. O botão Texto assinala o modo de colocação;
**Esc** cancela. O grupo flutuante de criação foi removido do desenho.

O GRAFCET usa o mesmo cartão de comentário com título, conversa, cor e resolução
do 3D. A nota acompanha as coordenadas do diagrama, pode ser arrastada e pertence
à folha ativa. Notas e conversas persistem no ficheiro do projeto; os textos
livres do GRAFCET continuam em `grafcet.comments`.

## Correção Supabase

O erro de relação entre `project_comments` e `author_id` vinha do pedido
`profiles:author_id(name)`: a migração referencia `auth.users`, sem uma chave
estrangeira direta para `profiles`. As consultas de leitura, criação e atualização
de comentários passaram a obter as linhas sem esse join. Os nomes são lidos numa
consulta separada a `profiles`, apenas com `id` e `name`, respeitando a RLS.

Um perfil não visível apresenta «Utilizador». Falhar a leitura do nome depois
de guardar não faz falhar o envio já concluído, evitando induzir duplicações.
Os erros de acesso ao comentário continuam a ser propagados. A atualização
também filtra explicitamente por projeto. Esta correção não exige uma migração.

Referência consultada: [Supabase — acesso a dados de utilizadores](https://supabase.com/docs/guides/auth/managing-user-data).

## Validação

- `npm test` e `npm run test:saas` (58 verificações).
- `npm run test:supabase-comments`: cliente PostgREST real contra REST sintético;
  listar/criar/resolver, nomes ocultos, falha na leitura de nomes e acesso negado.
  Incluído em `test:ci`.
- `npm run test:canvas-annotations`: persistência e compatibilidade, incluindo
  a folha e a conversa da nota GRAFCET.
- `npm run test:annotation-toolbar-ui`: Chrome, 2D/3D/GRAFCET, texto e notas
  funcionais, arrasto e guardar/reabrir; 1920/1280/768/390 px, sem transbordo
  horizontal nem erros JavaScript.
- `npm run test:toolbar-ui`: regressão das barras, atalhos e simulação.
- `npm run typecheck` e `npm run build`: passaram; mantém-se o aviso de chunks grandes.
- BrainNet: 45 testes e `npm run check` passaram.

Logs locais no BrainNet: `runtime/annotations-comments-*.log`;
capturas em `runtime/annotations-comments-ui/`.

O projeto DC-Simu não está disponível na ligação Supabase desta sessão.
As consultas foram verificadas localmente com dados sintéticos; a validação
na base de dados remota e a publicação em produção não foram efetuadas.
