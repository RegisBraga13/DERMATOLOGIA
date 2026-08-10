-- Persistência segura dos prontuários. Exige usuário autenticado.
create table if not exists public.prontuarios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prontuarios_owner_id_idx on public.prontuarios(owner_id);
alter table public.prontuarios enable row level security;

drop policy if exists "prontuarios_select_own" on public.prontuarios;
create policy "prontuarios_select_own" on public.prontuarios for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "prontuarios_insert_own" on public.prontuarios;
create policy "prontuarios_insert_own" on public.prontuarios for insert to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists "prontuarios_update_own" on public.prontuarios;
create policy "prontuarios_update_own" on public.prontuarios for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "prontuarios_delete_own" on public.prontuarios;
create policy "prontuarios_delete_own" on public.prontuarios for delete to authenticated
  using ((select auth.uid()) = owner_id);

grant select, insert, update, delete on public.prontuarios to authenticated;
