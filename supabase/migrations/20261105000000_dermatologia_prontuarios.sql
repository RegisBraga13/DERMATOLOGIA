-- Tabela independente do produto de Psiquiatria.
-- Aplicar somente quando este novo aplicativo for conectado a um projeto Supabase.
create table if not exists public.dermatologia_prontuarios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists dermatologia_prontuarios_owner_unico_idx
  on public.dermatologia_prontuarios (owner_id);

alter table public.dermatologia_prontuarios enable row level security;

drop policy if exists "dermatologia_prontuarios_select_own" on public.dermatologia_prontuarios;
create policy "dermatologia_prontuarios_select_own"
  on public.dermatologia_prontuarios for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "dermatologia_prontuarios_insert_own" on public.dermatologia_prontuarios;
create policy "dermatologia_prontuarios_insert_own"
  on public.dermatologia_prontuarios for insert to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists "dermatologia_prontuarios_update_own" on public.dermatologia_prontuarios;
create policy "dermatologia_prontuarios_update_own"
  on public.dermatologia_prontuarios for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "dermatologia_prontuarios_delete_own" on public.dermatologia_prontuarios;
create policy "dermatologia_prontuarios_delete_own"
  on public.dermatologia_prontuarios for delete to authenticated
  using ((select auth.uid()) = owner_id);
