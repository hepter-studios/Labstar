# Labstar — entrega técnica para continuidade no Codex

Atualizado em 31 de julho de 2026.

## Regra principal

Esta branch é de integração e permanece isolada. Não fazer merge enquanto a matriz de testes reais não estiver concluída.

Antes de alterar qualquer arquivo, leia:

1. `README.md`;
2. `docs/README.md`;
3. `docs/PROJECT_MAP.md`;
4. `docs/ARCHITECTURE_DECISIONS.md`;
5. `CONTRIBUTING.md`;
6. Issue #8 e PR #7.

## Arquitetura atual

- React: somente interface e estado visual.
- Tauri 2 + Rust local: janela desktop, deep links, validação de URLs, abertura segura do navegador e integração nativa.
- API Rust em HTTPS: regras de negócio, autorização de membros e convites.
- Supabase: PostgreSQL, Auth e Storage.
- Google e GitHub: identidade. A autorização real vem de `members` e dos convites controlados pela API Rust.

## Infraestrutura configurada

- Web: `https://labstar.pages.dev`
- API Rust: `https://labstar-api-mackson.fly.dev`
- Supabase: `https://pgzwyngxsxnheulvusdq.supabase.co`
- Callback desktop: `labstar://auth/callback`
- Origem Tauri no Windows: `http://tauri.localhost`

Nunca versionar ou registrar `service_role`, senha do banco, client secret OAuth, tokens de sessão, chaves privadas de assinatura ou tokens de convite.

## O que já está concluído

- Google OAuth e GitHub OAuth habilitados no Supabase.
- Redirect URLs web e desktop configuradas.
- API Rust publicada na Fly.io.
- `/health/live` e `/health/ready` respondendo com sucesso antes da correção CORS.
- Backup manual do banco gerado e baixado.
- Quatro migrações de autenticação, convites e bloqueio do frontend aplicadas.
- Frontend integrado ao endpoint `/v1/me` e aos endpoints de convites.
- Chave publicável do Supabase armazenada como secret do GitHub.
- Build integrado do Windows gerando NSIS/EXE e MSI.
- CI de TypeScript/Vite, Rustfmt, Clippy e testes Rust aprovada antes do instalador inicial.
- Google recebe `prompt=select_account`.
- troca local de conta preserva convite pendente.
- documentação interna central criada em `docs/`.

## Problema real encontrado no primeiro instalador

O EXE instalado exibia `Não foi possível conectar ao backend Rust`, mesmo com os endpoints de saúde funcionando no navegador.

Causa encontrada:

- o navegador comum acessava a API sem depender do CORS da aplicação;
- o aplicativo Tauri executa a interface em `http://tauri.localhost` no Windows;
- o backend permitia a origem da web e localhost de desenvolvimento, mas não a origem oficial do Tauri;
- por isso o WebView recebia bloqueio CORS e convertia a falha em `backend_unreachable`.

Correção aplicada:

- backend aceita explicitamente `http://tauri.localhost`, `https://tauri.localhost` e `tauri://localhost`;
- origens HTTP remotas não confiáveis continuam recusadas;
- timeout padrão do backend passou a 30 segundos;
- cliente faz uma segunda tentativa somente em leituras idempotentes;
- POST/DELETE de convites não são repetidos automaticamente;
- tela de erro agora sempre oferece `Entrar com outra conta`;
- saída usa escopo local e possui limpeza local de emergência sem depender da API.

## Comportamento obrigatório de acesso

- Google sempre apresenta seletor de contas.
- Uma identidade bloqueada pode sair e escolher outra conta.
- A troca de conta funciona mesmo quando a API está indisponível.
- O convite pendente é preservado durante a troca.
- Remover convite é uma ação separada e explícita.
- `member_not_authorized`, `member_pending` e `member_suspended` aparecem como estados distintos.
- Conta suspensa nunca é reativada.
- Uma identidade GitHub diferente não vira proprietária automaticamente.

