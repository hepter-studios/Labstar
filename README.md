# Labstar

> **Projeto interno e privado da Hepter Studios.** Código, documentação, builds, backups, convites e informações operacionais são restritos a colaboradores autorizados.

Labstar é uma plataforma privada para organizar empresas, produtos, projetos, equipes, comunicação, reuniões, integrações e acessos em uma única experiência web e desktop.

## Estado do projeto

**Versão em teste:** `11.0.0`

| Área | Estado atual |
| --- | --- |
| Web/PWA | produção atual em Cloudflare Pages |
| Aplicativo Windows | Tauri 2 com EXE e MSI privados |
| Backend | API Rust/Axum publicada na Fly.io |
| Banco e Auth | Supabase PostgreSQL + Auth |
| Google OAuth | configurado; seletor de contas implementado |
| GitHub OAuth | configurado; vinculação de segunda identidade ainda pendente |
| Convites | migrações aplicadas; testes reais em andamento |
| Troca de conta | corrigida para funcionar até quando a API falha |
| CORS do desktop | origem oficial do Tauri adicionada ao backend |
| Atualizador | planejado; aguardando assinatura e chaves definitivas |
| Assinatura digital | ainda não configurada |
| Merge/lançamento | **não autorizado até concluir os testes** |

## Correção crítica desta rodada

O primeiro EXE conseguia abrir o login, mas mostrava `Não foi possível conectar ao backend Rust`.

A API estava funcionando no navegador. O problema era o CORS: no Windows, o aplicativo Tauri executa a interface em `http://tauri.localhost`, e o backend permitia a web oficial e localhost de desenvolvimento, mas ainda não essa origem do aplicativo instalado.

A correção inclui:

- `http://tauri.localhost`, `https://tauri.localhost` e `tauri://localhost` autorizados explicitamente;
- origens HTTP remotas não confiáveis continuam bloqueadas;
- 30 segundos de tolerância para a API iniciar;
- uma segunda tentativa apenas para leituras seguras;
- criação, aceite e revogação de convites nunca são repetidos automaticamente;
- estados `não autorizado`, `pendente` e `suspenso` tratados separadamente;
- botão **Entrar com outra conta** em todos os estados bloqueantes e de erro;
- saída local funcionando sem depender do backend responder;
- convite pendente preservado durante a troca de conta.

## Arquitetura

```text
React 19 + TypeScript + Vite
            │
            ├── Web/PWA ───────────── Cloudflare Pages
            │
            ├── Desktop ───────────── Tauri 2
            │                           └── Rust local
            │
            ├── Identidade ────────── Supabase Auth
            │                           ├── Google
            │                           ├── GitHub
            │                           └── e-mail
            │
            └── Regras centrais ───── API Rust / Axum / Fly.io
                                        └── PostgreSQL Supabase
```

| Camada | Responsabilidade |
| --- | --- |
| React | interface, navegação e apresentação de estados |
| Tauri/Rust local | janela, deep links, navegador do sistema, instância única e segurança nativa |
| API Rust | autorização, membros, convites e regras críticas |
| Supabase Auth | identidade e sessão |
| PostgreSQL | vínculos, estados, dados e auditoria |
| Storage | arquivos privados e avatares |
| Realtime | mensagens, Presence e Broadcast autorizados |

**React não concede acesso administrativo e não manipula diretamente convites protegidos.**

## Por que Rust ainda não aparece na porcentagem principal do GitHub

O repositório usa `main` como branch padrão. Ela ainda representa a produção web atual e não contém os novos diretórios Rust.

O Rust está nas branches e PRs de trabalho:

- `src-tauri/` em `feat/tauri2-rust-foundation` e `feat/tauri-auth-rust-integration`;
- `backend/` em `feat/rust-backend-clean`.

O gráfico de linguagens da página principal é calculado a partir da branch padrão. Rust aparecerá corretamente depois da integração segura na `main`; a ausência atual no gráfico não significa ausência de código Rust.

## Serviços

- Web: `https://labstar.pages.dev`
- API: `https://labstar-api-mackson.fly.dev`
- Saúde do processo: `https://labstar-api-mackson.fly.dev/health/live`
- Saúde com banco: `https://labstar-api-mackson.fly.dev/health/ready`
- Callback desktop: `labstar://auth/callback`

## Baixar os instaladores privados

Os instaladores não são versionados no Git. Eles são gerados como **Artifacts privados**.

