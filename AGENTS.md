# AGENTS.md — Labstar

Este arquivo é a instrução operacional para qualquer agente de código que trabalhar neste repositório. Leia-o inteiro antes de alterar arquivos.

## 1. Missão do produto

Labstar é uma plataforma privada de operação empresarial que une:

- estrutura de empresas, áreas, produtos e projetos;
- espaços, categorias e canais;
- mensagens diretas e conversas de equipe;
- arquivos, reuniões, voz e vídeo;
- tarefas, decisões, prazos e responsáveis;
- cargos, permissões, convites e segurança;
- integrações, alertas, renovações e automações;
- cliente Web/PWA e aplicativo desktop Tauri 2 + Rust.

O objetivo não é copiar o Discord. O objetivo é combinar comunicação, gestão e operação diária em uma experiência mais útil para equipes e startups.

## 2. Branch e PR de trabalho

- Repositório: `macksonvictor/Labstar`.
- Branch ativa: `feat/tauri-auth-rust-integration`.
- PR ativo: `#7`.
- O PR permanece em rascunho.
- Não fazer merge no `main` sem autorização explícita do proprietário.
- Não trabalhar na branch experimental `build/windows-cross-cloudflare`.
- Não apagar funcionalidades existentes para simplificar a tarefa.

Antes de editar:

```bash
git status
git branch --show-current
git pull --ff-only
```

Se a branch ativa não for `feat/tauri-auth-rust-integration`, pare e corrija antes de continuar.

## 3. Princípios obrigatórios

1. Preserve o que já existe. Corrija e evolua; não substitua grandes áreas sem necessidade.
2. Web e desktop representam o mesmo produto, conta e dados.
3. Toda tela deve funcionar em Web e Tauri, salvo recurso explicitamente nativo.
4. Nenhuma operação crítica deve existir apenas como botão visual.
5. Um botão sem implementação deve ficar desabilitado com motivo visível, nunca fingir sucesso.
6. Nenhum erro pode deixar a janela preta. Use `SurfaceBoundary` e estados de erro visíveis.
7. Não bloquear o primeiro render por chamadas Rust, rede, preferências ou deep link.
8. Não expor segredos no frontend, logs, commits, documentação ou artefatos.
9. Não usar `service_role` no React/Tauri.
10. Não relaxar RLS para “fazer funcionar”.
11. Não inventar presença online. Mostrar online apenas com sinal real; caso contrário usar estado neutro/offline.
12. Não deformar imagens. Logos e avatares devem manter proporção e recorte controlado.
13. Não gerar instalador a cada ajuste pequeno. Trabalhar em lotes, validar e só então versionar.
14. Commits pequenos, descritivos e reversíveis.
15. Nunca declarar “pronto” sem executar os gates definidos neste arquivo.

## 4. Arquitetura atual

### Frontend

- React + TypeScript + Vite.
- Entrada: `src/main.tsx`.
- Aplicação legada principal: `src/App.tsx`.
- Componentes novos são isolados e montados por superfícies opcionais quando isso reduz risco.
- CSS modular por área, importado em `src/main.tsx`.

### Desktop

- Tauri 2.
- Rust em `src-tauri/`.
- Chamadas nativas e transporte seguro em `src-tauri/src/`.
- O desktop usa o mesmo frontend, mas não deve registrar PWA/service worker.
- O primeiro render React deve acontecer antes da inicialização nativa.

### Dados e autenticação

- Supabase Auth e banco com RLS.
- API central Rust/Fly para regras críticas.
- `/v1/me` usa Rust como autoridade quando disponível e fallback RLS de leitura para disponibilidade.
- Convites, alterações administrativas e operações críticas continuam protegidos.
- `src/lib/supabase.ts`: acesso às tabelas e storage.
- `src/lib/backend.ts`: API Rust.
- `src/lib/native.ts`: ponte Tauri.

### Central de trabalho

