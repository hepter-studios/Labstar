# Prompt para copiar no Codex

Cole a mensagem abaixo no Codex conectado ao repositório `macksonvictor/Labstar`:

---

Trabalhe no Labstar na branch `feat/tauri-auth-rust-integration` e mantenha o PR #7 em rascunho. Não faça merge.

Antes de editar, leia integralmente:

- `AGENTS.md`
- `docs/CODEX_EXECUTION_PLAN.md`
- `docs/CODEX_HANDOFF.md`
- `docs/PROJECT_MAP.md`
- `docs/UPDATER.md`

Confirme a branch, rode `npm ci` e `npm run build` para estabelecer a linha de base.

Continue do primeiro bloco incompleto em `docs/CODEX_EXECUTION_PLAN.md`. Não responda apenas com um plano: inspecione, implemente, execute os gates, corrija erros e faça commits pequenos e descritivos.

Prioridade imediata:

1. auditar estabilidade, botões mortos e salvamentos falsos;
2. refinar `WorkHome`, `WorkItemsCenter` e `work-items.ts`;
3. completar tarefas, decisões, responsáveis, prazos, filtros e histórico;
4. permitir converter mensagem de canal em tarefa ou decisão;
5. corrigir canais, composer, anexos, rolagem e estados vazios;
6. remover presença online simulada e usar sinal real ou estado neutro;
7. manter Web e Tauri com os mesmos dados e regras.

Regras obrigatórias:

- não remover funcionalidades para facilitar;
- não reescrever `App.tsx` inteiro;
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

> Continue o Labstar na branch `feat/tauri-auth-rust-integration`. Siga `AGENTS.md` e `docs/CODEX_EXECUTION_PLAN.md`. Retome do primeiro bloco ainda incompleto, implemente de ponta a ponta, execute os gates e faça commits pequenos. Não remova funcionalidades, não faça merge e não pare apenas em planejamento.
