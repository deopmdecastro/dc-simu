# Editor 3D de componentes (Admin) — arquitetura

## Visão geral
O Admin cria **componentes oficiais** num editor 3D (separador *Administração → Biblioteca 3D*).
Cada publicação gera uma **versão imutável**. Os utilizadores veem o componente na biblioteca
(grupo «Catálogo oficial»), colocam-no nos projetos e recebem um **aviso de atualização** quando
há versão nova. A versão publicada pelo administrador prevalece: as instâncias oficiais passam sozinhas para a versão nova (mantendo posição, estado e cabos). Só as cópias independentes («Duplicar como independente») ficam fixas.

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

## Biblioteca de bornes e perfis de ligação

Os perfis são **sugestões**: depois de aplicados, cada borne continua editável (rótulo, nome, função, face, posição, tipo, polaridade, sentido, contacto, cor), pode ser duplicado, movido ou apagado.

- **Onde**: botão «📚 Biblioteca de bornes» na barra da vista e no separador *Bornes*; os utilizadores consultam-na (só leitura) em *Biblioteca → «Biblioteca de bornes e perfis de ligação»*.
- **Perfis incluídos** (`src/catalog/terminalProfiles.ts`): alimentação (monofásico, trifásico, 3P+N, CC), disjuntores 1P/2P/3P/3P+N/4P (1·3·5 entrada, 2·4·6 saída), botões NA/NF/NA+NF, seletor 2/3 posições, sinalizador, relés (11/12/14…), contactor (1L1…6T3, A1/A2, auxiliares), PLC (preset e configurável: DI/DO/AI/AO), sensores 3/4 fios e analógico, motor (3 e 6 terminais), variador, RS485, CAN, terra PE/FE, borneira.
- **Bornes soltos**: NO, NC, COM, L, N, PE, GND, +24V, 0V… — clique e depois clique na superfície, ou arraste para o viewport.
- **Aplicar**: «+ Adicionar …» (ou arrastar o cartão do perfil para o viewport). Opção «Substituir os bornes atuais». O perfil coloca os bornes nas faces certas (topo/base/frente…), com etiquetas únicas.
- **Sugestões por categoria**: separador *Bornes → Perfis sugeridos* e passo 5 do assistente «Novo componente 3D».
- **Perfis personalizados**: «+ Novo perfil», «Guardar bornes atuais como perfil» ou «Duplicar como perfil personalizado». Guardam-se no servidor (`/api/admin/terminal-profiles`) ou no navegador (modo local) e ficam visíveis a todos.
- **Bornes por vista**: barra inferior com Frente/Trás/Esq./Dir./Topo/Base (contagem por face). Escolher uma face move a câmara e fixa a normal dos novos bornes; «+ Adicionar» liga a colocação.
- **Cabos de teste** (ferramenta *Cabo* [3], mesmo desenho do Painel 3D do simulador): clique num borne (ou numa superfície) para começar, clique para largar pontos de curva nas superfícies ou no espaço, termine noutro borne; duplo clique ou Enter deixa a ponta livre. Backspace desfaz o último ponto, Esc cancela, Shift trava o eixo, Alt desliga o snap. O painel mostra pontos, comprimento (mm) e o veredicto por cabo, com opção de curvas suaves.
- **Auto-guardar e atualizações**: o rascunho é guardado automaticamente 5 s depois da última alteração. Quando há uma nova versão da aplicação, o editor pergunta («Atualizar agora» / «Mais tarde», com opção de atualizar sempre sozinho); o rascunho é guardado antes de recarregar.
- **Compatibilidade** (`src/catalog/terminalCompat.ts`, regras em `COMPAT_RULES`, extensíveis): em *Simular*, ligue dois bornes com o cabo de teste; aparece «⚠ Ligações incompatíveis» (erro) ou aviso. A aba *Compatibilidade* da biblioteca testa pares de perfis.
- **Vista**: grelha de pontos como no simulador, cubo de vista (arrastar orbita, clicar numa face enquadra-a), chão com escala opcional.

### Instrumentos de medida (multímetros)

Categoria **Instrumentos** na biblioteca de bornes (também disponível para utilizadores): multímetro básico (COM · VΩ · mA · 10A, com termopar K opcional), multímetro de 3 entradas, alicate amperimétrico, multímetro de bancada a 4 fios (HI/LO/SENSE), ponteiras de teste e osciloscópio (1–4 canais + massa). Há ainda chips soltos «Medição (multímetro)».

