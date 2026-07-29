# Labstar v11

Labstar é um ambiente privado de colaboração para organizar empresas, produtos,
projetos, equipes e pessoas. A versão 11 reúne o mapa operacional original com
espaços de colaboração, canais, mensagens, reuniões e integrações em uma PWA
responsiva para desktop e dispositivos móveis.

## Funcionalidades

- PWA instalável, com atualização automática do service worker;
- chat em tempo real com respostas, fixação, mensagens e anexos;
- miniaturas e visualizador de imagens em tela cheia;
- espaços, categorias e canais de texto, avisos, regras, voz e social;
- reuniões WebRTC por voz e vídeo;
- seleção, teste e medidor real do microfone com Web Audio API;
- Picture-in-Picture para vídeos em navegadores compatíveis;
- perfis, avatares, cargos profissionais e permissões;
- agendamento e cancelamento de reuniões com notificações;
- Central de Integrações para GitHub, Discord, monitoramento, cobrança e suporte;
- interface responsiva para desktop e mobile.

## Tecnologias

- React 19 e TypeScript;
- Vite 7;
- Supabase Auth, Database, Storage e Realtime;
- WebRTC e Web Audio API;
- Workbox por meio do `vite-plugin-pwa`;
- Cloudflare Pages como destino de publicação estática.

## Requisitos

- Node.js 22;
- npm compatível com o Node.js 22;
- projeto Supabase já preparado para o esquema da Labstar;
- navegador moderno;
- HTTPS em produção para PWA, câmera, microfone e Picture-in-Picture.

## Instalação local

```bash
git clone https://github.com/macksonvictor/Labstar.git
cd Labstar
npm ci
```

Copie o arquivo de exemplo:

```bash
cp .env.example .env.local
```

No Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Preencha as duas variáveis públicas do frontend e inicie o projeto:

```bash
npm run dev
```

O Vite informa a URL local no terminal. O servidor aceita conexões na rede local
por estar configurado com `host: "0.0.0.0"`.

## Variáveis de ambiente

| Variável | Visibilidade | Descrição |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Pública | URL do projeto Supabase usada pelo navegador. |
| `VITE_SUPABASE_ANON_KEY` | Pública | Chave `anon` legada ou `publishable` usada pelo cliente web e protegida por RLS. |

Variáveis com prefixo `VITE_` são incorporadas ao JavaScript do navegador e,
portanto, nunca podem conter segredos. Não configure `service_role`, chaves
privadas, tokens administrativos ou senhas no frontend, no Cloudflare Pages ou
em arquivos versionados. A chave `service_role` do Supabase ignora RLS e deve
permanecer exclusivamente em um backend confiável — a Labstar v11 não precisa
dela para o build.

O `.gitignore` bloqueia arquivos `.env*`, com exceção do `.env.example`.

## Comandos

```bash
npm run dev      # servidor de desenvolvimento
npm run build    # checagem TypeScript e build de produção em dist/
npm run preview  # pré-visualização local do build
```

O projeto não inclui uma suíte de testes automatizados. A validação disponível é
a checagem estrita do TypeScript seguida do build de produção; a mesma validação
é executada pelo GitHub Actions em todo push e pull request.

## Configuração do Supabase

> Atenção: não execute SQL contra produção sem backup, revisão e uma janela de
> mudança aprovada. Nenhum SQL deste repositório é executado automaticamente.

1. Confirme que o projeto Supabase de destino já contém as estruturas de
   colaboração usadas pela Labstar.
2. Revise os arquivos em `supabase/` antes de qualquer execução.
3. Em **Authentication > URL Configuration**, adicione a URL local e a URL
   publicada às URLs de redirecionamento permitidas.
4. Confirme o login por link mágico e o acesso apenas a membros ativos.
5. Confirme o bucket privado `labstar-files`, suas políticas e os limites de
   upload antes de habilitar anexos e avatares.
6. Confirme que Realtime está habilitado para as tabelas necessárias e que as
   políticas de `realtime.messages` permitem Presence e Broadcast dos canais de
   voz autorizados.
7. Use somente a URL e a chave pública no frontend.

### Arquivos SQL preservados

- `supabase/schema.sql`: base inicial legada de membros e mapa;
- `supabase/labstar-supabase-v6.sql`: perfis, cargos e reuniões;
- `supabase/labstar-supabase-v7.sql`: canais de voz e autorização Realtime;
- `supabase/labstar-supabase-v8.sql`: v7 mais Central de Integrações;
- `supabase/labstar-supabase-v8-hotfix.sql`: correção idempotente das políticas
  da Central de Integrações.

