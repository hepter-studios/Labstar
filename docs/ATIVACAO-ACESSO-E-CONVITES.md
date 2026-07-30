# Ativação do acesso profissional do Labstar

Esta mudança deve ser feita em uma única janela controlada. Não publique o frontend novo antes de o banco, os provedores e os retornos web/desktop estarem preparados.

## Resultado esperado

- entrada principal com Google ou GitHub;
- link por e-mail somente como alternativa para identidades já existentes;
- convite rápido de uso único, com aprovação administrativa;
- convite pessoal de uso único, preso ao e-mail informado;
- vínculo permanente do membro ao `auth.uid()`;
- membros suspensos continuam bloqueados;
- pessoas autenticadas, mas não autorizadas, não recebem dados;
- somente o proprietário pode conceder nível administrativo em um convite;
- web e aplicativo Tauri usam a mesma autorização interna.

## 1. Preparação

1. Confirmar que a publicação atual continua funcionando.
2. Fazer backup do banco Supabase ou garantir um ponto de restauração.
3. Manter os Pull Requests de autenticação e Tauri em rascunho.
4. Não executar SQL parcialmente durante o horário de uso da equipe.
5. Não colar Client Secret, chave secreta ou `service_role` no GitHub, Cloudflare, React ou Tauri.

## 2. Opções gerais do Supabase Auth

No Supabase, abrir **Authentication → Sign In / Providers**.

Manter:

- **Allow new users to sign up:** ligado. O provedor precisa criar a identidade Auth do convidado novo; quem decide o acesso ao Labstar é o convite e o banco interno.
- **Allow manual linking:** desligado nesta fase. A associação manual entre Google e GitHub será habilitada somente depois de uma tela própria com reautenticação.
- **Allow anonymous sign-ins:** desligado.
- **Confirm email:** ligado.

Não usar agora:

- **OAuth Apps**;
- **OAuth Server**.

Essas telas servem para fazer o Supabase atuar como provedor OAuth para outros aplicativos. O Labstar, nesta fase, apenas usa Google e GitHub como provedores de identidade dentro de **Sign In / Providers**.

## 3. Configurar URLs do Supabase Auth

No Supabase, abrir **Authentication → URL Configuration**.

Configurar:

- Site URL: `https://labstar.pages.dev`
- Redirect URL web de produção: `https://labstar.pages.dev/**`
- Redirect URL desktop instalada: `labstar://auth/callback`
- Redirect local usado no desenvolvimento, quando necessário.

A URL usada pelo parâmetro `redirectTo` do cliente precisa estar na lista de URLs permitidas do Supabase. Em produção, prefira URLs exatas sempre que possível.

## 4. Habilitar Google

1. No Supabase, abrir **Authentication → Sign In / Providers → Google**.
2. Copiar a Callback URL exibida pelo próprio Supabase.
3. No Google Auth Platform, criar um cliente OAuth do tipo **Web application**.
4. Usar `https://labstar.pages.dev` como origem JavaScript autorizada para a versão web.
5. Usar a Callback URL copiada do Supabase como redirect URI autorizado.
6. Copiar Client ID e Client Secret para o painel do provedor Google no Supabase.
7. Ativar o provedor e salvar.

O Client Secret fica somente no painel do Supabase. Nunca deve ser colocado no GitHub, Cloudflare, frontend ou Tauri.

## 5. Habilitar GitHub

1. No Supabase, abrir **Authentication → Sign In / Providers → GitHub**.
2. Copiar a Callback URL exibida pelo próprio Supabase.
3. No GitHub, criar um **OAuth App**.
4. Homepage URL: `https://labstar.pages.dev`
5. Authorization callback URL: usar a Callback URL copiada do Supabase.
6. Copiar Client ID e Client Secret para o painel do provedor GitHub no Supabase.
7. Ativar o provedor e salvar.

O Client Secret fica somente no painel do Supabase.

## 6. Atualizar o banco

Executar os arquivos completos, nesta ordem:

1. `supabase/labstar-supabase-v9-auth.sql`
2. `supabase/labstar-supabase-v10-invite-links.sql`
3. `supabase/labstar-supabase-v10-auth-hardening.sql`

Não executar apenas trechos selecionados. Se qualquer arquivo falhar, não publicar o frontend até revisar o erro.

## 7. Integração com o aplicativo Tauri

O aplicativo instalado registra:

```text
labstar://auth/callback
labstar://invite/<token>
```

O Rust valida esquema, host, caminho, parâmetros e tamanho antes de entregar o retorno ao React. No Windows e Linux, uma segunda abertura envia o deep link para a instância já aberta. Links recebidos antes do frontend carregar ficam em uma fila nativa temporária.

O aplicativo não armazena Client Secret. O navegador do sistema executa o login e retorna apenas um código temporário para o aplicativo trocar com o Supabase usando PKCE.

## 8. Testes antes do merge

Testar em uma publicação de Preview e em um instalador de teste:

1. Proprietário existente entra e continua como proprietário.
2. Membro ativo existente entra e permanece com o mesmo cargo e permissões.
3. Usuário suspenso vê a tela de conta suspensa e não recebe dados.
4. Usuário sem convite autentica, mas vê acesso não autorizado.
5. Convite rápido funciona uma vez e cria membro pendente.
6. O administrador aprova o membro pendente e ele consegue entrar novamente sem convite.
7. Convite pessoal rejeita um e-mail diferente.
8. Convite pessoal correto funciona uma vez e não pode ser reutilizado.
9. Administrador não consegue criar convite com nível administrativo.
10. Proprietário consegue criar convite administrativo conscientemente.
11. Google e GitHub retornam para `https://labstar.pages.dev` sem perder o token do convite.
12. Google e GitHub retornam para `labstar://auth/callback` no aplicativo instalado.
13. Abrir um segundo link traz a janela instalada para frente, sem abrir duas instâncias.
14. Link com host, token ou parâmetro inválido é rejeitado pelo Rust.
15. Sair e entrar novamente não remove o vínculo do membro.

## 9. Publicação

Somente depois dos testes:

1. Marcar os Pull Requests como prontos para revisão.
2. Confirmar que o GitHub Actions concluiu os builds web e Rust com sucesso.
3. Integrar autenticação e Tauri em uma branch de preparação.
4. Testar o instalador assinado.
5. Fazer merge controlado na `main`.
6. Aguardar o Cloudflare Pages publicar.
7. Repetir os testes essenciais em produção.

## 10. Recuperação

Em caso de falha no frontend, reverter o deployment do Cloudflare para a última versão funcional. Não remover as colunas novas do banco durante uma emergência; elas são compatíveis com os membros antigos e devem ser revertidas apenas com uma migração revisada.

Em caso de falha no aplicativo instalado, interromper a distribuição daquele instalador e manter a versão web disponível enquanto uma nova versão assinada é preparada.
