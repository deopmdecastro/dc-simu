# Editor 3D de componentes (Admin) — arquitetura

## Visão geral
O Admin cria **componentes oficiais** num editor 3D (separador *Administração → Biblioteca 3D*).
Cada publicação gera uma **versão imutável**. Os utilizadores veem o componente na biblioteca
(grupo «Catálogo oficial»), colocam-no nos projetos e recebem um **aviso de atualização** quando
há versão nova. Atualizar é sempre uma decisão do utilizador.

## Modelo de dados (`src/catalog/types.ts`)
- `ComponentDefinition` — peças (primitivas/GLB, hierarquia), materiais (+texturas), bornes,
  zonas luminosas, estados (diferenças da pose base), interações e montagem.
- `CatalogEntry` — id, metadados, rascunho, versões publicadas, arquivado.
- `CatalogVersion` — definição publicada (sem assets) + `runtime` (dimensões, origem e bornes
  normalizados) + nota e lista de alterações. O GLB «assado» fica à parte.
- Instância no projeto: `type = cat:<id>:v<n>` e `component.catalog = { id, version, source, ignoredVersion?, copiedFrom? }`.
- Bornes: `Terminal.defId` (identidade estável entre versões), `catalogRules`, `position3D`.

## Backends (mesma API nos dois)
`GET /catalog`, `GET /catalog/:id/glb/:v` · admin: `GET /admin/catalog`, `GET|PUT|DELETE /admin/catalog/:id`,
`POST /admin/catalog/:id/publish`, `POST /admin/catalog/:id/archive`.
- Servidor: `server/catalog.mjs` (SQLite `catalog_components`/`catalog_versions`, GLB em `DATA_DIR/catalog/<id>-<v>.glb`).
- Navegador: `src/auth/localCatalog.ts` (localStorage) para o deploy estático.
- Componentes publicados nunca se eliminam (só arquivam): as versões em uso têm de continuar a abrir.

## Fluxo Admin
1. *Novo componente* → editor (Objetos · Materiais · Bornes · Luzes · Estados · Interações · Componente).
2. Edição com gizmos (mover/rodar/escalar, snap), hierarquia, undo/redo, pré-visualização e modo **Simular** separado.
3. *Guardar rascunho* (Ctrl+S) → *Publicar…*: validação, lista de alterações, nota, GLB assado + `runtime`.
4. *Duplicar* cria um componente novo e independente; *Arquivar* retira da biblioteca sem afetar projetos.

## Fluxo Utilizador
- Biblioteca mostra só a última versão (versões antigas ficam registadas mas escondidas).
- Inspetor → «Catálogo oficial»: versão instalada, **Ver alterações / Atualizar / Ignorar**, estado, **Duplicar como independente**.
- *Atualizar* (`src/catalog/update.ts`): troca o tipo para a nova versão, remapeia bornes por `defId`
  (mantém ids → cabos ligados), mantém posição/estado/escala, repõe a vista só nos bornes que o admin moveu,
  mantém bornes removidos que ainda têm cabos (órfãos) e é anulável com Ctrl+Z.
- Cópia independente: `source: 'copy'`, fixa na versão, nunca recebe avisos.

## Execução
`CatalogComponent3D` (painel 3D) carrega o GLB, anima estados (`StateAnimator`), acende zonas luminosas
(emissivo) e executa as interações (`interactions.ts`); estado da instância em `state.catalogState`.
Fase 1 não simula eletricidade interna (ligações internas entre bornes ficam para a fase 2).

## Criar um componente (assistente)

Botão **+ Novo componente 3D** no cabeçalho da Administração, no Resumo e na Biblioteca 3D. O assistente
(`src/admin/editor3d/NewComponentDialog.tsx`) pergunta: 1) o que é (tipo: pré-preenche categoria, prefixo TAG e montagem,
`componentKinds.ts`), 2) categoria, 3) nome, 4) se já tem datasheet (PDF até 4 MB e/ou link). Cria o rascunho e abre o editor.
O estado fica em `meta.kind` / `meta.datasheet`; o PDF vai em `draft.assets.datasheet` (só no rascunho do admin, não nas
versões publicadas). No editor, o separador **Componente → Datasheet** permite anexar, abrir ou remover mais tarde.