Os scripts v6–v8 são migrações incrementais e dependem de tabelas e funções de
versões intermediárias anteriores que não estão incluídas neste pacote. Para um
banco de produção existente, aplique somente as migrações ainda não instaladas.
Para um projeto Supabase totalmente novo, obtenha e revise primeiro as migrações
intermediárias originais; executar apenas `schema.sql` não cria toda a estrutura
necessária à v11.

## Build de produção

```bash
npm ci
npm run build
```

O resultado fica em `dist/`. O diretório é gerado, está no `.gitignore` e não
deve ser enviado ao GitHub.

O build gera:

- `manifest.webmanifest`;
- `sw.js` e runtime do Workbox;
- registro automático do service worker;
- precache do shell, estilos, scripts e ícones;
- limpeza de caches antigos;
- ativação imediata da versão nova com `skipWaiting` e `clientsClaim`.

As chamadas ao Supabase usam `NetworkOnly` para evitar cachear dados privados.

## Publicação no Cloudflare Pages

Este repositório está preparado para Cloudflare Pages, mas publicar o código no
GitHub não faz deploy externo automaticamente.

1. No Cloudflare Pages, conecte o repositório privado.
2. Selecione a branch de produção `main`.
3. Use `npm run build` como comando de build.
4. Use `dist` como diretório de saída.
5. Configure Node.js 22.
6. Cadastre `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no ambiente de build.
7. Após obter o domínio, inclua-o nas URLs permitidas do Supabase Auth.
8. Valide `_headers`, `_redirects`, o manifesto e o service worker em HTTPS.

Os arquivos `public/_headers` e `public/_redirects` são copiados para `dist/`.
Eles configuram o fallback da SPA e cabeçalhos de segurança compatíveis com
câmera e microfone.

O hostname do projeto Supabase atual também está permitido explicitamente em
`public/_headers` e na regra `NetworkOnly` de `vite.config.ts`. Se o projeto
Supabase mudar, atualize os dois arquivos antes do build.

## Instalação como PWA

A instalação exige uma publicação em HTTPS e ao menos uma visita pelo navegador.

### Windows

Abra a Labstar no Microsoft Edge ou Google Chrome, clique no ícone de instalação
na barra de endereço ou use **Menu > Aplicativos > Instalar Labstar**.

### macOS

No Chrome ou Edge, use o ícone de instalação. No Safari compatível, use
**Arquivo > Adicionar ao Dock**.

### Linux

Abra no Chrome, Chromium ou Edge e use o ícone de instalação ou
**Menu > Instalar Labstar**.

### Android

Abra no Chrome e toque em **Instalar app** ou **Adicionar à tela inicial**.

### iPhone e iPad

Abra no Safari, toque em **Compartilhar** e escolha
**Adicionar à Tela de Início**. O iOS não oferece o mesmo prompt automático dos
navegadores Chromium.

## Atualizações da PWA

O service worker é gerado com estratégia `autoUpdate`. Quando uma nova versão é
publicada, o navegador baixa os arquivos alterados, remove caches antigos e
assume o controle das páginas abertas assim que permitido pelo navegador. Se uma
instalação parecer desatualizada, feche todas as janelas da PWA e abra novamente.

## Limitações conhecidas

- Dados, autenticação e anexos dependem de conexão com o Supabase; o cache
  offline mantém apenas o shell estático da aplicação.
- WebRTC usa uma topologia entre participantes e um servidor STUN público.
  Redes corporativas restritivas podem exigir um serviço TURN para voz e vídeo.
- Câmera, microfone e Picture-in-Picture dependem das permissões e da
  compatibilidade do navegador e do sistema operacional.
- Picture-in-Picture e instalação PWA têm suporte mais limitado no iPhone e iPad.
- O bundle principal supera 500 kB minificado; o Vite emite um aviso de tamanho,
  mas o build é concluído normalmente.
- Não há testes automatizados além da checagem TypeScript e do build na CI.
- Um Supabase novo requer as migrações intermediárias originais, não presentes
  no pacote recebido, antes das migrações v6–v8.

## Segurança

- RLS deve permanecer habilitado em todas as tabelas com dados privados.
- O bucket de arquivos deve permanecer privado e usar URLs assinadas.
- `.env`, `dist`, `node_modules`, caches, logs e pacotes ZIP não são versionados.
- O repositório não contém nem utiliza chave `service_role`.
- O `override` de `ejs` no `package.json` mantém corrigida a cadeia de build da PWA.
- Revise dependências, políticas RLS, URLs de autenticação e cabeçalhos antes de
  cada publicação.
