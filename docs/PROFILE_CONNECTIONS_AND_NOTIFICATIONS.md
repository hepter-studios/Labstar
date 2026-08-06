# Labstar — contas conectadas e notificações v15

## Objetivo

Esta entrega adiciona contas públicas ao perfil interno sem tocar no sistema de login.

A pessoa continua entrando exatamente como já entra hoje. Dentro do próprio perfil do Labstar, ela pode informar o usuário ou colar o link do GitHub. O aplicativo busca os dados públicos e exibe usuário, nome, avatar, biografia, repositórios, seguidores, localização e link oficial para a equipe. O Instagram também pode ser adicionado como link público.

A conexão do GitHub:

- não usa `auth.linkIdentity`;
- não adiciona provedor de login;
- não troca a sessão existente;
- não altera convite, cargo ou permissão;
- não modifica o backend Rust de autorização.

## Arquivos principais

- `src/lib/profile-connections.ts`: importação do perfil público do GitHub e Instagram;
- `src/components/ProfileConnectionsBridge.tsx`: configuração dentro do perfil e exibição no diretório;
- `src/components/MemberQuickActions.tsx`: contas públicas no cartão rápido dos membros;
- `src/components/NotificationsPanel.tsx`: filtros, categorias, alertas do dispositivo e atualização em tempo real;
- `supabase/labstar-supabase-v15-profile-connections-notifications.sql`: colunas, RPCs, políticas e gatilhos;
- `supabase/labstar-supabase-v15b-profile-connections-no-auth.sql`: garantia explícita de que o GitHub é somente perfil público;
- `src/member-panel-tools.css`: acabamento responsivo e mobile.

## Funcionamento do GitHub

1. o membro abre o próprio perfil dentro do Labstar;
2. informa `@usuario` ou cola `https://github.com/usuario`;
3. o Labstar consulta a API pública do GitHub;
4. os dados públicos são gravados somente no perfil interno do membro;
5. outros membros podem abrir o perfil oficial no GitHub.

Nenhuma configuração de provedor OAuth, Client ID, Client Secret, Redirect URL ou Manual Identity Linking é necessária para este recurso.

## Migração do banco

Antes de aplicar:

1. confirme o projeto Supabase correto;
2. gere e baixe um backup;
3. revise o commit e os arquivos SQL completos;
4. execute `supabase/labstar-supabase-v15-profile-connections-notifications.sql`;
5. execute `supabase/labstar-supabase-v15b-profile-connections-no-auth.sql`;
6. valide os RPCs e o Realtime de `notifications`.

Também existe o workflow manual `.github/workflows/apply-profile-connections-v15.yml`, que cria um backup antes de executar as duas migrações.

## Eventos cobertos pela central de notificações

- mensagens diretas;
- chamadas de voz e vídeo, incluindo chamadas perdidas;
- respostas, menções e avisos em canais;
- reuniões criadas, alteradas ou canceladas;
- publicações sociais em revisão, agendadas ou publicadas;
- renovações e reativações de integrações;
- acessos pendentes, aprovados, suspensos ou com nível alterado;
- cargos profissionais adicionados ou removidos.

Notificações normais de canais não são enviadas para todos indiscriminadamente. Canais de anúncio notificam todos que possuem acesso; canais comuns notificam respostas e menções, reduzindo ruído.

## Matriz mínima de teste

- confirmar que o login atual continua igual antes e depois de adicionar o GitHub;
- adicionar GitHub por usuário e por link completo;
- atualizar e remover o GitHub do perfil;
- adicionar, alterar e remover o Instagram;
- abrir o cartão de outro membro e conferir os links públicos;
- gerar DM, menção, resposta, reunião, chamada perdida e mudança de cargo;
- marcar uma e todas as notificações como lidas;
- validar 320 px, 375 px, 430 px, tablet e desktop;
- confirmar que usuário suspenso continua bloqueado independentemente das contas públicas do perfil.
