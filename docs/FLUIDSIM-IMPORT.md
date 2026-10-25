# Importar GRAFCET do FluidSIM 4

Na barra do editor GRAFCET, **Importar** abre o seletor de ficheiros para `.ct` do FluidSIM 4 e os formatos `.json` e `.grafcet` do DC-Simu; também pode arrastar o ficheiro para a zona indicada. Reveja a contagem e os avisos antes de substituir o diagrama. A importação pode ser desfeita. O ficheiro é lido localmente no navegador; não é enviado a serviços externos.

## Âmbito implementado

- Etapas simples e iniciais, com números originais e posição relativa.
- Transições e condições booleanas, incluindo ligações por referência ao número da etapa.
- Operadores OR são normalizados para um espaço antes e depois de `+`, evitando espaços duplicados vindos do ficheiro de origem.
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

O dicionário reinicia a posição de escrita conforme as regras do formato; não é uma janela circular comum. Os registos semânticos são lidos depois de `END_FSPREVIEW`, ignorando a pré-visualização WMF. O texto nativo usa Windows-1252. A normalização de `a+NOT b` para `a + NOT b` evita a ambiguidade com nomes pneumáticos terminados em `+` no analisador atual.

Limites: ficheiro de entrada até 5 MB, expansão até 32 MB e até 10 000 objetos nativos. Blocos truncados, configurações desconhecidas, portas inválidas e estruturas incompletas falham antes de alterar o projeto.

## Verificação

```powershell
npm run test:fluidsim
npm run test:grafcet-construction-ui
npm run typecheck
npm run build
```

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

Foi também validado um ficheiro CT de referência adicional, mantido fora do repositório: **4 etapas, 4 transições e 2 ações**, com relações `5→1`, `10→5`, `15→10` e `1→15`. As ações ficaram associadas às etapas 5 e 15; as condições coincidiram com a referência visual e a importação não gerou avisos. Espaços repetidos em torno do OR foram reduzidos a um espaço. Não foi guardada uma cópia do ficheiro no repositório.

O exemplo `Monta Carga.ct`, acompanhado de TIFF, contém três diagramas lado a lado. O leitor separa-os em três páginas, cada uma com 4 etapas e 4 transições, mantendo números de etapa repetidos em páginas diferentes. As etapas encapsulantes e as macroetapas E/M/S são reconhecidas. A página 2 não tem etapa inicial e é assinalada como parcial; a página 3 tem duas etapas iniciais e pede confirmação. Três qualificadores de ação ainda não mapeados geram avisos para revisão antes de simular. Os ficheiros de origem permanecem fora do repositório.

O [manual oficial do FluidSIM 4](https://www.art-systems.de/www/files/fluidsim/downloads/v4/hb-eng-p4.pdf) descreve GRAFCET e a exportação TIFF/DXF. A opção de guardar XML sem compressão pertence a versões posteriores; não é um requisito deste leitor CT.
