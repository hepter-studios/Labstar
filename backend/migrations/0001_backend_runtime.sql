-- Labstar backend Rust 1.0
-- Esta migração adiciona somente estruturas necessárias ao serviço Rust.
-- Não remove tabelas, funções, políticas ou dados existentes.

begin;

create schema if not exists backend;
revoke all on schema backend from public, anon, authenticated;

alter table if exists public.direct_message_attachments
  add column if not exists sha256 text not null default '';

create index if not exists direct_message_attachments_sha256_idx
  on public.direct_message_attachments (sha256)
  where sha256 <> '';

create table if not exists backend.audit_log (
  id bigint generated always as identity primary key,
  actor_member_id uuid references public.members(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists backend_audit_log_actor_created_idx
  on backend.audit_log(actor_member_id, created_at desc);
create index if not exists backend_audit_log_resource_idx
  on backend.audit_log(resource_type, resource_id, created_at desc);

create table if not exists backend.idempotency_keys (
  actor_member_id uuid not null references public.members(id) on delete cascade,
  idempotency_key text not null,
  operation text not null,
  response_status integer not null,
  response_body jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  primary key (actor_member_id, idempotency_key)
);

create index if not exists backend_idempotency_expiry_idx
  on backend.idempotency_keys(expires_at);

create table if not exists backend.file_receipts (
  id uuid primary key default gen_random_uuid(),
  actor_member_id uuid not null references public.members(id) on delete cascade,
  attachment_id uuid references public.direct_message_attachments(id) on delete set null,
  storage_path text not null,
  original_name text not null,
  detected_mime_type text not null,
  size_bytes bigint not null,
  sha256 text not null,
  created_at timestamptz not null default now()
);

create index if not exists backend_file_receipts_actor_created_idx
  on backend.file_receipts(actor_member_id, created_at desc);
create index if not exists backend_file_receipts_sha256_idx
  on backend.file_receipts(sha256);

revoke all on all tables in schema backend from public, anon, authenticated;
revoke all on all sequences in schema backend from public, anon, authenticated;

commit;