- Todas as portas ficam no grupo funcional **Medição** (`MEASURE_GROUP`, tomada banana/BNC, sem polaridade nem contacto).
- Regra de compatibilidade (`terminalCompat.ts`): uma porta de medição liga a **qualquer** borne sem erros (mede, não conduz); duas portas de medição ligadas entre si dão aviso. O grupo viaja em `CompatTerminal.group` e é passado também pelo editor 3D (`evaluateWire`).
- Os perfis continuam a ser sugestões: tudo é editável (mover, renomear, apagar, guardar como perfil novo). Existe o tipo de componente «Instrumento de medida» no assistente.

## Cabos de teste no editor 3D (igual ao simulador)

- **Ferramenta Cabo [3]**: clique num borne (ou na superfície) para começar, cliques intermédios criam pontos, termina noutro borne (duplo clique deixa a ponta livre). O painel «Novo cabo» define cor (automática pela função, norma IEC 60204-1, ou manual), secção, condutor e terminal por omissão.
- **Separador «Cabos»** (inspetor): nome e função, **cor** (paleta do simulador), **secção** (0,5 – 16 mm², com Ø exterior), flexível/rígido, **terminal de cada ponta** (ponteira, ponteira dupla, olhal, forquilha, pino, faston, estanhado, nu; copiar A→B), origem/destino, inverter sentido, pontos de passagem (+ Ponto, limpar), enquadrar e remover. Alterações aparecem de imediato no viewport (`WireEnd3D`/dimensões físicas do simulador) e são desfazíveis.
- No viewport: clique seleciona o cabo; duplo clique acrescenta um ponto; arrastar move-o; duplo clique no ponto remove-o. `Del` remove o cabo selecionado.
- O comprimento total (pontas incluídas) e o veredicto de compatibilidade são recalculados a partir dos bornes atuais.

## Barra de ferramentas e visibilidade

- Barra por grupos: histórico · ferramentas **Selecionar 1 / Borne 2 / Cabo 3 / Apagar 4 / Mover vista 5 / Medir 6** · manipulador (Mover W / Rodar E / Escala R, eixos **Local/Global X**) · **Formas ▾** (caixa, cilindro, esfera, cone, anel, grupo, GLB) · duplicar/agrupar/eliminar · pousar no chão/centrar · enquadrar (F) / enquadrar seleção (Shift+F) · biblioteca de bornes e **olho geral** dos bornes (H).
- **Medir**: dois cliques (superfície ou borne, com snap) mostram distância e Δx/Δy/Δz; Esc cancela; «Limpar medições» na barra.
- **Olhos nos bornes**: na hierarquia (por borne, por grupo e geral) e no inspetor («No viewport»). Só afeta a edição; o borne continua no componente.
- Separadores do painel direito passam a quebrar linha (sem scroll horizontal).

## Componentes integrados na Biblioteca 3D (Admin)

A lista «Biblioteca 3D» mostra **todos** os componentes da plataforma: primeiro os do catálogo (criados no editor 3D) e, no fim, os **integrados** (`TEMPLATES` do simulador, 66 tipos), com miniatura 3D carregada só quando o cartão fica visível. Filtro «Integrados» e pesquisa incluídos.

«Editar no 3D» cria **uma vez** uma cópia independente em rascunho (`builtinComponents.ts`): o GLB original (referenciado por URL, sem encher o armazenamento do navegador), com a rotação base e escala pela altura física do Painel 3D, assente em Y = 0; os bornes passam para a caixa envolvente (topo/base/frente conforme a posição no esquema); sem CAD, usa-se um volume com as dimensões físicas. A cópia fica marcada em `properties` (`Origem = Integrado · <tipo>`), o cartão integrado desaparece e a cópia aparece no catálogo com a etiqueta «Integrado». O componente integrado do simulador nunca é alterado.

### Importar GLB

O carregador de GLB (`src/three/gltfLoader.ts`) suporta modelos comprimidos com **Meshopt** (glTF-Transform, gltpack) e **Draco**, e geometria quantizada. Ao importar: se a peça de exemplo «Corpo» continua intacta, é substituída pelo modelo; este fica no chão (Y = 0), com a maior dimensão a 100 mm (ajuste em Escala) e a câmara enquadra-o. Se o ficheiro não puder ser lido, aparece uma mensagem de erro em vez de uma peça vazia.

## Câmara do editor e lista de bornes
- O enquadramento (Enquadrar, ISO, faces, «Enquadrar seleção») usa a esfera envolvente real do modelo e o campo de visão, por isso componentes pequenos (bornes) e grandes (quadros) ficam igualmente centrados. Os limites de zoom e os planos near/far da câmara adaptam-se ao tamanho do modelo.
- Ao abrir um componente, a câmara reenquadra sozinha quando o GLB acaba de carregar, até o utilizador mexer na câmara.
- A lista «Bornes» à esquerda separa-os **Por vista** (Frente, Trás, Esquerda, Direita, Topo, Base; o botão de cada vista leva a câmara a essa face) ou **Por grupo** funcional.
