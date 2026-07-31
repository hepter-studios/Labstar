# Contribuindo com o Labstar

Este é um projeto privado. Somente colaboradores autorizados podem abrir branches, issues, pull requests, builds ou acessar documentação operacional.

## Leitura obrigatória

Antes da primeira alteração:

1. `README.md`;
2. `docs/PROJECT_MAP.md`;
3. `docs/TEAM_ONBOARDING.md`;
4. `docs/ARCHITECTURE_DECISIONS.md`;
5. issue e PR relacionados ao trabalho.

## Branch correta

Não comece automaticamente pela `main`.

- backend Rust: derive de `feat/rust-backend-clean`;
- autenticação e membros: derive de `fix/auth-membership-access`;
- integração da interface com API: derive de `feat/auth-rust-api-integration`;
- Tauri/Rust local: derive de `feat/tauri2-rust-foundation`;
- aplicativo integrado: derive de `feat/tauri-auth-rust-integration`.

Use nomes curtos:

- `fix/...` para correções;
- `feat/...` para funcionalidades;
- `docs/...` para documentação;
- `test/...` para testes;
- `chore/...` para manutenção.

## Commits

Um commit deve ter uma responsabilidade clara e mensagem em português ou inglês consistente.

Exemplos:

- `Corrige troca de conta quando a API está indisponível`;
- `Permite origem oficial do Tauri no CORS`;
- `Documenta processo de assinatura do updater`.

Não misture refatoração ampla, migração e mudança visual no mesmo commit.

## Pull request

Todo PR precisa informar:

- objetivo;
- branch base;
- arquitetura afetada;
- riscos;
- testes executados;
- screenshots sem dados sensíveis, quando úteis;
- impacto em instalador, banco e infraestrutura;
- plano de rollback;
- itens ainda pendentes.

PRs empilhados permanecem em rascunho até a validação real.

## Validação

### Web

```bash
npm ci
npm run build
```

### Tauri

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --locked --manifest-path src-tauri/Cargo.toml --all-features
```

### Backend

Execute os equivalentes no diretório `backend` da branch correspondente.

A CI verde é obrigatória, mas não substitui testes reais de OAuth, convite, instalação ou migração.

## Segurança

Nunca envie:

- senha do banco;
- `service_role`;
- OAuth Client Secret;
- token Fly.io;
- chave privada do updater;
- certificado ou senha de assinatura;
- bearer token;
- token completo de convite;
- backup de produção;
- `.env.local`.

Variáveis `VITE_` são públicas e não podem receber segredo.

## Banco

Mudanças no banco exigem:

1. issue;
2. backup novo;
3. revisão do SQL;
4. execução de uma migração por vez;
5. validação da API e da matriz de acesso;
6. documentação e rollback.

## Dependências

Antes de adicionar pacote:

- confirme que não existe solução já presente;
- verifique manutenção e licença;
- evite dependência para tarefa pequena;
- revise impacto no bundle e superfície de ataque;
- atualize lockfiles;
- documente o motivo no PR.

## Interface

- preservar proporções de imagens;
- não esconder erros de acesso;
- sempre oferecer recuperação ou troca de conta;
- validar teclado, foco, contraste e textos longos;
- testar resoluções definidas no checklist;
- preparar novos textos para futura internacionalização.

## Regra crítica

Nenhum colaborador deve fazer merge, publicar nova produção, distribuir instalador ou alterar secrets sem autorização do proprietário e evidências do checklist aplicável.
