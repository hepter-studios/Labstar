# Pente-fino final — 11.2.9

## Exclusão de conta

A causa da falha era arquitetural: o navegador chamava uma função
`SECURITY DEFINER` liberada para `authenticated`, e essa função manipulava
`auth.users`. A correção elimina a função pública e separa a operação:

1. o frontend envia a sessão e a confirmação por e-mail à API Rust;
2. a API revalida a sessão no Supabase Auth;
3. a API consulta o vínculo e aplica a matriz owner/admin/suspenso;
4. a Admin API remove a identidade usando `service_role` protegida;
5. uma RPC executável somente por `service_role` anonimiza o cadastro e mantém a autoria histórica.

A operação é repetível quando a identidade Auth já foi removida e a limpeza do
cadastro falhou. Erros permanecem no modal e informam qual etapa não concluiu.

## Chat, DM e permissões

- Limpar canal exige membro ativo e `can_manage_labstar_channels()` no banco.
- Limpar DM grava preferências em `hidden_direct_messages`; não apaga o histórico do outro participante.
- A atualização da tela ocorre por evento de dados e nova leitura, sem remover nós de mensagem manualmente do DOM.
- `members.assignments` preserva o contrato `jsonb` do banco publicado e é normalizado com `jsonb_array_elements_text` nas verificações de acesso.
- Categorias privadas continuam sendo herdadas pelos canais.
- O teste SQL transacional verifica grants, RLS, políticas, contratos e CSO.

## Editor de README

O upload foi integrado ao modal React original. Imagem ou arquivo entra na
seleção atual do textarea, o cursor é restaurado depois da inserção e a prévia
Markdown é atualizada imediatamente. O bridge baseado em `MutationObserver`,
portal dinâmico e eventos sintéticos foi removido.

## Mobile e inicialização

- A barra inferior agora ocupa uma faixa própria e não encobre botões ou campos roláveis.
- O painel de notificações usa a altura útil do viewport; antes, regras conflitantes o reduziam a cerca de 2 px.
- Os três destinos da Central de trabalho permanecem na mesma linha e o conteúdo começa abaixo deles.
- A sincronização de painéis mobile não depende de `requestAnimationFrame` em aba de fundo e reconhece a estrutura real das DMs.
- Botões somente com ícone em perfil e mensagens diretas receberam nomes acessíveis.
- O guardião de boot não substitui mais o conteúdo do `root` do React quando uma montagem demora; o diagnóstico vive em uma camada independente e recuperável.

## Banco publicado

O checkout local não possui Supabase CLI nem um PostgreSQL/Supabase local com o
schema completo. Portanto, a migração e o teste pgTAP foram revisados e
versionados, mas a validação contra o banco publicado deve ocorrer pelo workflow
`Aplicar endurecimento final de segurança`, que faz backup, usa
`ON_ERROR_STOP=1`, aplica a migração e falha se qualquer um dos 20 testes não
passar.

O primeiro ensaio após o merge confirmou que a coluna publicada é `jsonb`, e
não `text[]` como uma migração intermediária pressupunha. A migração de
compatibilidade `20260810020000_members_assignments_jsonb_contract.sql` corrige
tanto a autorização por atribuição quanto a limpeza final da conta e impede que
o workflow aceite novamente um contrato de tipo divergente.

## CSO

CSO significa **Chief Scientific Officer / Diretora Científica**. O cargo usa
`#8B1E3F`, um carmesim profundo de identidade, distinto do vermelho destrutivo
da interface (`#ef5b62`).
