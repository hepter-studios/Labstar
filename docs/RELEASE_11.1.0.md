# Labstar 11.1.0 — candidato interno

## Entregas desta rodada

- home operacional da Central de trabalho;
- navegação entre Início, Canais e Mensagens diretas;
- prioridades, notificações, reuniões e atividade recente;
- arquivos recentes e atalhos rápidos;
- captura rápida de atualização para canais;
- tarefas, decisões e acompanhamentos compartilhados;
- responsável, prazo, prioridade e status;
- filtros para itens pessoais, abertos, decisões e concluídos;
- abertura do canal relacionado;
- busca global persistente;
- visão geral e resumo executivo aprimorados;
- correções de altura da área de canais;
- ilustração de DMs sem fundo opaco;
- presença online simulada removida;
- instruções completas para o Codex em `AGENTS.md`;
- plano de execução em `docs/CODEX_EXECUTION_PLAN.md`;
- prompt copiável em `docs/CODEX_START_PROMPT.md`.

## Persistência das tarefas

Os itens são armazenados no mesmo Supabase usado pela Web e pelo desktop, na linha:

```text
workspaces / labstar-work-items-v1
```

Isso permite compartilhamento imediato sem exigir migração nova. Uma tabela própria pode ser criada futuramente, desde que exista migração segura dos dados atuais.

## Validação desta rodada

- build TypeScript/Vite validado no Preview da branch;
- versões alinhadas em `package.json`, `Cargo.toml` e `tauri.conf.json`;
- build Windows preparado por `scripts/build-windows.ps1`;
- NSIS e MSI devem ser gerados em `artifacts/windows/`.

## Ainda exige teste manual

- instalar o NSIS 11.1.0 no Windows;
- confirmar atualização sobre 11.0.4;
- validar a home operacional em 1366×768 e 1920×1080;
- criar, atualizar, concluir e remover uma tarefa;
- abrir o mesmo item na Web e no desktop;
- validar canais, anexos e DMs no WebView2;
- testar microfone, câmera e notificações do Windows.

## Próximos blocos

- converter mensagem em tarefa ou decisão;
- histórico e proteção contra edição concorrente;
- presença real com heartbeat/Realtime;
- consolidação das versões de DMs;
- auditoria completa de botões e salvamentos;
- identidade visual oficial;
- updater Tauri assinado.
