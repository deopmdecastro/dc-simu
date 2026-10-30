# Importar GRAFCET do FluidSIM 4

Na barra do editor GRAFCET, **Importar** abre o seletor de ficheiros para `.ct` do FluidSIM 4 e os formatos `.json` e `.grafcet` do DC-Simu; também pode arrastar o ficheiro para a zona indicada. Reveja a contagem e os avisos antes de substituir o diagrama. A importação pode ser desfeita. O ficheiro é lido localmente no navegador; não é enviado a serviços externos.

## Programa e desenho editável

Para CT do FluidSIM 4, o diálogo permite escolher:

- **Programa**: mantém a validação estrita e a separação dos gráficos em páginas.
- **Desenho editável**: mantém os gráficos lado a lado numa página e recupera
  todos os registos de texto como textos livres do GRAFCET, incluindo notas
  afastadas. Conserva os números originais, os nomes das ações, as posições e
  os tamanhos das etapas e ações. Ligações incompletas e destinos por referência
  inexistentes ficam por completar, acompanhados de avisos.

Os textos importados usam a mesma ferramenta **Texto** do editor: podem ser
arrastados, editados por duplo clique e formatados; desfazer e guardar/reabrir
preservam o conteúdo. Texto normal e negrito são distinguidos pelos estilos
nativos observados. No formato interno, estes textos vivem em `comments` e são
elementos `GrafcetComment`, sem conversão para ações ou condições.

O desenho entra com `importReview` persistente: a execução GRAFCET, a forçagem e
os dois geradores de Ladder ficam bloqueados durante a revisão. Abra a faixa
**Desenho importado para revisão** e use **Concluir revisão** depois de corrigir
os erros de validação e os números repetidos. É pedida confirmação da revisão
das referências e dos qualificadores das ações. A condição de rascunho mantém-se
ao exportar/importar JSON ou `.grafcet` e ao guardar/reabrir o projeto.

O modo desenho não aceita contentores corrompidos, portas inválidas ou tipos
geométricos desconhecidos. Qualificadores de ação sem correspondência confirmada
são apresentados para revisão e permanecem sem execução. O ficheiro TIFF é
uma referência visual; este importador recupera os elementos do CT e não faz OCR.

### Amostra ATEC — 2026-10-30

O CT acompanhado de TIFF fornecido pelo utilizador foi recuperado em modo desenho:
**34 etapas, 40 transições, 30 ações e 16 textos livres**. Os três gráficos
ficam lado a lado. Permanecem para revisão as transições sem origem, o destino
por referência `51` inexistente, duas etapas `135`, `G0 <> X5`, as referências
entre gráficos e qualificadores ainda não mapeados. Não foram inventadas etapas
nem corrigidos os números de origem.

Os originais e o `.grafcet` convertido são mantidos fora do código versionado.
O ficheiro convertido destina-se à versão atualizada que reconhece `importReview`;
a importação visual não demonstra equivalência da simulação.

```powershell
$env:FLUIDSIM_ATEC_SAMPLE = 'caminho/para/Grafcet ATEC.ct'
npm run test:fluidsim
```

O teste de interface `test:grafcet-construction-ui` aceita
`GRAFCET_FLUIDSIM_MODE=drawing` e `GRAFCET_EXPECT_TEXTS=16`, em conjunto com as
variáveis de amostra, contagens e URL documentadas abaixo.

## Âmbito implementado

- Etapas simples e iniciais, com números originais e posição relativa.
- Transições e condições booleanas, incluindo ligações por referência ao número da etapa.
- Condições normalizadas para a sintaxe do DC-Simu: `NOT` → `/`, `AND` → `*`, `OR` → `+`, com um espaço de cada lado de ` + ` e ` * ` (ver «Ficheiros mistos, orientação e normalização»).
- Ações contínuas e condicionadas, incluindo condições `1Hz`, `2Hz` e `NOT 1Hz`.
- Ligações explícitas e contactos coincidentes das portas nativas, incluindo derivações OR e cadeias de ações.
- Os identificadores `O<n>` antigos podem conter lacunas. O leitor resolve as ligações pela tabela ordenada de objetos usada pelos registos `gate` e `CON`.

Não se inferem ligações pela distância entre símbolos. Etapas encapsulantes, macroetapas e entradas/saídas de macroetapas são preservadas. Sincronizações AND nativas, ações memorizadas/de evento/de forçagem e submodelos ainda não interpretados são rejeitados com uma mensagem; o projeto atual fica preservado. Alguns qualificadores de ação ainda não têm correspondência confirmada e geram um aviso de revisão. A extensão `.ct` não implica compatibilidade com todas as versões ou variantes FluidSIM.