## Identidade principal do proprietário

- proprietário auditado: `hepterstudios@gmail.com`;
- identidade retornada no primeiro teste GitHub: `mackson777@gmail.com`;
- essa segunda identidade deve permanecer bloqueada até existir um fluxo explícito de vinculação, iniciado por uma sessão proprietária já autorizada.

## Branches e PRs ativos

- PR #5 — `feat/rust-backend-clean`: backend Rust central e correção de CORS do Tauri.
- PR #3 — `fix/auth-membership-access`: autenticação e estrutura de acesso.
- PR #6 — `feat/auth-rust-api-integration`: frontend ligado à API.
- PR #1 — `feat/tauri2-rust-foundation`: fundação Tauri 2 + Rust.
- PR #7 — `feat/tauri-auth-rust-integration`: integração desktop completa e documentação.

Não achatar, retargetar ou mesclar PRs empilhados sem revisar histórico e ordem de integração.

## Atualização automática

Não ativar updater parcial. O plugin updater do Tauri exige assinatura criptográfica obrigatória.

Documento: `docs/UPDATER.md`.

Antes de implementar:

- certificado de assinatura de código Windows;
- par de chaves do updater;
- backup seguro da chave privada;
- endpoint HTTPS e manifesto;
- Release privada;
- teste de atualização e rollback.

Uma falha de atualização jamais pode impedir login ou uso da versão instalada.

## Matriz de testes antes de qualquer merge

- [ ] Proprietário entra com Google usando `hepterstudios@gmail.com`.
- [ ] Google mostra escolha de conta.
- [ ] Proprietário sai e entra com outra conta.
- [ ] Troca funciona com backend indisponível.
- [ ] Identidade GitHub não vinculada permanece bloqueada.
- [ ] Membro ativo antigo faz o primeiro vínculo.
- [ ] Membro ativo volta a entrar sem novo convite.
- [ ] Membro suspenso é bloqueado.
- [ ] Membro pendente vê estado correto.
- [ ] Identidade sem convite é bloqueada.
- [ ] Convite pessoal funciona com o e-mail correto.
- [ ] Convite pessoal falha com e-mail diferente.
- [ ] Convite rápido cria membro pendente.
- [ ] Administrador aprova membro pendente.
- [ ] Convite já usado não funciona novamente.
- [ ] Convite expirado e convite revogado são recusados.
- [ ] Callback funciona com o aplicativo fechado.
- [ ] Callback funciona com o aplicativo aberto.
- [ ] EXE instala, abre, autentica e desinstala corretamente.
- [ ] MSI instala e remove corretamente.
- [ ] Imagens, avatar e indicador online mantêm proporção e recorte.

## Próximas tarefas para o Codex

1. Esperar CI e deploy das correções CORS/troca de conta.
2. Baixar o instalador gerado pelo commit mais recente.
3. Testar proprietário pelo Google.
4. Criar fluxo explícito de vinculação de segunda identidade somente após o login do owner.
5. Adicionar testes automatizados para estados de acesso, troca local e preservação do convite.
6. Melhorar mensagens e diagnósticos sem expor detalhes internos.
7. Corrigir imagens dos Espaços, avatares e indicador online.
8. Implementar i18n estrutural antes do lançamento internacional.
9. Implementar updater somente conforme `docs/UPDATER.md`.
10. Planejar ordem segura de merge e executar nova rodada completa de CI.

## Critérios de aceite

- nenhuma regra crítica de autorização no React;
- nenhum acesso direto do frontend às tabelas ou RPCs sensíveis de convite;
- nenhuma conta suspensa reativada por convite;
- somente owner concede nível administrativo;
- convites aleatórios, hash SHA-256, uso único, expiração, revogação e consumo atômico;
- troca de conta disponível em qualquer estado bloqueante;
- CORS restrito somente às origens oficiais;
- nenhum merge até todos os testes reais estarem registrados como aprovados.
