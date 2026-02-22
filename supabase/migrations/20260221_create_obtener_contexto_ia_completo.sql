create or replace function public.obtener_contexto_ia_completo(
  p_row_limit integer default 20,
  p_include_samples boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  table_rec record;
  view_rec record;
  row_count bigint;
  sample_rows jsonb;
  cols jsonb;
  limit_safe integer := greatest(1, least(coalesce(p_row_limit, 20), 100));
  result jsonb := jsonb_build_object(
    'generated_at', now(),
    'schema', 'public',
    'row_limit', limit_safe,
    'tables', '[]'::jsonb,
    'views', '[]'::jsonb
  );
begin
  for table_rec in
    select t.table_name
    from information_schema.tables t
    where t.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
    order by t.table_name
  loop
    execute format('select count(*) from public.%I', table_rec.table_name)
      into row_count;

    select coalesce(jsonb_agg(x.col), '[]'::jsonb)
      into cols
    from (
      select jsonb_build_object(
        'name', c.column_name,
        'type', c.udt_name,
        'nullable', (c.is_nullable = 'YES')
      ) as col
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = table_rec.table_name
      order by c.ordinal_position
    ) as x;

    if p_include_samples then
      execute format(
        'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (select * from public.%I limit %s) t',
        table_rec.table_name,
        limit_safe
      ) into sample_rows;
    else
      sample_rows := '[]'::jsonb;
    end if;

    result := jsonb_set(
      result,
      '{tables}',
      (result -> 'tables') || jsonb_build_array(
        jsonb_build_object(
          'name', table_rec.table_name,
          'row_count', row_count,
          'columns', cols,
          'sample_rows', sample_rows
        )
      )
    );
  end loop;

  for view_rec in
    select v.table_name
    from information_schema.views v
    where v.table_schema = 'public'
    order by v.table_name
  loop
    begin
      execute format('select count(*) from public.%I', view_rec.table_name)
        into row_count;
    exception when others then
      row_count := null;
    end;

    select coalesce(jsonb_agg(x.col), '[]'::jsonb)
      into cols
    from (
      select jsonb_build_object(
        'name', c.column_name,
        'type', c.udt_name,
        'nullable', (c.is_nullable = 'YES')
      ) as col
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = view_rec.table_name
      order by c.ordinal_position
    ) as x;

    if p_include_samples then
      begin
        execute format(
          'select coalesce(jsonb_agg(to_jsonb(vw)), ''[]''::jsonb) from (select * from public.%I limit %s) vw',
          view_rec.table_name,
          limit_safe
        ) into sample_rows;
      exception when others then
        sample_rows := '[]'::jsonb;
      end;
    else
      sample_rows := '[]'::jsonb;
    end if;

    result := jsonb_set(
      result,
      '{views}',
      (result -> 'views') || jsonb_build_array(
        jsonb_build_object(
          'name', view_rec.table_name,
          'row_count', row_count,
          'columns', cols,
          'sample_rows', sample_rows
        )
      )
    );
  end loop;

  return result;
end;
$$;

revoke all on function public.obtener_contexto_ia_completo(integer, boolean) from public;
grant execute on function public.obtener_contexto_ia_completo(integer, boolean) to service_role;
