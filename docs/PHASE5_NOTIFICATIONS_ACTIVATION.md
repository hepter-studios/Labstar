# Ativação das notificações externas — Fase 5

O código da Fase 5 não dispara workflows automaticamente. A ativação é feita uma única vez pelo workflow manual `APPLY_PHASE5_PUSH_NOTIFICATIONS`.

## 1. Execute o workflow manual

Abra **Actions → APPLY_PHASE5_PUSH_NOTIFICATIONS → Run workflow**. Ele faz backup lógico do esquema afetado, aplica a migration, salva o segredo no Vault, publica a função e audita a instalação.

As chaves VAPID e o segredo do webhook são gerados dentro do runner somente na primeira execução, mascarados nos logs e persistidos de forma criptografada no Supabase Vault. Execuções posteriores reutilizam as mesmas chaves, portanto as inscrições dos dispositivos continuam válidas. Não é necessário copiar uma chave privada nem criar novos GitHub Secrets; o workflow reutiliza `SUPABASE_DATABASE_URL` e `SUPABASE_ACCESS_TOKEN`, já empregados nas fases anteriores.

## 2. Ative em cada dispositivo

- Computador/Android: abra **Configurações → Notificações → Ativar e testar neste dispositivo**.
- iPhone/iPad: no Safari, use **Compartilhar → Adicionar à Tela de Início**; abra o Labstar instalado e ative as notificações nas configurações do app.
- Desktop Tauri: mantenha o Labstar na bandeja. Fechar a janela não encerra o processo; a estrela continua disponível ao lado do relógio.