- `src/components/WorkHome.tsx`: home operacional.
- `src/components/WorkItemsCenter.tsx`: tarefas, decisões e acompanhamentos.
- `src/lib/work-items.ts`: persistência compartilhada em `workspaces/labstar-work-items-v1`.
- `src/components/WorkspaceIntelligence.tsx`: visão geral e busca indexada.
- `src/components/GlobalSearchBridge.tsx`: ligação estável com o campo global.

### Comunicação

- `src/components/CollaborationHub.tsx`: alternância entre Início, Canais e DMs.
- `src/components/LegacyCollaborationHub.tsx`: canais, mensagens, reuniões, voz, social e integrações.
- `src/components/DirectMessagesHubV5.tsx`: DMs atuais.
- `src/lib/directMessages.ts`: persistência das DMs.

## 5. Comandos de validação

Instale dependências:

```bash
npm ci
```

Validação Web obrigatória:

```bash
npm run build
```

Validação Rust/Tauri quando o ambiente permitir:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
npx tauri build --debug --no-bundle
```

Build Windows oficial em máquina Windows:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File scripts/build-windows.ps1
```

O build Windows deve produzir NSIS e MSI em `artifacts/windows/`, com `build-info.txt` contendo versão e SHA de origem.

## 6. Gates antes de concluir uma tarefa

Toda tarefa deve provar:

- TypeScript/Vite verde;
- nenhum erro novo no console durante o fluxo alterado;
- estado carregando, vazio, sucesso e erro tratados;
- teclado e foco utilizáveis;
- layout testado em 1366×768, 1600×900 e 1920×1080;
- conteúdo não corta ao usar zoom do sistema/navegador;
- Web e Tauri usam a mesma fonte de dados;
- nenhuma chave privada ou token novo no diff;
- nenhuma funcionalidade existente removida sem autorização;
- arquivos alterados e comportamento descritos no resultado final.

Para mudanças de autenticação, também validar:

- membro ativo;
- pendente;
- suspenso;
- não convidado;
- troca de conta;
- logout quando API está indisponível.

Para mensagens e arquivos:

- enviar texto;
- enviar imagem;
- enviar arquivo;
- responder;
- editar;
- excluir;
- fixar;
- recarregar e confirmar persistência;
- testar imagem quebrada sem desmontar o layout.

## 7. Prioridades de produto

Trabalhar na ordem abaixo, salvo instrução explícita diferente.

### P0 — estabilidade e dados

- eliminar erros de boot, tela preta e bloqueios de entrada;
- garantir sessão e autorização corretas;
- garantir que Web e desktop exibam os mesmos dados;
- impedir salvamento falso e perda silenciosa de dados;
- corrigir layout da Central de trabalho em todas as resoluções.

### P1 — Central de trabalho

- tarefas com responsável, prazo, prioridade e status;
- decisões com contexto, autor e resultado;
- converter mensagem em tarefa/decisão;
- “Minhas tarefas”, atrasadas, bloqueadas e concluídas;
- atividade recente e arquivos recentes;
- reuniões próximas e ações rápidas;
- busca global real e navegação direta;
- painel de projeto/espaço com progresso e pendências.

### P1 — canais e mensagens

- layout de altura total e rolagem correta;
- composer sempre acessível;
- anexos sem quebrar a tela;
- respostas, edição, exclusão e fixados robustos;
- menções e não lidas;
- ações de contexto;
- estados vazios úteis;
- permissões por canal.

### P1 — DMs e presença

- presença baseada em sinal real;
- não lidas e menções confiáveis;
- favoritos, notas e arquivos compartilhados;
- voz/vídeo sem fingir chamada ativa;
- perfil e ações de membro.

### P2 — administração

- cargos, escudos, cores e permissões;
- convites e aprovação;
- categorias, canais e configurações por espaço;
- auditoria de botões e salvamentos;
- termos e segurança.

### P2 — identidade visual

- aplicar o ícone oficial de alta qualidade quando o arquivo-fonte estiver disponível;
- gerar favicon, ícones Tauri e assets PWA;
- preservar a estrela da marca;
- não compartilhar arquivos de fonte.

### P3 — distribuição

