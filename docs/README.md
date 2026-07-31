# Documentação interna do Labstar

Comece pelo `README.md` da raiz e use este índice para encontrar a documentação correta. O objetivo é permitir que uma pessoa autorizada ou o Codex reconstrua, opere e continue o projeto sem depender de conversas antigas.

| Documento | Quando usar |
| --- | --- |
| [`BUILD_FROM_SOURCE.md`](BUILD_FROM_SOURCE.md) | reconstruir web, Tauri, backend e instaladores diretamente do GitHub |
| [`ENVIRONMENT_SETUP.md`](ENVIRONMENT_SETUP.md) | configurar variáveis, secrets, OAuth, CORS e ambientes sem expor credenciais |
| [`DATABASE_BOOTSTRAP.md`](DATABASE_BOOTSTRAP.md) | preparar/restaurar banco e aplicar migrações na ordem correta |
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
2. `BUILD_FROM_SOURCE.md`;
3. `PROJECT_MAP.md`;
4. `ENVIRONMENT_SETUP.md`;
5. `DATABASE_BOOTSTRAP.md` quando houver trabalho de banco;
6. `TEAM_ONBOARDING.md`;
7. `ARCHITECTURE_DECISIONS.md`;
8. `CONTRIBUTING.md`;
9. issue e PR da tarefa;
10. documento operacional ou de release aplicável.

## Fonte de verdade

- estado do código: branch e commit do GitHub;
- reconstrução: `BUILD_FROM_SOURCE.md`;
- ambientes/secrets: `ENVIRONMENT_SETUP.md`;
- banco/migrações: `DATABASE_BOOTSTRAP.md` e arquivos SQL versionados;
- estado da integração: PR #7;
- tarefas e matriz de testes: Issue #8;
- backend: PR #5 e branch `feat/rust-backend-clean`;
- autenticação/migrações: PR #3 e branch `fix/auth-membership-access`;
- instaladores: workflow privado `Gerar instalador Windows integrado`;
- decisões permanentes: `ARCHITECTURE_DECISIONS.md`;
- updater e assinatura: `UPDATER.md` e Issue #9.

## Regra durante a fase de PRs empilhados

Nem tudo aparece na `main` ainda. Isso é intencional enquanto os testes estão em andamento.

- PR #3 contém autenticação e SQL;
- PR #5 contém backend Rust;
- PR #1 contém a fundação Tauri/Rust;
- PR #7 contém a integração desktop usada nos instaladores de teste.

Não mova arquivos entre branches apenas para “parecer organizado”. A integração final será feita somente depois dos testes e da revisão da ordem de merge.

Não use mensagens antigas, instaladores sem commit identificado ou memória informal como fonte única de verdade.
