# Labstar — entrega técnica para continuidade no Codex

Atualizado em 31 de julho de 2026.

## Regra principal

Esta branch é de integração e permanece isolada. Não fazer merge enquanto a matriz de testes reais não estiver concluída.

## Arquitetura atual

- React: somente interface e estado visual.
- Tauri 2 + Rust local: janela desktop, deep links, validação de URLs, abertura segura do navegador e integração nativa.
- API Rust em HTTPS: regras de negócio, autorização de membros e convites.
- Supabase: PostgreSQL, Auth e Storage.
- Google e GitHub: apenas identidade. A autorização real vem de `members` e dos convites controlados pela API Rust.

## Infraestrutura configurada

- Web: `https://labstar.pages.dev`
- API Rust: `https://labstar-api-mackson.fly.dev`
- Supabase: `https://pgzwyngxsxnheulvusdq.supabase.co`
- Callback desktop: `labstar://auth/callback`

Nunca versionar ou registrar `service_role`, senha do banco, client secret OAuth, tokens de sessão ou tokens de convite.

## O que já está concluído

- Google OAuth e GitHub OAuth habilitados no Supabase.
- Redirect URLs web e desktop configuradas.
- API Rust publicada na Fly.io.
- `/health/live` e `/health/ready` respondendo com sucesso.
- Backup manual do banco gerado e baixado.
- Quatro migrações de autenticação, convites e bloqueio do frontend aplicadas.
- Frontend integrado ao endpoint `/v1/me` e aos endpoints de convites.
- Chave publicável do Supabase armazenada como secret do GitHub.
- Build integrado do Windows gerando NSIS/EXE e MSI.
- CI de TypeScript/Vite, Rustfmt, Clippy e testes Rust aprovada antes do instalador.

## Branches e PRs ativos

- PR #5 — `feat/rust-backend-clean`: backend Rust central.
- PR #3 — `fix/auth-membership-access`: autenticação e estrutura de acesso.
- PR #1 — `feat/tauri2-rust-foundation`: fundação Tauri 2 + Rust.
- PR #7 — `feat/tauri-auth-rust-integration`: integração desktop completa, empilhada sobre a fundação Tauri.

Não achatar nem retargetar PRs empilhados sem revisar o histórico e a ordem de integração.

## Comportamento obrigatório de troca de conta

- Google deve abrir o seletor de contas em cada tentativa de login usando `prompt=select_account`.
- Contas pendentes, suspensas ou não autorizadas devem possuir ação visível para sair e entrar com outra conta.
- O convite pendente deve ser preservado durante a troca de conta.
- GitHub deve permitir desconectar e iniciar novamente o fluxo com outra identidade; não assumir que a conta já autenticada no navegador é a desejada.

## Matriz de testes antes de qualquer merge

- [ ] Proprietário entra com Google.
- [ ] Proprietário sai e escolhe outra conta.
- [ ] Proprietário entra com GitHub.
- [ ] Membro ativo antigo faz o primeiro vínculo.
- [ ] Membro ativo volta a entrar sem novo convite.
- [ ] Membro suspenso é bloqueado.
- [ ] Identidade sem convite é bloqueada.
- [ ] Convite pessoal funciona com o e-mail correto.
- [ ] Convite pessoal falha com e-mail diferente.
- [ ] Convite rápido cria membro pendente.
- [ ] Administrador aprova membro pendente.
- [ ] Convite já usado não funciona novamente.
- [ ] Convite expirado e convite revogado são recusados.
- [ ] Callback `labstar://auth/callback` funciona com o aplicativo fechado.
- [ ] Callback funciona com o aplicativo já aberto.
- [ ] EXE instala, abre, autentica e desinstala corretamente.
- [ ] MSI instala e remove corretamente.

## Próximas melhorias para o Codex

1. Implementar e testar seleção explícita de outra conta no Google e novo fluxo de identidade no GitHub.
2. Criar testes automatizados para os estados de acesso e para preservação do convite durante OAuth.
3. Melhorar mensagens de erro sem expor detalhes internos.
4. Validar visualmente todas as telas em 1024×640, 1366×768, 1440×900 e 1920×1080.
5. Corrigir recortes de avatar, indicador online e imagens dos Espaços sem esticar proporções.
6. Adicionar assinatura digital do Windows antes de distribuição pública.
7. Configurar updater somente depois da assinatura e do teste do instalador candidato.
8. Planejar a ordem segura de merge dos PRs empilhados e executar nova rodada completa de CI.

## Critérios de aceite

- Nenhuma regra crítica de autorização no React.
- Nenhum acesso direto do frontend às tabelas ou RPCs sensíveis de convite.
- Nenhuma conta suspensa reativada por convite.
- Somente owner concede nível administrativo.
- Convites continuam aleatórios, hash SHA-256, uso único, expirados/revogáveis e consumidos atomicamente.
- Nenhum merge até todos os testes reais acima estarem registrados como aprovados.
