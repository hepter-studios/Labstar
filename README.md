# Labstar

> **Projeto interno e privado.** Este repositório, seus instaladores, documentos e ambientes são destinados somente a colaboradores autorizados. Não publique artefatos, capturas, chaves, links de convite ou informações operacionais fora da equipe.

Labstar é o ambiente operacional privado da Hepter Studios para organizar empresas, produtos, projetos, equipes, comunicação, reuniões, integrações e acessos em uma única aplicação.

A arquitetura atual reúne:

- aplicação web/PWA em React;
- aplicativo desktop em Tauri 2;
- recursos nativos e validações locais em Rust;
- backend central em Rust com Axum;
- Supabase para Auth, PostgreSQL, Storage e Realtime;
- Fly.io para a API Rust;
- Cloudflare Pages para a aplicação web.

## Estado atual

**Versão em teste:** `11.0.0`

| Componente | Estado |
| --- | --- |
| Aplicação web/PWA | Em funcionamento na produção atual |
| Backend Rust | Publicado e conectado ao PostgreSQL |
| OAuth Google | Configurado |
| OAuth GitHub | Configurado, ainda exige testes de vinculação de identidade |
| Convites de uso único | Migrações aplicadas; testes reais em andamento |
| Aplicativo Windows | EXE e MSI gerados para teste interno |
| Assinatura digital | Ainda não configurada |
| Atualizador automático | Ainda não configurado |
| Liberação para a equipe | **Ainda não autorizada** |
| Merge dos PRs | **Ainda não autorizado** |

Os endpoints de saúde do backend são:

- `https://labstar-api-mackson.fly.dev/health/live`
- `https://labstar-api-mackson.fly.dev/health/ready`

## Baixar os instaladores privados

Os instaladores não são publicados em páginas públicas e não devem ser adicionados ao histórico Git. Eles são gerados como **Artifacts privados do GitHub Actions**.

### Download recomendado

