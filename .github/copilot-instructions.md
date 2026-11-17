# DC-Simu: contexto para o GitHub Copilot

O DC-Simu é um simulador de comandos elétricos industriais em React 18, TypeScript e Vite, com Three.js/R3F e Zustand. Lê README.md e docs/AI-ASSISTANCE.md para conhecer os percursos e o uso das ferramentas de IA.

## Priorização do cofre BrainNet (Contextos, Workflows e Automação)

O cofre **BrainNet** (Obsidian + Maestri) é a fonte de autoridade de requisitos, regras de negócio, princípios de design e automação:
- **Priorizar sempre o alinhamento e a comunicação com o cofre BrainNet.** Antes de iniciar qualquer tarefa de código ou interface, consulta os contextos e diretrizes em `03-Projects/DC-Simu/Design-Principles.md`, o protocolo de alinhamento em `03-Projects/DC-Simu/Protocolo-Comunicacao-BrainNet-DCSimu.md` e a tarefa correspondente em `03-Projects/DC-Simu/`.
- **Workflows e ciclo de vida:** Respeitar a biblioteca de fluxos (WF-01 Intake, WF-02 Planning, WF-03 Agent Handoff, WF-04 Documentation Sync, WF-05 QA Approval). Toda a entrega de código deve produzir evidências de teste documentadas no cofre.
- **UI/UX:** Aplicar com rigor o sistema de design (azul de marca `#2563eb` para ações ativas e seleção, botões de 44 px, sem bordas de acento isoladas, gating estrito de simulação).

## Implementação

- Esquema 2D, visualização 3D, Ladder e GRAFCET partilham o estado do circuito. Preserva a sincronização e a compatibilidade dos projetos guardados.
- O domínio elétrico vive em src/electrical e src/simulation; Ladder em src/ladder; GRAFCET em src/grafcet. Confirma contratos em src/types e o store existente antes de alterar motores.
- Reutiliza catálogo, modelos GLB e geometria partilhada. Evita corrigir uma vista com dados independentes das restantes.
- Confirma o modo de persistência: existem percursos locais e com servidor. O servidor está em server; a configuração de alojamento inclui Vercel e Docker. Ver configuração não comprova um deploy ativo.
- O Copilot é uma ferramenta de desenvolvimento. Não é o ambiente de produção da aplicação.
- Mantém alterações pequenas e ligadas a uma tarefa, com critério de aceitação verificável.

## Validação

- Tipos: npm run typecheck. Build: npm run build.
- Motores: npm test. Interações: npm run test:interactables. Movimento: npm run test:motion.
- API: npm run test:server, com dados temporários previstos pelo script.
- Executa os checks relevantes e reporta os resultados reais. Uma resposta de IA não substitui testes, inspeção do diff ou revisão humana.
- Se um check falhar antes da alteração, regista a falha e distingue-a de uma regressão; não declares o projeto verde.

## Dados e entrega

- Não copies .env, credenciais, chaves de API ou dados reais para prompts, logs ou commits.
- Preserva ficheiros e volumes de dados locais, configuração Maestri e alterações humanas existentes. Não regeneres dist ou modelos 3D para uma tarefa apenas documental.
- Não atives faturação, publiques workflows ou faças deploy como efeito lateral de uma tarefa de programação.
- Entrega resultado, ficheiros alterados, verificações e pendências em português europeu.
