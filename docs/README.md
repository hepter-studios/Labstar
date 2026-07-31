# Documentação interna do Labstar

Comece pelo `README.md` da raiz e use este índice para encontrar a documentação correta.

| Documento | Quando usar |
| --- | --- |
| [`PROJECT_MAP.md`](PROJECT_MAP.md) | entender onde estão frontend, Tauri, Rust, backend, banco, branches e serviços |
| [`TEAM_ONBOARDING.md`](TEAM_ONBOARDING.md) | integrar uma pessoa nova ou orientar o Codex antes de alterar código |
| [`ARCHITECTURE_DECISIONS.md`](ARCHITECTURE_DECISIONS.md) | conferir decisões que não devem ser revertidas sem discussão |
| [`OPERATIONS.md`](OPERATIONS.md) | diagnosticar API, login, deploy, backup, incidente e rollback |
| [`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md) | preparar instalador, release interna, beta ou lançamento público |
| [`UPDATER.md`](UPDATER.md) | implementar atualização automática com assinatura e rollback |
| [`INTERNATIONAL_RELEASE_ROADMAP.md`](INTERNATIONAL_RELEASE_ROADMAP.md) | planejar o caminho até o lançamento internacional |
| [`CODEX_HANDOFF.md`](CODEX_HANDOFF.md) | continuar o trabalho com Codex sem perder contexto ou quebrar arquitetura |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md) | padrão de branches, commits, PRs, testes e segurança |

## Ordem recomendada para uma pessoa nova

1. `README.md`;
2. `PROJECT_MAP.md`;
3. `TEAM_ONBOARDING.md`;
4. `ARCHITECTURE_DECISIONS.md`;
5. `CONTRIBUTING.md`;
6. issue e PR da tarefa;
7. documento operacional ou de release aplicável.

## Fonte de verdade

- estado do código: branch e commit do GitHub;
- estado da integração: PR #7;
- tarefas e matriz de testes: Issue #8;
- backend: PR #5 e branch `feat/rust-backend-clean`;
- instaladores: workflow privado `Gerar instalador Windows integrado`;
- decisões permanentes: `ARCHITECTURE_DECISIONS.md`.

Não use mensagens antigas, instaladores sem commit identificado ou memória informal como fonte única de verdade.
