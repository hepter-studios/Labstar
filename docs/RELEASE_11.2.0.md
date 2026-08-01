# Labstar 11.2.0 — candidato interno

## Origem

- Branch: `feat/tauri-auth-rust-integration`
- PR: `#7` em rascunho
- Não fazer merge antes da validação manual.

## Mudanças principais

### Dashboard

- gestão operacional movida para a tela de Dashboard;
- servidores exibidos como acessos diretos no Dashboard;
- prioridades, tarefas, decisões, reuniões, atividade e arquivos reunidos no lugar correto;
- remoção da camada antiga de inteligência que podia entrar em repetição e travar a tela;
- resumo executivo continua acessível pelo Dashboard.

### Central de trabalho

- volta a abrir diretamente com servidores, categorias, canais e chat;
- servidores permanecem visíveis na coluna principal;
- DMs ganham entrada própria na coluna dos servidores;
- removida a home de gestão que escondia a navegação principal;
- altura encadeada da workspace, shell, canal e sala corrigida;
- composer preso à base da área útil;
- rolagem limitada à lista de mensagens.

### Comunicação ligada ao trabalho

- mensagens de canal podem virar tarefa, decisão ou acompanhamento;
- seleção de responsável, prioridade e prazo;
- vínculo com servidor, canal e mensagem de origem;
- itens aparecem no Dashboard compartilhado entre Web e desktop.

## Validação obrigatória no Windows

1. Abrir Dashboard várias vezes e confirmar que não trava.
2. Abrir Central de trabalho e confirmar que os servidores aparecem imediatamente.
3. Trocar entre servidores e canais.
4. Confirmar que o campo de mensagem fica na parte inferior em 1366×768 e 1600×900.
5. Enviar texto, imagem e arquivo.
6. Transformar uma mensagem em tarefa e confirmar no Dashboard.
7. Abrir DMs pela coluna de servidores e retornar clicando em um servidor.
8. Confirmar que Web e desktop exibem o mesmo item criado.

## Ainda não é release estável

Ainda precisam de validação/refinamento:

- presença real;
- matriz completa de permissões;
- chamadas de voz/vídeo em várias redes;
- updater assinado;
- aplicação final do ícone oficial;
- auditoria de todos os botões e estados de erro;
- testes de instalação, atualização e remoção.
