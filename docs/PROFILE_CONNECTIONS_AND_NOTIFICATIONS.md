# Labstar — contas conectadas e notificações v15

## Objetivo

Esta entrega separa a forma de entrada da identidade profissional pública.

Uma pessoa pode continuar entrando com o e-mail autorizado e, dentro do próprio perfil, conectar uma conta GitHub separadamente. O GitHub conectado é verificado pelo OAuth do Supabase e exibido para a equipe com usuário, nome, avatar, biografia, repositórios públicos, seguidores e link oficial. O Instagram é um link público opcional configurado pelo próprio membro.

A conexão GitHub não concede acesso ao Labstar, não altera cargo, não transforma o membro em administrador e não substitui as regras do backend Rust.

## Arquivos principais

- `src/lib/profile-connections.ts`: OAuth, sincronização do perfil público e Instagram;
- `src/components/ProfileConnectionsBridge.tsx`: configuração dentro do perfil e exibição no diretório;
- `src/components/MemberQuickActions.tsx`: contas públicas no cartão rápido de membros;
- `src/components/NotificationsPanel.tsx`: filtros, categorias, alertas do dispositivo e atualização em tempo real;
- `supabase/labstar-supabase-v15-profile-connections-notifications.sql`: colunas, RPCs, políticas e gatilhos;
- `src/member-panel-tools.css`: acabamento responsivo e mobile.

## Configuração obrigatória no Supabase

Em `Authentication → Settings`, habilite **Manual Identity Linking**.

O provedor GitHub precisa continuar configurado com Client ID e Client Secret válidos. Adicione aos Redirect URLs:

- a origem web de produção do Labstar;
- as origens de desenvolvimento usadas pela equipe;
- `labstar://auth/callback` para o aplicativo Tauri.

O fluxo desktop usa a ponte nativa existente e retorna pelo deep link `labstar://auth/callback`.

## Migração do banco

Antes de aplicar:

1. confirme o projeto Supabase correto;
2. gere e baixe um backup;
3. revise o commit e o arquivo SQL completo;
4. execute somente `supabase/labstar-supabase-v15-profile-connections-notifications.sql`;
5. valide os RPCs e o Realtime de `notifications`.

A migração é idempotente e não remove dados existentes.

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

- entrar por magic link e conectar um GitHub com o mesmo e com outro e-mail;
- reiniciar o app desktop durante o retorno OAuth;
- atualizar e desconectar o GitHub;
- adicionar, alterar e remover o Instagram;
- abrir o cartão de outro membro e conferir os links públicos;
- gerar DM, menção, resposta, reunião, chamada perdida e mudança de cargo;
- marcar uma e todas as notificações como lidas;
- validar 320 px, 375 px, 430 px, tablet e desktop;
- confirmar que usuário suspenso continua bloqueado mesmo com GitHub conectado.
