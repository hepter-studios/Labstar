# Ativação das notificações externas — Fase 5

O código da Fase 5 não dispara workflows automaticamente. A ativação é feita uma única vez pelo workflow manual `APPLY_PHASE5_PUSH_NOTIFICATIONS`.

## 1. Gere as chaves sem publicar a chave privada

Em um terminal confiável, execute:

```bash
npx @pushforge/builder vapid
```

Guarde a chave pública e o JWK privado. Gere também um segredo aleatório forte para o webhook (por exemplo, 32 bytes). Nunca coloque o JWK privado em arquivo versionado, issue ou conversa.

## 2. Adicione três GitHub Actions Secrets

- `LABSTAR_VAPID_PUBLIC_KEY`: chave pública VAPID.
- `LABSTAR_VAPID_PRIVATE_JWK`: objeto JSON privado completo em uma única linha.
- `LABSTAR_PUSH_WEBHOOK_SECRET`: segredo aleatório usado entre o banco e a Edge Function.

Os secrets já usados pelo projeto também precisam continuar disponíveis: `SUPABASE_DATABASE_URL` e `SUPABASE_ACCESS_TOKEN`.

## 3. Execute o workflow manual

Abra **Actions → APPLY_PHASE5_PUSH_NOTIFICATIONS → Run workflow**. Ele faz backup lógico do esquema afetado, aplica a migration, salva o segredo no Vault, publica a função e audita a instalação.

## 4. Ative em cada dispositivo

- Computador/Android: abra **Configurações → Notificações → Ativar e testar neste dispositivo**.
- iPhone/iPad: no Safari, use **Compartilhar → Adicionar à Tela de Início**; abra o Labstar instalado e ative as notificações nas configurações do app.
- Desktop Tauri: mantenha o Labstar na bandeja. Fechar a janela não encerra o processo; a estrela continua disponível ao lado do relógio.
