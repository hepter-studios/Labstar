# Validação Labstar 11.2.7

Esta versão remove a dependência operacional da Fly.io para identidade e convites.

- Site e desktop usam Supabase Auth, RLS e RPCs protegidas.
- A tabela `member_invites` continua sem acesso direto para `anon` e `authenticated`.
- A criação de convite administrativo permanece restrita ao proprietário.
- O Tauri 2/Rust continua responsável por recursos nativos, deep links e configurações locais.
- O instalador 11.2.7 deve substituir a versão 11.2.6 no Windows.
- Segunda rodada de validação iniciada após a formatação completa do núcleo Rust.
