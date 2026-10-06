-- Issue #136 · CA-07
-- Publica únicamente los cambios de pedidos web para que el backoffice
-- pueda refrescar su lista ante altas y cambios de estado.

begin;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'pedidos_web'
  ) then
    execute 'alter publication supabase_realtime add table public.pedidos_web';
  end if;
end;
$$;

commit;