1. Abra o workflow [Gerar instalador Windows integrado](https://github.com/macksonvictor/Labstar/actions/workflows/build-windows-integrated.yml).
2. Abra a execução verde mais recente da branch `feat/tauri-auth-rust-integration`.
3. Confirme que o commit da execução corresponde ao commit mais recente da branch.
4. Na seção **Artifacts**, baixe um dos pacotes:

| Artefato | Conteúdo | Uso |
| --- | --- | --- |
| `labstar-windows-x64-nsis` | Instalador `.exe` dentro de um ZIP | Recomendado para testes comuns no Windows |
| `labstar-windows-x64-msi` | Instalador `.msi` dentro de um ZIP | Instalação administrativa ou corporativa |

Os Artifacts do GitHub são temporários e exigem acesso ao repositório privado. Para distribuição interna permanente, será criada futuramente uma **Release privada assinada**, somente depois da conclusão dos testes e da assinatura digital.

> Não use um instalador antigo depois de alterações de autenticação, backend, deep link ou segurança. Gere ou baixe a execução verde mais recente.

## Acesso e autenticação

O Google e o GitHub comprovam a identidade da pessoa. A autorização real é decidida pelo backend Rust com base nos membros e convites do banco.

Fluxo atual:

1. a pessoa entra com Google, GitHub ou link por e-mail;
2. o Supabase valida a identidade;
3. o aplicativo envia a sessão para a API Rust;
4. a API consulta o vínculo permanente em `members.auth_user_id`;
5. somente membros autorizados recebem acesso;
6. membros pendentes, suspensos ou não cadastrados permanecem bloqueados.

Regras obrigatórias:

- Google deve permitir escolher outra conta;
- uma conta não autorizada deve poder sair e tentar outra identidade;
- convites pessoais são presos ao e-mail informado;
- convites rápidos exigem aprovação administrativa;
- convite é de uso único, expira e pode ser revogado;
- convite nunca reativa conta suspensa;
- somente o proprietário concede nível administrativo;
- sair da conta não pode apagar um convite pendente antes da troca de identidade.

## Funcionalidades do produto

- empresas, produtos, projetos e equipes em Espaços;
- categorias e canais de texto, avisos, regras, voz e social;
- mensagens, respostas, anexos, fixação e visualização de imagens;
- perfis, avatares, cargos, áreas e permissões;
- reuniões por voz e vídeo com WebRTC;
- teste e medidor de microfone com Web Audio API;
- agendamento, cancelamento e notificações de reuniões;
- Central de Integrações para GitHub, Discord, suporte, cobrança e monitoramento;
- PWA responsiva para desktop e dispositivos móveis;
- aplicativo Windows com Tauri 2 e deep links `labstar://`.

## Arquitetura

```text
React 19 + TypeScript + Vite
            │
            ├── Interface web/PWA ── Cloudflare Pages
            │
            ├── Aplicativo desktop ── Tauri 2
            │                          └── Rust nativo
            │
            ├── Supabase Auth ─────── Google / GitHub / e-mail
            │
            └── API central Rust ──── Fly.io
                                       └── PostgreSQL Supabase
```

### Responsabilidades

| Camada | Responsabilidade |
| --- | --- |
| React | Interface, navegação e apresentação de estados |
| Tauri/Rust | Deep links, navegador do sistema, instância única e recursos nativos |
| API Rust | Autorização, membros, convites e regras críticas de negócio |
| Supabase Auth | Identidade e sessão |
| PostgreSQL | Dados, vínculos, estados, auditoria e permissões |
| Supabase Storage | Arquivos privados e avatares |
| Supabase Realtime | Mensagens, Presence e Broadcast autorizados |

**React não deve decidir autorização crítica nem manipular diretamente convites protegidos.**

## Tecnologias

- React 19;
- TypeScript 5;
- Vite 7;
- Tauri 2;
- Rust estável;
- Axum e Tokio;
- Supabase Auth, PostgreSQL, Storage e Realtime;
- WebRTC e Web Audio API;
- Cloudflare Pages;
- Fly.io;
- GitHub Actions.

## Estrutura de continuidade

| Recurso | Finalidade |
| --- | --- |
| [`docs/CODEX_HANDOFF.md`](docs/CODEX_HANDOFF.md) | Contexto técnico e limites para o Codex |
| [Issue #8](https://github.com/macksonvictor/Labstar/issues/8) | Matriz de testes e melhorias pendentes |
| [PR #7](https://github.com/macksonvictor/Labstar/pull/7) | Integração Tauri, OAuth, convites e API Rust |
| [PR #5](https://github.com/macksonvictor/Labstar/pull/5) | Backend central Rust |
| [PR #3](https://github.com/macksonvictor/Labstar/pull/3) | Autenticação e autorização de membros |
| [PR #1](https://github.com/macksonvictor/Labstar/pull/1) | Fundação Tauri 2 e Rust |

### Branches principais do trabalho

| Branch | Conteúdo |
| --- | --- |
| `main` | Produção web atual |
| `feat/rust-backend-clean` | Backend Rust publicado na Fly.io |
| `fix/auth-membership-access` | Fundação de autenticação e membros |
| `feat/auth-rust-api-integration` | Frontend ligado à API Rust |
| `feat/tauri2-rust-foundation` | Fundação desktop Tauri 2 |
| `feat/tauri-auth-rust-integration` | Integração completa usada nos instaladores de teste |

Os PRs são empilhados. Não altere a base, faça rebase, force push ou merge sem revisar a ordem e confirmar todos os testes.

## Workflows do GitHub Actions

| Workflow | Finalidade |
| --- | --- |
| `Validar Labstar` | TypeScript e build Vite |
| `Validar Tauri e Rust` | Formatação, Clippy, testes e build do núcleo desktop |
| `Validar integração Tauri Auth` | OAuth, frontend e Rust no Windows |
| `Gerar instalador Windows integrado` | Gera EXE e MSI privados |
| `Publicar backend Rust na Fly.io` | Publica a API Rust da branch do backend |
| `Gerar backup manual do Supabase` | Gera backup privado antes de mudanças no banco |
| `Empacotar migrações de acesso` | Preserva e valida o pacote de migrações |

O instalador integrado é reconstruído quando arquivos relevantes de `src/`, `src-tauri/`, configuração ou dependências mudam. Também pode ser iniciado manualmente pelo botão **Run workflow**.

## Instalação local da interface web

### Requisitos

- Node.js 22;
- npm compatível;
- acesso autorizado ao repositório;
- variáveis públicas corretas em `.env.local`.

```bash
git clone https://github.com/macksonvictor/Labstar.git
cd Labstar
npm ci
```

No Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Em Linux ou macOS:

```bash
cp .env.example .env.local
```

Depois:

```bash
npm run dev
```

### Comandos

```bash
npm run dev      # desenvolvimento web
npm run build    # TypeScript + build de produção
npm run preview  # pré-visualização do diretório dist
```

Para gerar o aplicativo Windows, prefira o workflow privado do GitHub Actions. Isso mantém Node, Rust, Tauri, variáveis e artefatos reproduzíveis.

## Variáveis de ambiente

### Frontend e Tauri

| Variável | Tipo | Uso |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Pública | URL do projeto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Pública | Chave publicável usada pelo cliente |
| `VITE_LABSTAR_API_URL` | Pública | URL HTTPS da API Rust |

Variáveis `VITE_` são incorporadas ao aplicativo e **não podem conter segredos**.

### Backend Rust

| Variável | Armazenamento permitido |
| --- | --- |
| `DATABASE_URL` | Fly Secrets e ambiente seguro |
| `SUPABASE_URL` | Fly Secrets ou configuração segura |
| `SUPABASE_PUBLISHABLE_KEY` | Fly Secrets ou configuração segura |
| `LABSTAR_ALLOWED_ORIGINS` | Fly Secrets ou configuração segura |

### Secrets do GitHub usados atualmente

Somente os nomes são documentados. Os valores nunca devem ser escritos em arquivos, issues, PRs, logs ou mensagens.

- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_DATABASE_URL`
- `FLY_API_TOKEN`

Nunca armazene:

- `service_role` no frontend;
- senha do banco no código;
- Client Secret do Google ou GitHub no repositório;
- token de sessão em logs;
- token completo de convite no banco ou em logs;
- instaladores dentro do histórico Git.

## Banco e migrações

Um backup manual foi gerado antes da migração de acesso. As quatro migrações abaixo já foram aplicadas no ambiente atual:

1. membros e vínculo permanente com Auth;
2. convites de uso único;
3. endurecimento da autenticação;
4. bloqueio do acesso direto do frontend aos convites.

Nenhum SQL deve ser aplicado novamente sem:

1. confirmar o ambiente;
2. gerar um novo backup;
3. revisar o conteúdo;
4. executar uma migração por vez;
5. validar o resultado antes da próxima.

Os arquivos históricos em `supabase/` preservam a evolução da aplicação e não representam autorização para execução automática.

## Matriz obrigatória antes do merge

- proprietário pelo Google;
- escolha e troca de conta Google;
- proprietário pelo GitHub após vinculação explícita;
- membro ativo antigo;
- segundo login sem novo convite;
- membro pendente;
- membro suspenso;
- identidade não cadastrada;
- convite rápido;
- convite pessoal com e-mail correto;
- convite pessoal com e-mail incorreto;
- reutilização do mesmo convite;
- convite expirado;
- convite revogado;
- aplicativo fechado durante callback;
- aplicativo aberto durante callback;
- instalação e remoção pelo EXE;
- instalação e remoção pelo MSI;
- imagens dos Espaços sem distorção;
- avatar e indicador online sem recorte;
- telas em `1024×640`, `1366×768`, `1440×900` e `1920×1080`.

A lista operacional permanece na [Issue #8](https://github.com/macksonvictor/Labstar/issues/8).

## Publicação e distribuição

### Web

A produção web atual usa Cloudflare Pages. Alterações nas branches de integração não devem substituir a produção antes da aprovação.

### Windows

O EXE e o MSI atuais são candidatos de teste sem assinatura digital. O Windows pode exibir aviso de editor desconhecido.

Antes da distribuição para a equipe:

1. concluir a matriz de testes;
2. corrigir os problemas encontrados;
3. definir a ordem dos merges;
4. configurar assinatura digital;
5. configurar o updater;
6. gerar uma Release privada;
7. validar instalação limpa e atualização.

## Segurança

- o repositório permanece privado;
- somente colaboradores autorizados recebem acesso;
- RLS permanece habilitado nas tabelas privadas;
- arquivos permanecem em bucket privado com URLs assinadas;
- a API Rust centraliza autorização e regras críticas;
- senhas e tokens ficam somente em serviços de secrets;
- backups não são versionados no repositório;
- Artifacts e instaladores não substituem backup do código ou do banco;
- nenhuma conta recebe privilégios por coincidência de nome ou por login social;
- vinculação de uma segunda identidade deve exigir uma sessão proprietária já autorizada.

## Regra de trabalho

> **Não fazer merge, publicar uma nova produção ou distribuir o instalador para a equipe até que os testes reais estejam concluídos e documentados.**
