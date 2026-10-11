begin;

-- authenticated must not execute csv_bind_location

set local role authenticated;

do $$
begin
  begin
    perform *
    from public.csv_bind_location(
      '41000000-0000-0000-0000-000000000001',
      '42000000-0000-0000-0000-000000000001',
      '44000000-0000-0000-0000-000000000001',
      'SHOULD-NOT-RUN',
      '43000000-0000-0000-0000-000000000001',
      null
    );

    raise exception
      'authenticated unexpectedly executed csv_bind_location';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;

reset role;

rollback;
