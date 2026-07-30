# Labstar Desktop — Tauri 2 + Rust

## Objetivo

Transformar a Labstar em um aplicativo profissional para desktop e, depois, mobile, mantendo o frontend React existente e usando Rust como núcleo nativo seguro.

A aplicação web publicada no Cloudflare Pages continua funcionando durante toda a migração. A versão Tauri não substitui o Supabase: ela adiciona recursos locais, segurança nativa, diagnóstico, instaladores e integração com o sistema operacional.

## Responsabilidades por camada

### React + TypeScript

- interface e experiência do usuário;
- mapa de empresas e projetos;
- colaboração, mensagens, canais e reuniões;
- comunicação com Supabase para dados compartilhados e Realtime;
- estado visual e acessibilidade.

### Rust + Tauri 2

- ciclo de vida do aplicativo;
- armazenamento local durável e fila offline;
- logs e diagnóstico nativos;
- integração segura com arquivos, notificações e sistema operacional;
- atualização assinada do aplicativo;
- validação de entradas antes de operações privilegiadas;
- tarefas pesadas sem bloquear a interface;
- base para integrações nativas futuras.

### Supabase

- identidade e convites;
- banco de dados compartilhado;
- políticas RLS;
- mensagens, reuniões, notificações e Realtime;
- arquivos privados com URLs assinadas.

### Cloudflare Pages

- versão web/PWA;
- publicação automática da branch `main`;
- fallback quando o usuário não estiver usando o aplicativo instalado.

## Princípios obrigatórios

1. **Offline-first sem conflito silencioso**: alterações locais entram em uma fila com identificador, versão e horário; só são removidas após confirmação do servidor.
2. **Nenhum segredo no frontend**: chaves administrativas e tokens privados nunca entram no bundle React.
3. **Permissões mínimas**: cada janela Tauri recebe apenas as capabilities necessárias.
4. **IPC tipado**: todos os comandos Rust validam tamanho, formato e autorização dos dados recebidos.
5. **Erros observáveis**: falhas geram código, contexto e log; a interface nunca reduz tudo a “local” sem explicar o motivo.
6. **Atualizações assinadas**: releases de produção exigem assinatura e canal estável.
7. **Migração gradual**: a versão web continua operacional até o desktop atingir paridade e estabilidade.
8. **Testes antes da produção**: TypeScript, build web, `cargo fmt`, `cargo clippy`, `cargo test` e build Tauri.

## Fases

### Fase 0 — estabilização da sincronização

- diferenciar `offline`, `sem dados remotos`, `não autorizado`, `configuração ausente` e `erro do servidor`;
- exibir o erro real de leitura/gravação;
- validar a linha `labstar-main` e as políticas RLS de `workspaces`;
- impedir sobrescrita acidental por dados locais antigos;
- adicionar versão e `updated_at` ao workspace.

### Fase 1 — fundação Tauri 2

- criar `src-tauri`;
- janela principal, ícones e identificador de pacote;
- capability desktop mínima;
- comando nativo de diagnóstico;
- logs em arquivo com rotação;
- detecção web versus desktop;
- CI de Rust separada da publicação web.

### Fase 2 — armazenamento e sincronização robustos

- banco local SQLite;
- fila de operações pendentes;
- retries com backoff;
- resolução explícita de conflitos;
- indicador de sincronização detalhado;
- exportação de diagnóstico sem dados sensíveis.

### Fase 3 — experiência profissional de desktop

- instaladores Windows, macOS e Linux;
- bandeja do sistema;
- notificações nativas;
- atalhos e deep links;
- inicialização opcional com o sistema;
- atualização automática assinada;
- recuperação após falha.

### Fase 4 — colaboração em escala

- TURN próprio ou gerenciado para voz e vídeo;
- presença confiável e reconexão;
- anexos grandes com upload retomável;
- busca, indexação e histórico;
- integrações GitHub baseadas em backend seguro;
- auditoria de ações administrativas.

### Fase 5 — Android e iOS

- somente após estabilização desktop;
- capabilities específicas por plataforma;
- notificações push;
- armazenamento seguro de credenciais;
- adaptação de câmera, microfone e background.

## Critérios para considerar a versão profissional

- nenhuma perda de alteração durante queda de rede;
- nenhum estado “sincronizado” antes da confirmação do Supabase;
- recuperação automática depois de reinício ou crash;
- logs úteis e sem tokens/dados privados;
- atualização assinada e reversível;
- permissões nativas limitadas e auditáveis;
- testes automatizados das regras críticas;
- builds reproduzíveis e releases versionadas.
