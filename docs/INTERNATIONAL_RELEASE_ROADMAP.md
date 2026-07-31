# Plano interno para lançamento internacional do Labstar

Atualizado em 31 de julho de 2026.

O lançamento internacional só deve acontecer depois que o produto estiver seguro, testado, operável e documentado internamente. Este plano evita publicar uma base ainda instável apenas porque o instalador já existe.

## Princípios

- segurança antes de velocidade;
- autorização central no backend Rust;
- isolamento real entre empresas;
- documentação e recuperação antes de escala;
- tradução não substitui internacionalização;
- nenhum lançamento público sem assinatura digital e plano de rollback.

## Fase 0 — Fundação técnica

Já construída ou em validação:

- React, TypeScript e PWA;
- Tauri 2 e Rust local;
- API central Rust publicada;
- Supabase Auth e PostgreSQL;
- Google e GitHub OAuth;
- convites de uso único;
- backup e migrações de acesso;
- EXE e MSI privados;
- CI de web e Rust;
- documentação de continuidade.

## Fase 1 — Alpha interna confiável

Objetivo: permitir uso diário pela equipe sem perda de acesso ou dados.

- concluir matriz de autenticação e convites;
- corrigir escolha e troca de conta;
- criar vinculação explícita de Google e GitHub;
- corrigir imagens, avatares e indicador online;
- validar desktop em resoluções mínimas e comuns;
- testar instalação, remoção e atualização manual;
- criar logs operacionais sem dados sensíveis;
- adicionar monitoramento de disponibilidade e erros;
- documentar recuperação de acesso e incidentes;
- validar backup e restauração em ambiente separado.

**Critério de saída:** a equipe interna usa o produto por um período definido sem falhas críticas de acesso, perda de dados ou bloqueios sem recuperação.

## Fase 2 — Segurança e operação empresarial

- revisão completa de RLS e permissões;
- testes de autorização por papel e empresa;
- rate limiting nos endpoints sensíveis;
- proteção contra abuso de convites;
- rotação e inventário de secrets;
- auditoria de ações administrativas;
- política de retenção e exclusão de dados;
- plano de resposta a incidentes;
- testes automatizados de backend e fluxos críticos;
- análise de dependências e atualizações de segurança;
- política de backup com retenção maior que Artifacts temporários;
- exercício real de restauração.

**Critério de saída:** riscos críticos conhecidos resolvidos e procedimentos operacionais testados.

## Fase 3 — Distribuição profissional do desktop

- certificado de assinatura de código para Windows;
- assinatura do EXE, MSI e updater;
- canal de atualização estável e canal de teste;
- verificação criptográfica dos pacotes;
- Release privada automatizada;
- rollback de versão;
- teste em Windows 10 e Windows 11;
- política de versões e changelog;
- telemetria opcional e transparente;
- instalação sem privilégios administrativos quando possível.

**Critério de saída:** Windows reconhece o editor e uma atualização pode ser instalada e revertida sem reinstalação manual completa.

## Fase 4 — Internacionalização real

- introduzir biblioteca e estrutura de i18n;
- retirar textos fixos dos componentes;
- português e inglês como idiomas iniciais;
- seletor de idioma por usuário;
- datas, horas, números e moedas por localidade;
- suporte consistente a fusos horários;
- mensagens de e-mail localizadas;
- cargos e áreas com nomes personalizáveis;
- layouts preparados para textos maiores;
- testes com caracteres internacionais;
- preparar RTL antes de idiomas que o exijam;
- busca e ordenação compatíveis com localidade;
- formatos de telefone e endereço configuráveis.

**Critério de saída:** uma organização em inglês usa todos os fluxos obrigatórios sem encontrar textos fixos em português.

## Fase 5 — Infraestrutura global

- medir latência por região;
- escolher regiões adicionais para API e banco quando necessário;
- CDN para assets públicos;
- serviço TURN profissional para voz e vídeo;
- filas para tarefas assíncronas e notificações;
- e-mail transacional com reputação e domínio verificado;
- observabilidade centralizada;
- alertas de disponibilidade, latência e erros;
- limites por organização e plano;
- testes de carga;
- plano de continuidade e desastre;
- revisão de custos por região.

**Critério de saída:** usuários fora do Brasil recebem desempenho e confiabilidade aceitáveis.

## Fase 6 — Produto comercial e conformidade

- definição de planos e cobrança;
- isolamento multiempresa revisado;
- termos de uso;
- política de privacidade;
- contratos empresariais;
- LGPD e análise de GDPR;
- consentimento e preferências de comunicação;
- exportação e exclusão de dados;
- subprocessadores documentados;
- política de suporte e SLA;
- canal de denúncia de segurança;
- páginas públicas de status e segurança.

A documentação jurídica exige revisão profissional nas jurisdições de lançamento.

## Fase 7 — Beta internacional controlada

- selecionar poucas empresas convidadas;
- onboarding acompanhado;
- ambientes e permissões separados;
- métricas de ativação, retenção e erros;
- coleta estruturada de feedback;
- suporte em português e inglês;
- congelamento de mudanças críticas próximo às releases;
- plano de rollback por versão;
- revisão de custos reais por organização.

**Critério de saída:** clientes externos usam o produto e os problemas possuem processo de resposta previsível.

## Fase 8 — Lançamento internacional

- domínio e marca internacional;
- site comercial em inglês e português;
- documentação de produto;
- tutoriais e central de ajuda;
- página de preços;
- status page;
- suporte e processo de vendas;
- releases assinadas;
- atualização automática estável;
- política pública de segurança;
- monitoramento contínuo de conversão, disponibilidade e custo.

## Itens que bloqueiam qualquer lançamento público hoje

- matriz de autenticação ainda incompleta;
- GitHub ainda não vinculado explicitamente ao proprietário;
- instaladores sem assinatura digital;
- updater ainda não configurado;
- falta de teste de restauração completa;
- falta de isolamento multiempresa revisado;
- internacionalização ainda não implementada;
- documentação jurídica ainda inexistente;
- observabilidade e suporte ainda incompletos.

## Regra de decisão

Uma fase só é marcada como concluída quando existem:

1. evidências de teste;
2. responsável;
3. documentação atualizada;
4. plano de rollback;
5. aprovação do proprietário.
