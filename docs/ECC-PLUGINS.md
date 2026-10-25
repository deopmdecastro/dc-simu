# Exploração do ECC no DC-Simu

O catálogo [affaan-m/ECC](https://github.com/affaan-m/ECC/tree/76aaa77df6adc5b889e689007bf99b9a4f74af34), versão 2.2.3, foi registado no Codex desta máquina para exploração conjunta com o BrainNet. O commit de referência é `76aaa77df6adc5b889e689007bf99b9a4f74af34`.

O marketplace contém o plugin `ecc@ecc`, com várias skills. O catálogo está disponível, mas **o plugin não foi instalado nem ativado**, e nenhum hook ou servidor MCP foi iniciado por esta exploração. O registo vive no CODEX_HOME do utilizador; clonar este repositório noutra máquina não o instala automaticamente.

## Seleção inicial

| Skill ECC | Tarefa adequada | Limite no DC-Simu |
| --- | --- | --- |
| security-review | Rever validação de entradas, destinos e segredos na integração n8n | Reconfirmar o código atual e não publicar valores de segredos |
| verification-loop | Apresentar evidências dos testes relevantes após uma alteração | Usar scripts do package.json; não presumir lint ou cobertura configurados |
| react-patterns | Rever efeitos, componentes e estado partilhado | React 18 + Zustand + R3F; não copiar padrões exclusivos de React 19/RSC |
| react-testing | Planear testes do comportamento de controlos e vistas | Bibliotecas adicionais exigem uma necessidade concreta; a exploração não instalou Vitest/RTL/MSW |
| contract-first | Alinhar payloads e respostas entre cliente, proxy e n8n | Reutilizar o contrato existente; evitar uma segunda definição do mesmo payload |

As três primeiras formam o piloto recomendado; as restantes ficam como opções. A seleção não filtra automaticamente o conteúdo do plugin nativo.

## Consultar

No PowerShell da pasta do projeto:

```powershell
codex.cmd plugin list --marketplace ecc --available --json
```

Dentro do Codex, abrir `/plugins` e consultar ECC. A disponibilidade das skills para invocação exige instalação e uma sessão que as descubra. A ativação futura do plugin é uma configuração partilhada do Codex, não uma alteração da aplicação React ou do alojamento.

O [relatório central no BrainNet](https://github.com/deopmdecastro/BrainNet/blob/main/04-Agents/ECC-Exploration.md) contém a seleção para os dois projetos, critérios de ensaio, referências e limitações. O [backlog](https://github.com/deopmdecastro/BrainNet/blob/main/03-Projects/DC-Simu/Backlog.md) distingue exploração concluída e piloto ainda pendente.

## Verificação no projeto

Usar `npm.cmd test`, `npm.cmd run test:interactables`, `npm.cmd run test:motion`, `npm.cmd run typecheck` ou `npm.cmd run test:server` conforme a mudança. Os resultados históricos não comprovam o estado atual. Typecheck pode atualizar tsconfig.tsbuildinfo; build gera dist. Esta exploração não executou os testes do produto nem alterou motores, persistência ou componentes.

O skill ECC vite-patterns analisado aponta para Vite 8+, enquanto este projeto declara Vite 5.4.9. O plugin também declara Chrome DevTools MCP e um hook SessionStart; nenhum deles foi ativado. O adaptador ECC OpenCode não deve substituir o perfil DeepSeek existente, que tem ferramentas desativadas.

Fontes: [skills ECC](https://github.com/affaan-m/ECC/tree/76aaa77df6adc5b889e689007bf99b9a4f74af34/skills), [plugin Codex](https://github.com/affaan-m/ECC/blob/76aaa77df6adc5b889e689007bf99b9a4f74af34/.codex-plugin/README.md) e [OpenAI Docs — plugins](https://learn.chatgpt.com/docs/cli/reference).
