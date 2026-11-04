-- O dono das tabelas monta o cenário; as consultas abaixo rodam como o papel
-- autenticado, com um JWT simulado por vez.
insert into public.prontuarios (owner_id, payload) values
  ('11111111-1111-4111-8111-111111111111', '{"patients":[]}'::jsonb),
  ('22222222-2222-4222-8222-222222222222', '{"patients":[]}'::jsonb);

do $$
begin
  begin
    insert into public.prontuarios (owner_id) values
      ('11111111-1111-4111-8111-111111111111');
    raise exception 'o índice aceitou duas linhas da mesma conta';
  exception when unique_violation then null;
  end;
end $$;

insert into public.prontuario_registros (owner_id, kind, record_id, patient_id, payload) values
  ('11111111-1111-4111-8111-111111111111', 'patient', 'p', 'p', '{"id":"p","name":"A"}'::jsonb),
  ('22222222-2222-4222-8222-222222222222', 'patient', 'p', 'p', '{"id":"p","name":"B"}'::jsonb);
insert into public.prontuario_conflitos (owner_id, kind, record_id, local_payload, remote_payload, selected, remote_version) values
  ('11111111-1111-4111-8111-111111111111', 'patient', 'p', '{"id":"p"}'::jsonb, '{"id":"p"}'::jsonb, 'remote', 1),
  ('22222222-2222-4222-8222-222222222222', 'patient', 'p', '{"id":"p"}'::jsonb, '{"id":"p"}'::jsonb, 'remote', 1);

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

do $$
declare changed integer;
begin
  if has_table_privilege(current_user, 'public.prontuario_conflitos', 'UPDATE') or
     has_table_privilege(current_user, 'public.prontuario_conflitos', 'DELETE') then
    raise exception 'o papel autenticado tem permissão de alterar o histórico';
  end if;
  if (select count(*) from public.prontuarios) <> 1 or
     (select count(*) from public.prontuario_registros) <> 1 or
     (select count(*) from public.prontuario_conflitos) <> 1 then
    raise exception 'a leitura de outra conta não foi isolada';
  end if;

  update public.prontuario_registros set payload = '{"id":"p","name":"intruso"}'::jsonb
    where owner_id = '22222222-2222-4222-8222-222222222222';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'a escrita em outra conta foi permitida'; end if;

  delete from public.prontuario_registros
    where owner_id = '22222222-2222-4222-8222-222222222222';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'a exclusão em outra conta foi permitida'; end if;

  begin
    insert into public.prontuario_registros (owner_id, kind, record_id, payload) values
      ('22222222-2222-4222-8222-222222222222', 'patient', 'novo', '{"id":"novo"}'::jsonb);
    raise exception 'a inserção em outra conta foi permitida';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.prontuario_registros set owner_id = '22222222-2222-4222-8222-222222222222'
      where owner_id = '11111111-1111-4111-8111-111111111111';
    raise exception 'o titular do registro pôde ser trocado';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.prontuario_conflitos
      (owner_id, kind, record_id, local_payload, remote_payload, selected, remote_version)
      values ('22222222-2222-4222-8222-222222222222', 'patient', 'intruso', '{}'::jsonb, '{}'::jsonb, 'local', 1);
    raise exception 'o histórico de outra conta aceitou inserção';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.prontuario_conflitos set selected = 'local';
    raise exception 'o histórico aceitou alteração';
  exception when insufficient_privilege then null;
  end;

  begin
    delete from public.prontuario_conflitos;
    raise exception 'o histórico aceitou exclusão';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Uma versão antiga não pode sobrescrever uma atualização já aceita.
update public.prontuario_registros set payload = '{"id":"p","name":"nova"}'::jsonb,
  version = version + 1 where kind = 'patient' and record_id = 'p' and version = 1;
do $$
declare changed integer;
begin
  update public.prontuario_registros set payload = '{"id":"p","name":"obsoleta"}'::jsonb,
    version = version + 1 where kind = 'patient' and record_id = 'p' and version = 1;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'uma versão obsoleta sobrescreveu o registro'; end if;
  if (select version from public.prontuario_registros where kind = 'patient' and record_id = 'p') <> 2 then
    raise exception 'versão final inesperada';
  end if;
end $$;

reset role;
set role anon;
do $$
begin
  begin
    perform count(*) from public.prontuario_registros;
    raise exception 'o visitante anônimo leu registros';
  exception when insufficient_privilege then null;
  end;
end $$;
