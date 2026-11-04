-- A v1 deve ter exatamente uma linha por conta. Antes de criar o indice,
-- falhar se houver duplicatas: mesclar/copiar prontuarios exige revisao,
-- e escolher uma das linhas automaticamente poderia perder dados clinicos.
do $$
begin
  if exists (select 1 from public.prontuarios group by owner_id having count(*) > 1) then
    raise exception 'prontuarios possui owner_id duplicado; reconcilie antes de aplicar esta migracao';
  end if;
end $$;

create unique index if not exists prontuarios_owner_unico_idx
  on public.prontuarios (owner_id);