Os nomes simbólicos são preservados. Depois de importar, declare as variáveis na tabela do DC-Simu e associe-as às entradas/saídas necessárias. Não são inventados endereços de PLC.

Referências como `G2X125` e `G1X11` são preservadas e geram um aviso: o motor atual interpreta `X` no gráfico atual e não carrega automaticamente os outros GRAFCETs. Importar o desenho não comprova uma simulação equivalente de um sistema com esses gráficos externos. As condições e os diagnósticos devem ser revistos antes de simular.

## Leitor nativo

`src/grafcet/fluidSim4.ts` é uma implementação independente do formato observado. Não carrega nem executa o FluidSIM, bibliotecas DLL ou anexos. O produto não depende dos utilitários usados durante a análise.

O leitor encontra o marcador `COMPRESS` no cabeçalho legado, descodifica o bloco e valida o cabeçalho de compressão. No exemplo fornecido, este cabeçalho tem 14 bytes, dicionário de 2048 bytes, índice de 11 bits, limite de repetição curta de 16 bytes e máscara de codificação `0x9a`. A semente do dicionário é `PREVIEW`.

| Comando | Leitura |
| --- | --- |
| Bit alto a 1 | Bloco literal, comprimento nos sete bits restantes |
| Bit alto a 0 | Palavra big-endian: índice no dicionário nos bits inferiores; comprimento nos restantes, acrescido de 1 |
| Comprimento codificado 1 | Repetição de um byte; o índice indica a contagem |
| Comprimento codificado 2 no cabeçalho expandido | Comprimento efetivo no byte seguinte |

O dicionário reinicia a posição de escrita conforme as regras do formato; não é uma janela circular comum. Os registos semânticos são lidos depois de `END_FSPREVIEW` ou `ENDPREVIEW`, ignorando a pré-visualização WMF. O texto nativo usa Windows-1252. A normalização de `a+NOT b` para `a + /b` evita a ambiguidade com nomes pneumáticos terminados em `+` no analisador atual.

Limites: ficheiro de entrada até 5 MB, expansão até 32 MB e até 10 000 objetos nativos. Blocos truncados, configurações desconhecidas, portas inválidas e estruturas incompletas falham antes de alterar o projeto.

## Verificação

```powershell
npm run test:fluidsim
npm run test:grafcet-construction-ui
npm run typecheck
npm run build
```

Com `FLUIDSIM_MONTA_CARGA=caminho/para/Monta-Carga.ct`, o `test:fluidsim` verifica também o ficheiro real: relações, condições, ações, retorno e comentário.

O teste `test:fluidsim` usa registos sintéticos próprios, sem redistribuir circuitos ou bibliotecas do fabricante. Para exercitar o seletor real com um CT local e contagens diferentes das do exemplo de referência, configure:

```powershell
# Terminal 1
npm run dev -- --host 127.0.0.1 --port 5175

# Terminal 2
$env:GRAFCET_TEST_URL = 'http://127.0.0.1:5175'
$env:GRAFCET_FLUIDSIM_SAMPLE = 'caminho/para/exemplo.ct'
$env:GRAFCET_EXPECT_STEPS = '4'
$env:GRAFCET_EXPECT_TRANSITIONS = '4'
$env:GRAFCET_TEST_EXECUTABLE = 'C:\Program Files\Google\Chrome\Application\chrome.exe' # opcional
npm run test:grafcet-construction-ui
```

O exemplo anterior foi recuperado com **5 etapas, 7 transições e 7 ações**, incluindo o ramo cuja condição estava cortada na imagem TIFF. As sete relações entre etapas foram verificadas, assim como as condições e os avisos sobre referências externas.

Foi também validado um ficheiro CT de referência adicional (`Monta-Carga.ct`, 2026-10-26), mantido fora do repositório: **4 etapas, 4 transições e 2 ações**. As relações corretas são `1→5`, `5→10`, `10→15` e o retorno `15→1`, como no diagrama original. Uma nota anterior registava `5→1`, `10→5`, `15→10` e `1→15` como corretas; estava errada, porque o leitor ignorava o bit `FLIPPED` (ver abaixo) e invertia o fluxo. As condições importadas ficam `(SappelN1 + SenvoiN1) * SfdcPF`, `FdcN2`, `(SappelN1 + SenvoiN1) * SfdcPF` e `FdcN1`; as ações `Q_Monter` e `Q_Descendre` ficam nas etapas 5 e 15. Não foi guardada uma cópia do ficheiro no repositório.

## Ficheiros mistos, orientação e normalização (2026-10-26)