- updater Tauri assinado;
- canal estável e canal interno;
- manifesto HTTPS e `.sig`;
- instalar e reiniciar;
- rollback/documentação;
- não ativar updater inseguro ou sem assinatura.

## 8. Regras visuais

- Tema dark puro, profissional e simples.
- Evitar bordas grossas e excesso de brilho.
- Não usar quadrado opaco em ilustrações que deveriam ser transparentes.
- A área de canais deve ocupar toda a altura disponível.
- A barra de mensagem fica presa à base da área útil, não ao meio da janela.
- Avatares: mídia recortada dentro da máscara; indicador de presença fora da máscara.
- Logos de espaço: `object-fit: contain` por padrão; nunca esticar verticalmente.
- Textos longos devem truncar ou quebrar sem ampliar colunas indefinidamente.
- Modais fecham por Escape e clique externo quando seguro.
- Após salvar configurações, fechar ou confirmar claramente o resultado.
- Respeitar `prefers-reduced-motion`.

## 9. Regras de segurança

Nunca incluir em código cliente ou documentação pública:

- Supabase `service_role`;
- senha do banco;
- client secret OAuth;
- token de sessão;
- token de convite;
- chave privada de assinatura;
- segredo de webhook.

Chaves anon/publishable podem existir apenas pelos mecanismos de ambiente já definidos.

Alterações de permissão devem usar RLS e validação de backend. Não confiar apenas em esconder botões no frontend.

## 10. Estratégia de refatoração

- Evite reescrever `src/App.tsx` inteiro.
- Extraia componentes e adaptadores gradualmente.
- Prefira módulos isolados com contratos claros.
- Não acumule mais versões `V2/V3/V4/V5` sem plano de consolidação.
- Ao substituir uma versão, atualize todos os imports, valide e depois remova código morto em commit separado.
- Não misture refatoração estrutural com mudança visual grande no mesmo commit.
- Não mude banco, autenticação e UI crítica no mesmo commit.

## 11. Fluxo de trabalho esperado do agente

1. Leia `AGENTS.md`, `README.md`, `docs/PROJECT_MAP.md`, `docs/CODEX_HANDOFF.md` e o arquivo relacionado à tarefa.
2. Inspecione o comportamento atual antes de editar.
3. Escreva um plano curto com arquivos e riscos.
4. Implemente um bloco funcional completo.
5. Execute os gates relevantes.
6. Corrija os erros encontrados; não apenas relate.
7. Faça commit descritivo.
8. Atualize documentação quando arquitetura/comportamento mudar.
9. Entregue resumo com:
   - o que mudou;
   - arquivos principais;
   - testes executados;
   - o que ainda não foi possível validar;
   - riscos restantes.

## 12. Definição de pronto

Uma tarefa só está pronta quando:

- o comportamento solicitado existe de ponta a ponta;
- dados persistem após recarregar;
- Web e desktop continuam compatíveis;
- erros são visíveis e recuperáveis;
- não existe botão enganoso;
- build passa;
- não houve remoção involuntária;
- documentação e critérios de teste foram atualizados.

“Compilou” não significa “produto pronto”. “Tela bonita” não significa “função pronta”.

## 13. Coisas proibidas

- fazer merge do PR #7;
- usar a branch Cloudflare cross-build;
- desativar RLS;
- colocar segredos no cliente;
- remover autenticação ou convites para facilitar testes;
- substituir o aplicativo por um link/launcher Web;
- declarar presença online fixa;
- gerar instalador antigo com nome de versão nova;
- reutilizar artefato sem verificar SHA e versão;
- silenciar exceções críticas sem estado visual;
- criar mock permanente onde já existe fonte de dados real;
- encerrar uma tarefa apenas com plano ou comentário.

## 14. Comunicação com o proprietário

O proprietário prefere ação concreta. Não responder apenas com listas extensas de possibilidades. Ao assumir uma tarefa:

- implemente;
- valide;
- mostre o resultado;
- peça teste manual apenas quando realmente depender de Windows, câmera, microfone, notificações do sistema ou percepção visual.
