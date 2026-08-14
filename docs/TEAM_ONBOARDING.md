# Guia interno para equipe e novos colaboradores

Este guia é a sequência obrigatória para qualquer pessoa ou agente Codex que começar a trabalhar no Labstar.

## 1. Antes de alterar código

1. Leia `README.md`.
2. Leia `docs/PROJECT_MAP.md`.
3. Leia `docs/ARCHITECTURE_DECISIONS.md`.
4. Consulte a Issue #8 e o PR relacionado à área que será alterada.
5. Confirme em qual branch a responsabilidade está implementada.
6. Nunca comece trabalhando diretamente na `main`.

## 2. Preparação local

Requisitos:

- Git;
- Node.js 22;
- npm;
- Rust estável para tarefas Tauri;
- Windows para validar os instaladores oficiais;
- acesso autorizado ao repositório privado.

```bash
git clone https://github.com/macksonvictor/Labstar.git
cd Labstar
npm ci
```

Crie `.env.local` a partir de `.env.example`. Use somente valores públicos no frontend.

Nunca solicite ou copie para arquivos locais compartilhados:

- senha do banco;
- `service_role`;
- OAuth Client Secret;
- token de sessão;
- token Fly.io;
- URL completa do banco com senha.

## 3. Escolha da branch

| Trabalho | Branch de referência |
| --- | --- |
| interface web atual | `main` ou branch derivada aprovada |
| API Rust | `feat/rust-backend-clean` |
| autenticação e membros | `fix/auth-membership-access` |
| integração interface/API | `feat/auth-rust-api-integration` |
| Tauri e Rust local | `feat/tauri2-rust-foundation` |
| aplicativo integrado | `feat/tauri-auth-rust-integration` |

Crie uma branch curta a partir da branch correta. Não use a `main` como base automática para uma correção que depende da integração.

## 4. Padrão de implementação

- mudanças pequenas e verificáveis;
- uma responsabilidade por commit;
- erros tipados e mensagens sem detalhes sensíveis;
- regras críticas no backend Rust;
- interface React sem acesso administrativo direto ao banco;
- nenhuma dependência nova sem justificar necessidade, manutenção e segurança;
- preservar compatibilidade com web e Tauri.

## 5. Validação mínima

### Interface

```bash
npm ci
npm run build
```

### Tauri/Rust

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --locked --manifest-path src-tauri/Cargo.toml --all-features
```

### Backend Rust

Na branch do backend, execute formatação, Clippy e testes usando o `Cargo.toml` do diretório `backend`.

Não marque uma tarefa como concluída só porque compilou. Fluxos de autenticação, convite e instalação exigem teste real.

## 6. Pull requests

Todo PR deve informar:

- problema resolvido;
- branch base correta;
- arquivos e camadas alterados;
- riscos de segurança;
- como foi validado;
- o que ainda falta;
- se gera novo instalador;
- se exige migração ou configuração externa.

PRs de autenticação, banco, Tauri e backend permanecem em rascunho até os testes reais.

## 7. Testes de identidade

Use contas e estados controlados. Nunca mude o banco apenas para fazer a tela passar.

Casos mínimos:

- proprietário `hepterstudios@gmail.com`;
- conta Google diferente;
- identidade GitHub ainda não vinculada;
- membro ativo;
- membro pendente;
- membro suspenso;
- usuário sem cadastro;
- convite pessoal correto e incorreto;
- convite rápido;
- convite reutilizado, expirado e revogado.

Ao testar troca de conta, confirme que o convite pendente não foi perdido.

## 8. Build do Windows

Não versione `.exe`, `.msi` ou ZIP de Artifact.

Use:

1. GitHub Actions;
2. workflow `Gerar instalador Windows integrado`;
3. execução verde da branch correta;
4. Artifacts `labstar-windows-x64-nsis` e `labstar-windows-x64-msi`.

Registre o commit usado no teste. Não compare telas de instaladores gerados por commits diferentes.

## 9. Banco e backup

Antes de SQL em ambiente real:

1. confirmar o projeto Supabase;
2. gerar backup novo;
3. baixar o Artifact;
4. revisar o SQL;
5. executar uma etapa;
6. registrar resultado;
7. só então continuar.

Nunca executar todas as migrações de uma vez sem janela de recuperação.

## 10. Comunicação interna

Ao terminar uma mudança, registre no PR ou issue:

- o que mudou;
- commit;
- screenshots relevantes sem dados sensíveis;
- resultado dos testes;
- problemas ainda existentes;
- próximo passo exato.

Não use mensagens vagas como “corrigido” ou “funciona”. Mostre o cenário validado.

## 11. Definição de pronto

Uma mudança só está pronta quando:

- código revisado;
- CI verde;
- teste real concluído quando aplicável;
- documentação atualizada;
- nenhuma credencial exposta;
- nenhuma regressão na arquitetura;
- instalador novo gerado quando necessário;
- issue e PR refletem o estado real.

## 12. Proibições

- commit direto na `main` sem processo aprovado;
- force push em branch compartilhada;
- merge de PR empilhado fora de ordem;
- autorização crítica no React;
- segredo em `.env.example`;
- logar bearer token ou convite;
- vincular identidade social ao proprietário automaticamente;
- distribuir build sem assinatura como versão pública.
