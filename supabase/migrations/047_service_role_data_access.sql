-- Restore the server-side Supabase client's access to application data.
--
-- The API authenticates users and enforces product permissions before using
-- the service_role client. service_role bypasses RLS by design, but still
-- requires ordinary PostgreSQL object privileges.
--
-- Browser roles are intentionally not changed here.

begin;

do $$
declare
  object_name text;
begin
  for object_name in
    select format('%I.%I', namespace.nspname, relation.relname)
    from pg_class relation
    join pg_namespace namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
      and pg_get_userbyid(relation.relowner) = 'postgres'
  loop
    execute format(
      'grant select, insert, update, delete on table %s to service_role',
      object_name
    );
  end loop;

  for object_name in
    select format('%I.%I', namespace.nspname, relation.relname)
    from pg_class relation
    join pg_namespace namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind = 'S'
      and pg_get_userbyid(relation.relowner) = 'postgres'
  loop
    execute format(
      'grant usage, select, update on sequence %s to service_role',
      object_name
    );
  end loop;
end;
$$;

alter default privileges
for role postgres
in schema public
grant select, insert, update, delete
on tables
to service_role;

alter default privileges
for role postgres
in schema public
grant usage, select, update
on sequences
to service_role;

commit;