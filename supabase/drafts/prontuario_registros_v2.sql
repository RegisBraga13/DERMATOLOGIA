-- Execute apos backup e antes de mudar SUPABASE_STORAGE_VERSION para 2.
-- A aplicacao copia o JSON antigo por conta no primeiro sync e marca o fim
-- apenas depois de gravar todos os registros. Nenhuma linha v1 e removida.
create table if not exists public.prontuario_registros (
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('patient', 'consultation', 'return', 'meta')),
  record_id text not null,
  patient_id text,
  payload jsonb not null,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, kind, record_id)
);

create index if not exists prontuario_registros_patient_idx
  on public.prontuario_registros (owner_id, patient_id);

alter table public.prontuario_registros enable row level security;

create policy "prontuario_registros_select_own" on public.prontuario_registros
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "prontuario_registros_insert_own" on public.prontuario_registros
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "prontuario_registros_update_own" on public.prontuario_registros
  for update to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy "prontuario_registros_delete_own" on public.prontuario_registros
  for delete to authenticated using ((select auth.uid()) = owner_id);

-- Projetos Supabase podem dar privilegios padrao a anon/authenticated em
-- tabelas novas. Restringir tambem os GRANTs, alem da RLS.
revoke all on public.prontuario_registros from public, anon, authenticated;
grant select, insert, update, delete on public.prontuario_registros to authenticated;

-- Guarda as duas cópias antes de resolver uma divergência. Sem UPDATE/DELETE
-- para o papel do navegador; os dados continuam sujeitos a backup e retenção.
create table if not exists public.prontuario_conflitos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('patient', 'consultation', 'return', 'meta')),
  record_id text not null,
  local_payload jsonb not null,
  remote_payload jsonb not null,
  selected text not null check (selected in ('local', 'remote')),
  remote_version bigint not null,
  resolved_at timestamptz not null default now()
);

create index if not exists prontuario_conflitos_record_idx
  on public.prontuario_conflitos (owner_id, kind, record_id, resolved_at desc);
alter table public.prontuario_conflitos enable row level security;
create policy "prontuario_conflitos_select_own" on public.prontuario_conflitos
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "prontuario_conflitos_insert_own" on public.prontuario_conflitos
  for insert to authenticated with check ((select auth.uid()) = owner_id);
revoke all on public.prontuario_conflitos from public, anon, authenticated;
grant select, insert on public.prontuario_conflitos to authenticated;
