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
  has_discounts boolean := false;
  has_combos boolean := false;
  has_discount_applications boolean := false;
  promotions_context jsonb := jsonb_build_object(
    'active_discounts', '[]'::jsonb,
    'active_combos', '[]'::jsonb,
    'recent_discount_applications', '[]'::jsonb,
    'summary_30d', jsonb_build_object(
      'applications_count', 0,
      'total_saved', 0
    )
  );
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

  select exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'discounts'
  ) into has_discounts;

  select exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'combos'
  ) into has_combos;

  select exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'discount_applications'
  ) into has_discount_applications;

  if has_discounts then
    promotions_context := jsonb_set(
      promotions_context,
      '{active_discounts}',
      (
        select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb)
        from (
          select id, name, description, type, value, min_amount, min_quantity, applicable_to,
                 category_id, product_ids, valid_from, valid_until, active
          from public.discounts
          where active = true
            and (valid_from is null or now() >= valid_from)
            and (valid_until is null or now() <= valid_until)
          order by updated_at desc, created_at desc
          limit limit_safe
        ) d
      )
    );
  end if;

  if has_combos then
    promotions_context := jsonb_set(
      promotions_context,
      '{active_combos}',
      (
        select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
        from (
          select id, name, description, discount_type, discount_value, product_ids,
                 required_all, min_quantity_per_product, max_uses_per_sale,
                 valid_from, valid_until, active
          from public.combos
          where active = true
            and (valid_from is null or now() >= valid_from)
            and (valid_until is null or now() <= valid_until)
          order by updated_at desc, created_at desc
          limit limit_safe
        ) c
      )
    );
  end if;

  if has_discount_applications then
    promotions_context := jsonb_set(
      promotions_context,
      '{recent_discount_applications}',
      (
        select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb)
        from (
          select da.id,
                 da.sale_id,
                 da.discount_id,
                 da.combo_id,
                 da.discount_type,
                 da.discount_value,
                 da.amount_saved,
                 da.reason,
                 da.created_at,
                 d.name as discount_name,
                 c.name as combo_name
          from public.discount_applications da
          left join public.discounts d on d.id = da.discount_id
          left join public.combos c on c.id = da.combo_id
          order by da.created_at desc
          limit limit_safe
        ) a
      )
    );

    promotions_context := jsonb_set(
      promotions_context,
      '{summary_30d}',
      (
        select jsonb_build_object(
          'applications_count', coalesce(count(*), 0),
          'total_saved', coalesce(sum(da.amount_saved), 0)
        )
        from public.discount_applications da
        where da.created_at >= now() - interval '30 days'
      )
    );
  end if;

  result := jsonb_set(result, '{promotions}', promotions_context, true);

  return result;
end;
$$;

revoke all on function public.obtener_contexto_ia_completo(integer, boolean) from public;
grant execute on function public.obtener_contexto_ia_completo(integer, boolean) to service_role;
