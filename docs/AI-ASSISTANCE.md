# Assistência de IA no DC-Simu

Configuração preparada em 2026-10-18. O objetivo inicial é reutilizar as ferramentas existentes e experimentar opções gratuitas, sem acrescentar subscrições ou chamadas API pagas.

## Percurso recomendado

1. Abrir no VS Code a pasta do repositório que contém package.json. Usar os agentes Codex existentes para tarefas de implementação e QA, de acordo com o acesso atual da conta. O plano e os limites da conta continuam por confirmar.
2. No VS Code, usar Chat: Set up Copilot e autenticar a conta GitHub. Experimentar Copilot Free quando a conta for elegível, ou usar o acesso que já exista. A configuração deste repositório não contrata um plano.
3. Confirmar que o Copilot lê [.github/copilot-instructions.md](../.github/copilot-instructions.md), pedindo uma explicação pequena do circuito e verificando as referências mostradas pelo editor.
4. Para Sonda/DeepSeek local, enviar perguntas com os excertos necessários. O perfil preparado no BrainNet é de análise contextual: as ferramentas estão desativadas após um teste funcional sem chamada válida.
5. Executar os testes existentes e rever o diff antes de aceitar código sugerido.

As extensões recomendadas estão em [.vscode/extensions.json](../.vscode/extensions.json). Recomendação de extensão e instrução de repositório não comprovam instalação, autenticação ou acesso a um plano. O procedimento de configuração do VS Code está na [documentação oficial do GitHub](https://docs.github.com/en/copilot/how-tos/copilot-in-your-ide/set-up-copilot/install-copilot-extension).

## Documentação e alternativas

ChatGPT e Gemini podem ajudar a rever requisitos e resumir excertos sem integração no frontend. Usar apenas dados adequados ao serviço e confirmar os limites da conta.

Na preparação dos terminais, **Gemma 4 E4B pelo Ollama local** substitui a opção Mistral após cancelamento do setup Vibe. O modelo já instalado respondeu ao teste sintético; a troca no canvas exige executar o procedimento do BrainNet. Llama 3.2 local também tem um terminal preparado. Estes comandos de conversa usam os excertos fornecidos e não lhes dão acesso autónomo a ficheiros ou ferramentas. Ver [terminais e substituição do Mistral](../../../BrainNet/04-Agents/AI-Terminals.md).

O [catálogo ECC](ECC-PLUGINS.md) também foi registado no Codex para explorar skills de revisão, verificação e React. A seleção e a compatibilidade com BrainNet estão documentadas; o plugin não foi instalado nesta exploração.

O Copilot não aloja a aplicação. O repositório contém vercel.json, Dockerfile e compose.yaml; a URL, o commit e o ambiente de produção devem ser confirmados pelo responsável.

O cofre BrainNet, quando estiver na estrutura local de pastas existente, contém a [avaliação de ferramentas e custos](../../../BrainNet/03-Projects/DC-Simu/AI-Tooling-Assessment.md) e o [backlog](../../../BrainNet/03-Projects/DC-Simu/Backlog.md). As ligações pressupõem que BrainNet e a pasta exterior dc-simu são irmãs.

## Validação e custo

Os comandos válidos estão no package.json: npm run typecheck, npm test, npm run test:interactables, npm run test:motion e npm run test:server. Usar npm run build quando a alteração exigir validar a produção e identificar os ficheiros gerados.

O baseline do produto e os resultados desta entrega ficam na avaliação do BrainNet. Não interpretar sugestões do Copilot ou respostas do DeepSeek como prova de testes passados. Novas subscrições e ativação de APIs requerem uma decisão separada sobre conta, limite de despesa e dados enviados.
