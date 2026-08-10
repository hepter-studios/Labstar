# Operação interna do Labstar

Este documento descreve como verificar, construir, recuperar e diagnosticar o sistema sem depender da memória de uma única pessoa.

## Serviços

| Serviço | Função | Verificação |
| --- | --- | --- |
| Cloudflare Pages | aplicação web/PWA | abrir `https://labstar.pages.dev` |
| Fly.io | API Rust | abrir `/health/live` e `/health/ready` |
| Supabase Auth | sessões Google, GitHub e e-mail | testar login controlado |
| Supabase PostgreSQL | membros, convites e dados | `/health/ready` + consultas administrativas revisadas |
| GitHub Actions | CI, instaladores, backup e deploy | conferir execução e commit |

## Verificação rápida da API

- `GET https://labstar-api-mackson.fly.dev/health/live`
- `GET https://labstar-api-mackson.fly.dev/health/ready`

Interpretação:

- `live` falha: processo, máquina, porta ou deploy da API;
- `live` funciona e `ready` falha: banco, credencial, pooler ou inicialização de dependência;
- ambos funcionam: processo e conexão principal estão disponíveis, mas isso não substitui teste de autenticação.

A Fly.io pode parar a máquina por inatividade e iniciá-la na primeira requisição. Aguarde alguns segundos antes de concluir que está indisponível.

## Diagnóstico de login

Ordem de investigação:

1. confirmar se Google/GitHub abriu e retornou ao esquema correto;
2. confirmar qual e-mail e `auth.uid()` o provedor devolveu;
3. verificar se existe membro correspondente;
4. verificar `status` do membro;
5. verificar vínculo `auth_user_id`;
6. verificar resposta de `/v1/me`;
7. verificar CORS/CSP somente depois das etapas anteriores.

Não transforme uma identidade não reconhecida em proprietária para “resolver” o teste.

## Troca de conta

- Google deve usar `prompt=select_account`;
- a tela bloqueada deve oferecer `Entrar com outra conta`;
- sair deve remover a sessão atual;
- convite pendente deve permanecer enquanto a pessoa tenta a conta correta;
- remover convite deve ser uma ação separada e explícita.

## Backup do banco

Workflow: `Gerar backup manual do Supabase`.

Procedimento:

1. confirmar o secret `SUPABASE_DATABASE_URL` sem visualizar ou copiar o valor para logs;
2. executar o workflow;
3. confirmar sucesso;
4. baixar o Artifact;
5. guardar uma cópia fora do GitHub;
6. registrar data, ambiente e motivo;
7. testar restauração em ambiente separado antes de considerar a estratégia validada.

Artifacts têm prazo de expiração e não são arquivo permanente.

## Mudanças no banco

Antes:

- backup novo;
- revisão do SQL;
- confirmação do projeto Supabase;
- plano de reversão;
- janela sem outras mudanças concorrentes.

Durante:

- uma migração por vez;
- registrar resultado;
- parar no primeiro erro;
- não “corrigir” produção por tentativa e erro.

Depois:

- testar API;
- testar proprietário;
- testar membro ativo, pendente e suspenso;
- validar políticas e logs;
- atualizar documentação.

## Deploy da API Rust

Código de referência: diretório `backend/` da `main`.

Secrets necessários:

- `FLY_API_TOKEN` no GitHub;
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e origens permitidas na Fly.io.

`SUPABASE_SERVICE_ROLE_KEY` deve existir somente no gerenciador de secrets da
Fly.io. Ela nunca entra em variável `VITE_*`, no Tauri ou em logs do workflow.

Depois do deploy:

1. verificar logs do workflow;
2. abrir `/health/live`;
3. testar `DELETE /v1/admin/accounts` com sessão administrativa válida e conta suspensa de teste;
4. confirmar que membro comum, admin contra admin e conta ativa recebem negação;
5. confirmar que a resposta de erro aparece dentro do modal.

## Build do Windows

Workflow: `Gerar instalador Windows integrado`.

O nome da execução mostra branch e commit. Use somente a execução verde mais recente do commit que está sendo testado.

Artifacts:

- `labstar-windows-x64-nsis`;
- `labstar-windows-x64-msi`.

Antes de instalar um novo candidato:

- fechar o aplicativo;
- anotar versão/commit anterior;
- decidir se o teste é atualização ou instalação limpa;
- não misturar EXE e MSI no mesmo cenário sem desinstalação controlada.

## Produção web

A `main` representa a produção web atual. Branches de integração não devem substituir a produção automaticamente.

Antes de publicar:

- CI verde;
- revisão visual;
- Auth Redirect URLs corretas;
- variáveis públicas corretas;
- CSP e `_headers` revisados;
- plano de rollback para o deploy anterior.

## Secrets e rotação

Rotacione uma credencial quando:

- foi exposta em chat, log, captura ou commit;
- colaborador perdeu acesso;
- serviço informou comprometimento;
- política interna exigir.

Não rotacione repetidamente sem necessidade, pois isso aumenta erros operacionais. Depois de uma rotação, atualize todos os serviços que usam a credencial e valide cada um.

## Incidente de acesso

Quando o proprietário não consegue entrar:

1. preservar logs sem tokens;
2. identificar provedor e e-mail retornado;
3. não alterar owner automaticamente;
4. confirmar estado do membro;
5. testar conta principal `hepterstudios@gmail.com` via Google;
6. usar recuperação administrativa somente com evidência e registro;
7. abrir issue interna com causa, impacto e correção.

## Incidente de disponibilidade

Classifique:

- web indisponível;
- API indisponível;
- banco indisponível;
- login indisponível;
- funcionalidade específica degradada.

Registre:

- horário e fuso;
- primeiro sintoma;
- serviço afetado;
- última mudança conhecida;
- ações tomadas;
- momento de recuperação;
- prevenção futura.

## Recuperação e rollback

Nenhum rollback deve ser improvisado. Guarde:

- commit anterior estável;
- Artifact do instalador anterior durante a janela de teste;
- backup do banco antes de migração;
- configuração anterior da API;
- instruções de restauração verificadas.

## Contatos e responsabilidades

Enquanto a equipe é pequena, o proprietário aprova:

- mudanças de acesso;
- alterações no banco;
- secrets;
- merges empilhados;
- distribuição de instaladores;
- lançamento externo.

À medida que a equipe crescer, responsáveis e substitutos devem ser registrados sem colocar dados pessoais sensíveis neste arquivo.
