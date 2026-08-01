# Prompt para copiar no Codex

Cole a mensagem abaixo no Codex conectado ao repositório `macksonvictor/Labstar`:

---

Trabalhe no Labstar na branch `feat/tauri-auth-rust-integration` e mantenha o PR #7 em rascunho. Não faça merge.

Antes de editar, leia integralmente:

- `AGENTS.md`
- `docs/PRODUCT_SURFACES.md`
- `docs/RELEASE_11.2.0.md`
- `docs/CODEX_EXECUTION_PLAN.md`
- `docs/CODEX_HANDOFF.md`
- `docs/PROJECT_MAP.md`
- `docs/UPDATER.md`

Confirme a branch, rode `npm ci` e `npm run build` para estabelecer a linha de base.

O Labstar 11.2.0 definiu limites permanentes:

- Dashboard contém gestão, tarefas, decisões, reuniões, alertas, atividade e arquivos;
- Central de trabalho abre diretamente com servidores, categorias, canais e chat;
- servidores não podem desaparecer atrás de uma home intermediária;
- DMs pertencem à navegação lateral da Central de trabalho;
- mensagens podem virar tarefa, decisão ou acompanhamento;
- o composer deve permanecer preso à base da área útil.

Não reverta essa separação.

Continue do primeiro bloco incompleto em `docs/CODEX_EXECUTION_PLAN.md`. Não responda apenas com um plano: inspecione, implemente, execute os gates, corrija erros e faça commits pequenos e descritivos.

Prioridade imediata:

1. validar visualmente Dashboard, servidores e altura do chat nas resoluções exigidas;
2. auditar estabilidade, botões mortos e salvamentos falsos;
3. consolidar tarefas/decisões sem perder a conversão de mensagens;
4. completar menções, não lidas, histórico e filtros;
5. fortalecer anexos, respostas, edição, exclusão, fixados e estados vazios;
6. implementar presença real por heartbeat/Realtime ou manter estado neutro;
7. consolidar DMs, voz, vídeo e reuniões sem interfaces falsas;
8. manter Web e Tauri com os mesmos dados e regras;
9. aplicar identidade visual oficial quando o arquivo-fonte estiver disponível;
10. implementar updater assinado apenas depois da estabilidade funcional.

Regras obrigatórias:

- não remover funcionalidades para facilitar;
- não reescrever `App.tsx` inteiro;
- não misturar Dashboard e Central de trabalho;
- não esconder servidores atrás de filtros ou botões intermediários;
- não desativar RLS;
- não expor segredos;
- não usar presença online fixa;
- não deixar botão sem função fingindo sucesso;
- não gerar updater inseguro;
- não usar a branch `build/windows-cross-cloudflare`;
- não fazer merge.

Execute ao menos:

```bash
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
```

Quando o ambiente permitir, execute também:

```bash
npx tauri build --debug --no-bundle
```

Ao final de cada bloco, informe:

- o que foi implementado;
- commits criados;
- testes executados e resultados;
- arquivos principais alterados;
- riscos ou testes que ainda dependem de Windows real;
- próximo bloco.

Continue trabalhando até concluir de ponta a ponta o bloco atual e seus critérios. Não pare em análise.

---

## Prompt curto para retomadas

> Continue o Labstar na branch `feat/tauri-auth-rust-integration`. Leia `AGENTS.md`, `docs/PRODUCT_SURFACES.md` e `docs/CODEX_EXECUTION_PLAN.md`. Preserve a separação entre Dashboard e Central de trabalho, retome do primeiro bloco incompleto, implemente de ponta a ponta, execute os gates e faça commits pequenos. Não remova funcionalidades, não faça merge e não pare apenas em planejamento.
