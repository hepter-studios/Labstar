# Decisões de arquitetura do Labstar

Este arquivo registra decisões já tomadas para impedir que futuras melhorias desmontem a segurança ou dupliquem responsabilidades.

## AD-001 — React é interface, não autoridade

**Decisão:** React apresenta telas, coleta ações e chama serviços. Ele não decide acesso administrativo, não concede cargo e não manipula diretamente convites protegidos.

**Motivo:** código do frontend pode ser inspecionado e alterado pelo cliente. Autorização crítica precisa ocorrer em ambiente controlado.

**Consequência:** qualquer nova regra de membro, organização, projeto, cobrança ou integração sensível deve nascer na API Rust.

## AD-002 — A API central é escrita em Rust

**Decisão:** o backend central usa Rust, Axum e Tokio.

**Motivo:** segurança de memória, tipos fortes, desempenho previsível e uma base adequada para regras de negócio e integrações de longo prazo.

**Responsabilidades:** autorização, membros, convites, organizações, projetos, cargos, notificações e integrações futuras.

## AD-003 — Tauri/Rust local é separado do backend

**Decisão:** Rust dentro de `src-tauri/` cuida da integração com o sistema operacional. O backend Rust remoto cuida das regras centrais.

**Motivo:** o aplicativo instalado não deve possuir poder administrativo ou credenciais do servidor.

## AD-004 — Supabase Auth identifica; o Labstar autoriza

**Decisão:** Google, GitHub e e-mail confirmam identidade. A tabela de membros e a API Rust decidem se essa identidade entra.

**Motivo:** possuir conta Google ou GitHub não significa pertencer à empresa.

**Consequência:** uma identidade GitHub com e-mail diferente não vira proprietária automaticamente.

## AD-005 — Vínculo permanente por `auth_user_id`

**Decisão:** membros autorizados são vinculados a `auth.uid()` por `members.auth_user_id`.

**Motivo:** e-mail pode mudar, variar entre provedores ou ser ocultado. O UUID de Auth é a referência estável.

**Regra:** uma segunda identidade só pode ser conectada por fluxo explícito, autenticado e auditável.

## AD-006 — Convites são controlados exclusivamente pelo backend

**Decisão:** criação, inspeção, aceite e revogação de convites sensíveis passam pela API Rust.

**Regras:**

- 32 bytes aleatórios;
- somente hash SHA-256 armazenado;
- uso único;
- expiração;
- revogação;
- consumo atômico;
- convite pessoal preso ao e-mail;
- convite rápido cria solicitação pendente;
- conta suspensa nunca é reativada.

## AD-007 — Somente owner concede administração

**Decisão:** administradores podem gerenciar convites comuns, mas somente o proprietário concede nível administrativo.

**Motivo:** reduzir escalada acidental de privilégio.

## AD-008 — Repositório e Artifacts permanecem privados

**Decisão:** código, builds de teste, backups e documentação operacional permanecem privados.

**Motivo:** o produto ainda está em desenvolvimento interno e contém arquitetura e informações de operação.

**Consequência:** instaladores são distribuídos por Artifacts privados até existir Release privada assinada.

## AD-009 — Secrets nunca são versionados

**Locais permitidos:**

- GitHub Actions Secrets;
- Fly Secrets;
- configuração segura do Supabase;
- gerenciador de segredos aprovado no futuro.

**Proibido:** README, código, `.env.example`, issue, PR, screenshot, log e chat da equipe.

## AD-010 — PRs empilhados só entram após testes reais

**Decisão:** PRs de backend, autenticação e Tauri permanecem em rascunho até a matriz de testes.

**Motivo:** as branches possuem dependências e ordem de integração. Merge prematuro pode quebrar produção, callbacks e autorização.

## AD-011 — Build reproduzível pelo GitHub Actions

**Decisão:** instaladores oficiais de teste são gerados no GitHub Actions.

**Motivo:** ambiente consistente de Node, Rust, Tauri, secrets e Artifacts.

**Consequência:** builds locais servem para desenvolvimento; o candidato oficial deve indicar branch e commit.

## AD-012 — Internacionalização será estrutural

**Decisão:** o lançamento internacional exigirá camada de i18n, datas, fusos, formatos, políticas e suporte, não apenas tradução de textos.

**Motivo:** produto empresarial precisa se comportar corretamente em diferentes países e organizações.

## Como alterar uma decisão

Uma decisão só pode ser substituída com:

1. issue descrevendo problema e alternativa;
2. impacto em segurança e migração;
3. revisão do proprietário;
4. atualização deste arquivo;
5. testes e plano de reversão.
