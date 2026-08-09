# Publicação do backend Rust

O backend é publicado pela GitHub Action `Publicar backend Rust` na aplicação `labstar-api-mackson` da Fly.io.

Segredos obrigatórios do repositório:

- `FLY_API_TOKEN`
- `SUPABASE_DATABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` ou `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Após a publicação, os workflows validam `/health/live`, `/health/ready`, CORS, autenticação, presença, mensagens privadas e chamadas com duas contas temporárias.

Último disparo solicitado após a configuração completa dos segredos: 2026-08-05.
