# Labstar — reconstrução segura do banco

Este documento explica como recriar ou preparar o PostgreSQL/Supabase do Labstar usando somente arquivos versionados no GitHub.

## Regra principal

Nunca aplique SQL de memória, de chat ou de arquivo solto sem identificar o commit. A fonte de verdade são os arquivos versionados no repositório.

## Onde estão as migrações atuais

Enquanto os PRs ainda não foram mesclados, as migrações de autenticação estão no PR #3 / branch `fix/auth-membership-access`:

1. `supabase/labstar-supabase-v9-auth.sql`
2. `supabase/labstar-supabase-v10-invite-links.sql`
3. `supabase/labstar-supabase-v10-auth-hardening.sql`
4. `supabase/labstar-supabase-v11-rust-backend-lockdown.sql`

Auditoria:

- `supabase/diagnostics/auth-access-audit.sql`

Documentação histórica/operacional do PR #3:

- `docs/ATIVACAO-ACESSO-E-CONVITES.md`

Depois do merge seguro, esses arquivos deverão existir na linha principal do projeto e continuarão sendo a referência histórica.

## O que cada migração faz

### 1. v9 — membros e identidade

Prepara a relação estável entre membro interno e usuário autenticado, incluindo `members.auth_user_id` e regras necessárias para o fluxo novo.

### 2. v10 — convites

Cria a infraestrutura de convites de uso único, expiração, tipos pessoal/rápido e dados necessários ao backend.

### 3. v10 — hardening

Endurece privilégios e reduz superfícies de acesso que não devem permanecer abertas ao cliente.

### 4. v11 — Rust backend lockdown

Move o controle sensível dos convites para o backend Rust e impede que o frontend contorne a API central.

## Antes de aplicar qualquer migração

- [ ] confirmar qual projeto Supabase está aberto;
- [ ] confirmar se é produção, homologação ou ambiente novo;
- [ ] verificar se existe backup recente;
- [ ] baixar o backup para armazenamento local seguro;
- [ ] confirmar que a `DATABASE_URL` usada no backup é do projeto correto;
- [ ] revisar o SQL no GitHub;
- [ ] executar somente uma migração por vez.

## Backup oficial

O workflow versionado é:

`.github/workflows/backup-supabase.yml`

Enquanto os PRs não foram mesclados, ele está disponível na branch do backend `feat/rust-backend-clean`.

Ele usa o secret:

`SUPABASE_DATABASE_URL`

O backup deve ser armazenado como Artifact temporário do GitHub Actions e baixado para local seguro antes de uma alteração estrutural.

Nunca commit o dump do banco no Git.

## Aplicação manual no Supabase SQL Editor

Para cada arquivo, na ordem indicada:

1. abrir o arquivo diretamente no GitHub;
2. conferir branch e commit;
3. copiar o SQL completo;
4. abrir `Supabase → SQL Editor → New query`;
5. colar;
6. executar uma vez;
7. conferir sucesso;
8. parar imediatamente em qualquer erro.

Não execute as quatro migrações em um único bloco sem validação intermediária.

## Auditoria depois das migrações

Execute:

`supabase/diagnostics/auth-access-audit.sql`

A auditoria deve ser usada para conferir:

- membros duplicados;
- vínculos Auth esperados;
- estados `active`, `pending` e `suspended`;
- inconsistências que possam afetar autorização.

## Validação pelo backend

Depois de alterações no banco:

1. validar `GET /health/live`;
2. validar `GET /health/ready`;
3. testar uma sessão válida em `/v1/me`;
4. testar bloqueio de identidade não autorizada;
5. só então iniciar os testes de convites.

`/health/ready` é obrigatório porque confirma acesso real ao PostgreSQL.

## Matriz de dados mínima para teste

O ambiente de teste deve permitir verificar, sem inventar privilégios:

- proprietário ativo;
- membro ativo antigo;
- membro pendente;
- membro suspenso;
- identidade sem membro;
- convite rápido válido;
- convite pessoal válido;
- convite usado;
- convite expirado/revogado.

Não transforme dados de produção apenas para fazer um teste “passar”.

## Regras invariantes

- OAuth comprova identidade; não concede autorização;
- `members.auth_user_id` é o vínculo permanente;
- suspenso nunca é reativado por convite;
- somente owner concede admin;
- convite pessoal exige o e-mail correto;
- convite rápido gera aprovação pendente;
- token do convite é aleatório;
- somente hash SHA-256 é armazenado;
- uso é único e atômico;
- frontend não manipula diretamente convites protegidos.

## Ambiente novo do zero

Para preparar um projeto Supabase novo:

1. criar o projeto;
2. configurar Auth e Redirect URLs conforme `ENVIRONMENT_SETUP.md`;
3. configurar Google/GitHub;
4. aplicar as migrações 1–4 na ordem;
5. executar auditoria;
6. configurar secrets do backend;
7. publicar a API;
8. validar health live/ready;
9. criar/configurar o proprietário conforme o procedimento administrativo aprovado;
10. executar a matriz completa antes de permitir uso da equipe.

## Restauração

Uma restauração de backup é uma operação de incidente e não deve ser feita por tentativa e erro.

Antes de restaurar:

- registrar qual backup será usado;
- verificar data e origem;
- preservar o estado atual antes de sobrescrever;
- interromper writes quando necessário;
- revisar `OPERATIONS.md`;
- validar banco e backend depois da restauração.