1. Abra [Gerar instalador Windows integrado](https://github.com/macksonvictor/Labstar/actions/workflows/build-windows-integrated.yml).
2. Escolha a execução verde mais recente da branch `feat/tauri-auth-rust-integration`.
3. Confirme branch e commit exibidos na execução.
4. Baixe:

| Artifact | Conteúdo | Uso |
| --- | --- | --- |
| `labstar-windows-x64-nsis` | instalador `.exe` em ZIP | recomendado para testes comuns |
| `labstar-windows-x64-msi` | instalador `.msi` em ZIP | instalação administrativa |

Não use o instalador anterior após mudanças em autenticação, CORS, backend, deep link ou segurança.

## Acesso e autorização

Google e GitHub comprovam identidade. A API Rust decide se a identidade pertence à equipe.

Fluxo:

1. Supabase autentica a pessoa;
2. o aplicativo envia a sessão à API Rust;
3. a API valida o vínculo `members.auth_user_id = auth.uid()`;
4. o estado do membro define o resultado;
5. somente membro ativo autorizado entra.

Estados:

- `active`: acesso normal;
- `pending`: aguarda aprovação;
- `suspended`: bloqueado;
- identidade sem membro: bloqueada;
- convite pessoal com e-mail diferente: recusado.

Identidade principal do proprietário para o teste atual:

```text
hepterstudios@gmail.com
```

A identidade retornada pelo primeiro teste do GitHub, `mackson777@gmail.com`, permanece separada. Ela não pode virar proprietária automaticamente; a vinculação futura deve partir de uma sessão de owner já autorizada e ser auditável.

## Branches e PRs

| Branch | Responsabilidade | PR |
| --- | --- | --- |
| `main` | produção web atual | — |
| `feat/rust-backend-clean` | backend Rust e deploy Fly.io | #5 |
| `fix/auth-membership-access` | membros, autenticação e convites | #3 |
| `feat/auth-rust-api-integration` | interface ligada à API | #6 |
| `feat/tauri2-rust-foundation` | fundação Tauri 2/Rust | #1 |
| `feat/tauri-auth-rust-integration` | aplicativo integrado e documentação | #7 |

Os PRs são empilhados. Não retargetar, achatar, forçar push ou mesclar sem revisar a ordem.

## Documentação interna

Use [`docs/README.md`](docs/README.md) como índice central.

| Documento | Conteúdo |
| --- | --- |
| [`docs/PROJECT_MAP.md`](docs/PROJECT_MAP.md) | mapa de arquivos, serviços, branches e responsabilidades |
| [`docs/TEAM_ONBOARDING.md`](docs/TEAM_ONBOARDING.md) | entrada de equipe e Codex |
| [`docs/ARCHITECTURE_DECISIONS.md`](docs/ARCHITECTURE_DECISIONS.md) | decisões permanentes de arquitetura |
| [`docs/OPERATIONS.md`](docs/OPERATIONS.md) | diagnóstico, deploy, backup, incidentes e rollback |
| [`docs/RELEASE_CHECKLIST.md`](docs/RELEASE_CHECKLIST.md) | checklist de release interna e pública |
| [`docs/UPDATER.md`](docs/UPDATER.md) | atualização automática assinada |
| [`docs/INTERNATIONAL_RELEASE_ROADMAP.md`](docs/INTERNATIONAL_RELEASE_ROADMAP.md) | caminho até o lançamento internacional |
| [`docs/CODEX_HANDOFF.md`](docs/CODEX_HANDOFF.md) | estado técnico para continuidade no Codex |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | branches, commits, PRs, testes e segurança |

Tarefas principais:

- [Issue #8 — autenticação, troca de conta e acabamento](https://github.com/macksonvictor/Labstar/issues/8)
- [Issue #9 — updater assinado e releases privadas](https://github.com/macksonvictor/Labstar/issues/9)

## Desenvolvimento local

Requisitos:

- Node.js 22;
- npm;
- Rust estável para Tauri;
- acesso ao repositório privado.

```bash
git clone https://github.com/macksonvictor/Labstar.git
cd Labstar
npm ci
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Linux/macOS:

```bash
cp .env.example .env.local
```

```bash
npm run dev
npm run build
npm run preview
```

Para instaladores oficiais de teste, use o GitHub Actions em vez de distribuir builds locais.

## Variáveis e secrets

### Públicas no frontend

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_LABSTAR_API_URL`

Tudo com prefixo `VITE_` é incorporado ao aplicativo e não pode conter segredo.

### Backend

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `LABSTAR_ALLOWED_ORIGINS`
- `LABSTAR_REQUEST_TIMEOUT_SECONDS`

### GitHub Actions

- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_DATABASE_URL`
- `FLY_API_TOKEN`

Nunca versionar:

- senha do banco;
- `service_role`;
- OAuth Client Secret;
- token de sessão;
- token completo de convite;
- chave privada do updater;
- certificado ou senha de assinatura;
- backups e instaladores.

## Banco e migrações

Um backup manual foi gerado e baixado antes das quatro migrações de acesso:

1. membros e vínculo Auth;
2. convites de uso único;
3. endurecimento da autenticação;
4. bloqueio do acesso direto do frontend aos convites.

Antes de qualquer SQL futuro:

1. confirmar o ambiente;
2. gerar e baixar novo backup;
3. revisar SQL e rollback;
4. executar uma migração por vez;
5. validar API e acesso após cada etapa.

## Atualização automática

O updater não será ativado com chave temporária. O Tauri exige assinatura dos pacotes.

Antes da ativação:

- certificado de assinatura do Windows;
- par de chaves definitivo do updater;
- backup seguro da chave privada;
- endpoint HTTPS;
- Release privada;
- teste de atualização e rollback.

Plano completo: [`docs/UPDATER.md`](docs/UPDATER.md).

## Próximos testes obrigatórios

- instalar o novo EXE gerado após a correção CORS;
- entrar pelo Google com `hepterstudios@gmail.com`;
- testar seletor e troca de conta;
- confirmar que troca funciona com a API indisponível;
- testar membro ativo, pendente, suspenso e não cadastrado;
- testar convite rápido e pessoal;
- testar reutilização, expiração e revogação;
- testar callback com aplicativo fechado e aberto;
- testar EXE e MSI;
- corrigir imagens, avatar e indicador online;
- validar `1024×640`, `1366×768`, `1440×900` e `1920×1080`.

## Lançamento internacional

O lançamento internacional exige mais do que traduzir a interface:

- i18n estrutural;
- datas, números, moedas e fusos;
- assinatura e updater;
- observabilidade e suporte;
- isolamento multiempresa;
- segurança, backup e restauração;
- LGPD/GDPR e documentação jurídica;
- infraestrutura e testes globais.

Plano: [`docs/INTERNATIONAL_RELEASE_ROADMAP.md`](docs/INTERNATIONAL_RELEASE_ROADMAP.md).

## Regra final

> **Não fazer merge, substituir a produção ou distribuir o aplicativo para a equipe antes da CI verde, do novo instalador e da matriz de testes reais documentada.**