- **Pré-visualização `PREVIEW <n>`**: alguns ficheiros começam com `PREVIEW <n>`, seguido de 4 bytes com o tamanho e de um WMF binário até `ENDPREVIEW`. O leitor salta esse bloco pelo tamanho indicado antes de procurar o texto nativo.
- **Ficheiros mistos**: um CT pode juntar o GRAFCET a um circuito elétrico (DDEInput/DDEOutput EasyPort, `E_K001`, `E_S011`, `E_Y001`, polos, `EConnection`, linhas `CON ELine`, registos `text` e um bloco `BEGINSYM…ENDSYM` com conteúdo). Esses registos ficam na tabela de objetos, para os índices não se desalinharem, mas não são importados. Um aviso indica quantos elementos não GRAFCET foram ignorados.
- **Orientação (`FLIPPED`)**: em etapas e transições espelhadas (`FLIPPED I 2`), as portas 1 e 2 trocam de posição. A entrada passou a ser a porta que está geometricamente em cima e a saída a que está em baixo; se a geometria não for conclusiva, usa-se o bit 2 de `FLIPPED`. Ver DC-ADR-024 no cofre.
- **Retornos**: as ligações de retorno (destino acima da origem) mantêm o traçado nativo dos segmentos `L` do FluidSIM, convertido para `linkBends`. O editor desenha a seta ▲ no troço vertical ascendente mais longo, como no GRAFCET normalizado.
- **Comentários**: os registos `text` junto ao diagrama (por exemplo, o título `Q1`) são importados como comentários do GRAFCET. O editor passou a desenhá-los.
- **Condições no formato do DC-Simu**: `NOT x` e `!x` passam a `/x`; `AND` e `&` passam a `*`; `OR` e `|` passam a `+`. Há sempre um espaço de cada lado de ` + ` e ` * ` e nenhum espaço depois de `/` ou dentro de parênteses. Um `+` final num nome pneumático (por exemplo `1A+`) é mantido. Exemplo: `NOT a AND (b OR c)` → `/a * (b + c)`.
- **Variáveis de ações**: os acentos são removidos e os caracteres que não são letras, dígitos ou `_` passam a `_`. Um nome que comece por um dígito recebe o prefixo `V`, e um `+` ou `-` final é mantido. Cada renomeação gera um aviso com o nome original.

O exemplo `Monta Carga.ct`, acompanhado de TIFF, contém três diagramas lado a lado. O leitor separa-os em três páginas, cada uma com 4 etapas e 4 transições, mantendo números de etapa repetidos em páginas diferentes. As etapas encapsulantes e as macroetapas E/M/S são reconhecidas. A página 2 não tem etapa inicial e é assinalada como parcial; a página 3 tem duas etapas iniciais e pede confirmação. Três qualificadores de ação ainda não mapeados geram avisos para revisão antes de simular. Os ficheiros de origem permanecem fora do repositório.

O [manual oficial do FluidSIM 4](https://www.art-systems.de/www/files/fluidsim/downloads/v4/hb-eng-p4.pdf) descreve GRAFCET e a exportação TIFF/DXF. A opção de guardar XML sem compressão pertence a versões posteriores; não é um requisito deste leitor CT.


## Exemplo adicional: três GRAFCETs FluidSIM (2026-10-27)

O ficheiro local `Grafcet.ct`, acompanhado pela imagem `Grafcet.tif`, é um novo caso de treino. A imagem mostra os diagramas de controlo, funcionamento e reset. O CT contém 34 etapas e 40 registos de transição. Os ficheiros permanecem na pasta fornecida pelo utilizador e não são copiados para o repositório.

A importação ainda é recusada: a transição 9 (`NOT Emerg_NF`) não tem uma etapa de origem ligada. O leitor pára aqui para evitar inventar uma ligação e alterar a sequência. O caso também contém referências entre gráficos, que exigem revisão semântica antes de uma importação fiel. A imagem serve para comparar o resultado visual; não determina por si só as ligações do modelo.

Para reproduzir a recusa esperada no teste focado do leitor:

```powershell
$env:FLUIDSIM_EXTRA_SAMPLE = 'C:\Users\Deogracia de Castro\Downloads\Grafcet.ct'
$env:FLUIDSIM_EXTRA_EXPECT_ERROR = 'a transi..o 9 tem liga..es incompletas'
npm run test:fluidsim
Remove-Item Env:FLUIDSIM_EXTRA_SAMPLE
Remove-Item Env:FLUIDSIM_EXTRA_EXPECT_ERROR
```

Para outro CT que já importe, omita `FLUIDSIM_EXTRA_EXPECT_ERROR`; pode definir `FLUIDSIM_EXTRA_EXPECT_STEPS`, `FLUIDSIM_EXTRA_EXPECT_TRANSITIONS`, `FLUIDSIM_EXTRA_EXPECT_ACTIONS` e `FLUIDSIM_EXTRA_EXPECT_CHARTS` para fixar as contagens esperadas. Este exemplo é um teste de limite conhecido, ainda não um exemplo de importação concluída.
