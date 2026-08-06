# Labstar — GitHub conectado e notificações v15

## Objetivo

Esta entrega adiciona **somente o GitHub** ao perfil interno do Labstar, sem tocar no sistema de login.

A pessoa continua entrando exatamente como já entra hoje. Dentro do próprio perfil, ela pressiona **Conectar ao GitHub**, autoriza um aplicativo OAuth separado e volta ao Labstar com o perfil confirmado. O nome, usuário, avatar, biografia, localização, repositórios e números públicos são exibidos no perfil da equipe, e o cartão é clicável para abrir o GitHub oficial.

A conexão do GitHub:

- não usa `auth.linkIdentity`;
- não adiciona nem remove métodos de login;
- não troca a sessão existente;
- não altera convite, cargo ou permissão;
- não modifica a autorização do backend Rust;
- não guarda o token do GitHub depois de importar os dados públicos.

## Fluxo profissional

1. o membro abre o próprio perfil no Labstar;
2. pressiona **Conectar ao GitHub**;
3. a função protegida valida a sessão e cria um `state` descartável de dez minutos;
4. o navegador abre `github.com/login/oauth/authorize`;
5. o GitHub devolve um código temporário ao callback do Supabase;
6. o servidor troca o código por um token temporário, consulta `/user` e confirma o proprietário;
7. somente os dados públicos verificados são salvos em `members.github_profile`;
8. o token não é persistido;
9. o perfil passa a mostrar selo verificado e link clicável para o GitHub.

## Configuração do aplicativo OAuth

Crie um aplicativo OAuth exclusivo para esta conexão de perfil. Ele não deve ser o aplicativo usado pelos logins do Labstar.

- Homepage URL: `https://labstar.pages.dev`
- Authorization callback URL: `https://pgzwyngxsxnheulvusdq.supabase.co/functions/v1/github-profile-connection?action=callback`

Cadastre no GitHub Actions:

- `SUPABASE_ACCESS_TOKEN`
- `GITHUB_PROFILE_CLIENT_ID`
- `GITHUB_PROFILE_CLIENT_SECRET`

O workflow `.github/workflows/deploy-github-profile-connection.yml` publica os segredos no Supabase e faz o deploy da função `github-profile-connection`.

## Banco

Depois de gerar backup, o workflow `.github/workflows/apply-profile-connections-v15.yml` aplica, nesta ordem:

1. `supabase/labstar-supabase-v15-profile-connections-notifications.sql`;
2. `supabase/labstar-supabase-v15b-profile-connections-no-auth.sql`;
3. `supabase/labstar-supabase-v15c-github-profile-oauth.sql`;
4. `supabase/labstar-supabase-v15d-notification-hardening.sql`.

A v15b remove a estrutura provisória do Instagram e elimina a função que permitia gravar um GitHub manualmente. O navegador só pode desconectar o próprio perfil; somente a função OAuth com `service_role` pode salvar um GitHub verificado.

## Arquivos principais

- `src/lib/profile-connections.ts`: início do OAuth e leitura do perfil;
- `src/components/ProfileConnectionsBridge.tsx`: botão, perfil verificado e desconexão;
- `src/components/MemberQuickActions.tsx`: GitHub clicável no cartão dos membros;
- `src/profile-connections.css`: acabamento isolado da conexão;
- `supabase/functions/github-profile-connection/index.ts`: estado, callback, troca do código e descarte do token;
- `src-tauri/src/profile_connections.rs`: validação nativa exclusiva da URL do GitHub;
- `src/components/NotificationsPanel.tsx`: central ampliada de notificações.

## Preservação das conversas privadas

As comunicações privadas 11.2.9 continuam em `DirectMessagesHubV6.tsx` e nos arquivos `direct-messages.css` até `direct-messages-v7.css`.

Uma regra mobile global criada durante o trabalho sobrescrevia `.workspace` e `.direct-hub`, fazendo a tela privada subir. Essa regra foi removida. Os estilos do GitHub agora ficam em `profile-connections.css` e não alteram altura, grade ou posição das conversas.

## Eventos cobertos pelas notificações

- mensagens diretas;
- chamadas de voz e vídeo, incluindo chamadas perdidas;
- respostas, menções e avisos em canais;
- reuniões criadas, alteradas ou canceladas;
- publicações em revisão, agendadas ou publicadas;
- renovações e reativações de integrações;
- acessos pendentes, aprovados, suspensos ou alterados;
- cargos adicionados ou removidos.

## Matriz mínima de teste

- confirmar que todos os métodos de login continuam iguais;
- conectar, reconectar e desconectar o GitHub;
- cancelar a autorização e testar `state` expirado;
- confirmar selo verificado e link clicável;
- abrir o GitHub de outro membro;
- confirmar que nenhum campo de Instagram aparece;
- abrir conversas privadas no desktop e mobile e confirmar que a tela não sobe;
- validar 320 px, 375 px, 430 px, tablet e desktop;
- confirmar que membro suspenso continua bloqueado independentemente do GitHub.
