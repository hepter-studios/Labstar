# Plano de execução do Codex — Labstar

Use este plano junto com `AGENTS.md`. O agente deve trabalhar na branch `feat/tauri-auth-rust-integration`, manter o PR #7 em rascunho e não fazer merge.

## Estado atual

O projeto já possui Web/PWA, Tauri 2 + Rust, autenticação, canais, DMs, arquivos, reuniões, configurações, busca global, visão geral, home operacional e tarefas/decisões compartilhadas.

Arquivos centrais da fase atual:

- `src/components/WorkHome.tsx`
- `src/components/WorkItemsCenter.tsx`
- `src/lib/work-items.ts`
- `src/components/CollaborationHub.tsx`
- `src/components/LegacyCollaborationHub.tsx`
- `src/components/DirectMessagesHubV5.tsx`
- `src/components/WorkspaceIntelligence.tsx`
- `src/components/GlobalSearchBridge.tsx`
- `src/main.tsx`

## Ordem de execução

### Bloco 1 — Estabilidade e auditoria

- Rodar `npm ci` e `npm run build`.
- Revisar erros de console e estados silenciosos.
- Localizar botões sem ação, handlers vazios e salvamentos falsos.
- Corrigir ou desabilitar com motivo visível.
- Garantir loading, vazio, sucesso e erro nas telas principais.
- Não permitir janela preta.

### Bloco 2 — Central de trabalho

- Refinar a home operacional.
- Completar tarefas, decisões e acompanhamentos.
- Adicionar edição completa.
- Adicionar responsável, prazo, prioridade, status e histórico.
- Adicionar “Minhas tarefas”, atrasadas, bloqueadas e concluídas.
- Converter mensagem em tarefa ou decisão.
- Relacionar item a canal, espaço, projeto e mensagem de origem.
- Evitar perda por atualização concorrente.
- Manter compatibilidade com o armazenamento atual em `workspaces/labstar-work-items-v1`.

### Bloco 3 — Canais e mensagens

- Validar altura total e rolagem.
- Manter composer na base útil.
- Corrigir anexos e imagens.
- Testar resposta, edição, exclusão e fixados.
- Adicionar menções e não lidas confiáveis.
- Melhorar busca no canal e menu de contexto.
- Integrar conversão de mensagem em tarefa/decisão.
- Exibir permissões e somente leitura claramente.

### Bloco 4 — DMs e presença

- Consolidar versões sem perder recursos.
- Remover presença online fixa.
- Implementar presença baseada em sinal real ou estado neutro.
- Testar não lidas, menções, favoritos e notas.
- Testar arquivos, respostas, edição, exclusão e fixados.
- Não fingir chamada de voz ou vídeo ativa.

### Bloco 5 — Visão geral e busca

- Usar dados reais.
- Manter resumo executivo funcional.
- Incluir tarefas e decisões na busca global.
- Abrir o resultado correto.
- Testar teclado, foco e ranking.
- Tratar falhas parciais sem apagar resultados válidos.

### Bloco 6 — Administração

- Cargos, escudos, cores e permissões.
- Convites, aprovação, suspensão e troca de conta.
- Categorias, canais e configurações por espaço.
- Configuração de e-mail/domínio.
- Persistência real e mensagens de erro específicas.

### Bloco 7 — Voz, vídeo e reuniões

- Teste e seleção de microfone/câmera.
- Medidor real de áudio.
- Estados reais de entrada e saída.
- Reuniões agendadas, ao vivo, concluídas e canceladas.
- Janela flutuante apenas quando suportada e testada.

### Bloco 8 — Identidade visual

- Corrigir proporção de avatar e logos.
- Corrigir indicador de presença.
- Preparar uso do ícone oficial quando o arquivo-fonte for fornecido.
- Gerar favicon, PWA e ícones Tauri do mesmo original.
- Revisar 1366×768, 1600×900 e 1920×1080.
- Revisar mobile sem quebrar desktop.

### Bloco 9 — Web/PWA

- Confirmar Preview e produção.
- Service worker somente na Web.
- Atualização do PWA com aviso claro.
- Offline apenas para shell seguro.
- Mesma sessão e dados do desktop.
- Não duplicar regra de produto.

### Bloco 10 — Updater desktop

Executar somente após estabilidade interna:

- seguir `docs/UPDATER.md`;
- updater oficial Tauri;
- assinatura obrigatória;
- manifesto HTTPS e `.sig`;
- canais interno e estável;
- “Instalar e reiniciar”;
- rollback seguro;
- chave privada fora do repositório.

### Bloco 11 — Consolidação

- Reduzir duplicação V2/V3/V4/V5 com migração segura.
- Remover código morto em commit separado.
- Dividir componentes grandes gradualmente.
- Não reescrever `App.tsx` inteiro.
- Atualizar documentação e matriz de testes.

## Gates por bloco

Executar no mínimo:

```bash
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
```

Quando possível:

```bash
npx tauri build --debug --no-bundle
```

Testar os fluxos alterados e relatar:

- comandos executados;
- resultado;
- arquivos principais;
- comportamento validado;
- limitações do ambiente;
- testes dependentes de Windows real.

## Regras de commit

Um commit por mudança coerente. Exemplos:

- `Corrige rolagem e composer dos canais`
- `Adiciona conversão de mensagem em tarefa`
- `Remove presença online simulada`
- `Refina tarefas atrasadas e bloqueadas`
- `Prepara updater assinado do Tauri`

Não criar um commit gigante chamado “termina tudo”.

## Critério final

Não basta compilar. O comportamento deve existir de ponta a ponta, persistir após recarregar, funcionar em Web e desktop e ter estados de erro recuperáveis.
