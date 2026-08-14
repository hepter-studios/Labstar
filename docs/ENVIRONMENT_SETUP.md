# Labstar — ambientes, variáveis e secrets

Este documento lista **nomes, finalidade e local de configuração**. Valores secretos nunca devem ser registrados no repositório.

## Princípio

Existem três classes de configuração:

1. **pública** — pode ser incorporada ao frontend;
2. **privada de servidor** — somente backend/infraestrutura;
3. **credencial de publicação/assinatura** — somente CI/CD e cofre restrito.

## Frontend web e Tauri

Arquivo de exemplo: `.env.example`.

| Variável | Classe | Finalidade |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | pública | URL HTTPS do projeto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | pública | chave publicável usada pelo cliente Supabase |
| `VITE_LABSTAR_API_URL` | pública | URL HTTPS da API Rust |

### Regra crítica das variáveis VITE

Tudo que começa com `VITE_` pode terminar dentro do JavaScript distribuído. Portanto **nunca** coloque:

- `service_role`;
- `sb_secret_*`;
- senha PostgreSQL;
- client secret OAuth;
- token GitHub;
- token Fly.io;
- chave privada de assinatura.

## GitHub Actions Secrets

Configuração:

`Repository → Settings → Secrets and variables → Actions`

Secrets usados atualmente:

| Secret | Consumidor | Finalidade |
| --- | --- | --- |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | build Windows | injeta a chave pública no aplicativo compilado |
| `SUPABASE_DATABASE_URL` | backup manual | conecta a ferramenta de backup ao PostgreSQL |
| `FLY_API_TOKEN` | deploy do backend | autoriza publicação da API na Fly.io |

O secret existe no GitHub; o valor não deve aparecer em README, issue, PR, commit ou log.

## Fly.io Secrets

Aplicação atual do backend: `labstar-api-mackson`.

Secrets necessários no ambiente do backend:

| Secret | Finalidade |
| --- | --- |
| `SUPABASE_URL` | endpoint do projeto para validação de Auth |
| `SUPABASE_PUBLISHABLE_KEY` | chave usada nas chamadas apropriadas ao Supabase Auth |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin API do Auth e RPC final acessível somente ao serviço |

Configuração não secreta de produção fica em `backend/fly.toml`, incluindo bind, origens permitidas, timeout e logs.

## Origens CORS oficiais

O backend deve aceitar somente as origens necessárias ao produto. Atualmente:

- `https://labstar.pages.dev`
- `http://tauri.localhost`
- `https://tauri.localhost`
- `tauri://localhost`

Para desenvolvimento local são aceitos também os endereços localhost documentados no backend.

Não liberar `*` para endpoints autenticados.

## Supabase Auth

### Site URL

Produção web:

`https://labstar.pages.dev/`

### Redirect URLs necessárias

- `https://labstar.pages.dev/`
- `https://labstar.pages.dev/?invite=*`
- `labstar://auth/callback`
- `labstar://auth/callback?invite=*`

## Google OAuth

O Google é provedor de identidade. A autorização de membro não é concedida pelo Google.

Configuração secreta do Client ID/Client Secret deve permanecer no painel apropriado do provedor/Supabase, nunca no código.

O aplicativo solicita `prompt=select_account` para permitir a escolha explícita de conta.

## GitHub OAuth

O GitHub também comprova identidade; ele não transforma automaticamente uma conta em owner/admin.

Client ID/Client Secret permanecem no ambiente de autenticação, não em `.env` versionado.

Uma segunda identidade social só deve ser vinculada a um membro privilegiado por fluxo explícito e autenticado.

## Banco PostgreSQL

A string completa de conexão contém senha e é secreta.

Regras:

- usar SSL;
- armazenar somente em secrets;
- não colar em chat, issue ou PR;
- se for exposta, rotacionar;
- atualizar todos os consumidores depois de rotação;
- validar `/health/ready` após alteração.

## Cloudflare Pages

A aplicação web pública atual é servida por Cloudflare Pages.

Antes de trocar a produção:

1. confirmar branch/commit de destino;
2. build verde;
3. variáveis públicas corretas;
4. autenticação testada;
5. rollback conhecido.

Não alterar a produção web como efeito colateral de um teste de desktop.

## Assinatura digital e updater — ainda não ativados

Futuros secrets de assinatura devem ser definidos somente quando as chaves definitivas existirem.

Nunca versionar:

- chave privada do updater;
- senha da chave;
- certificado de assinatura;
- senha do certificado;
- token de publicação de release.

Plano oficial: `UPDATER.md` e Issue #9.

## Recuperação quando um secret é perdido

1. identificar exatamente qual serviço consome o secret;
2. criar/rotacionar no serviço de origem;
3. atualizar o cofre correspondente;
4. nunca colocar o valor em código para “resolver rápido”;
5. executar CI/deploy;
6. validar saúde e fluxo real;
7. registrar somente que a rotação ocorreu, sem registrar o valor.

## Checklist de ambiente novo

- [ ] projeto Supabase criado/configurado;
- [ ] Auth Google;
- [ ] Auth GitHub;
- [ ] Redirect URLs;
- [ ] banco restaurado/migrado;
- [ ] Fly Secrets;
- [ ] GitHub Actions Secrets;
- [ ] Cloudflare Pages;
- [ ] health live/ready;
- [ ] CORS Tauri;
- [ ] build Windows;
- [ ] login do proprietário;
- [ ] troca de conta;
- [ ] testes de membros e convites.
