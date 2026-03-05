-- Base comercial para descuentos y combos con trazabilidad.

create table if not exists public.discounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  type text not null check (type in ('percentage', 'fixed')),
  value numeric(12, 2) not null check (value > 0),
  min_amount numeric(12, 2) check (min_amount is null or min_amount >= 0),
  min_quantity numeric(12, 3) check (min_quantity is null or min_quantity > 0),
  applicable_to text not null default 'all' check (applicable_to in ('all', 'category', 'product')),
  category_id uuid references public.categories(id) on delete set null,
  product_ids uuid[] not null default '{}',
  valid_from timestamptz,
  valid_until timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until is null or valid_from is null or valid_until >= valid_from),
  check (
    (applicable_to <> 'category')
    or (applicable_to = 'category' and category_id is not null)
  ),
  check (
    (applicable_to <> 'product')
    or (applicable_to = 'product' and array_length(product_ids, 1) is not null)
  )
);

create table if not exists public.combos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value numeric(12, 2) not null check (discount_value > 0),
  product_ids uuid[] not null,
  required_all boolean not null default true,
  min_quantity_per_product numeric(12, 3) not null default 1 check (min_quantity_per_product > 0),
  max_uses_per_sale integer not null default 1 check (max_uses_per_sale > 0),
  valid_from timestamptz,
  valid_until timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until is null or valid_from is null or valid_until >= valid_from),
  check (array_length(product_ids, 1) is not null)
);

create table if not exists public.discount_applications (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  discount_id uuid references public.discounts(id) on delete set null,
  combo_id uuid references public.combos(id) on delete set null,
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value numeric(12, 2) not null check (discount_value > 0),
  amount_saved numeric(12, 2) not null check (amount_saved >= 0),
  reason text,
  created_at timestamptz not null default now(),
  check (discount_id is not null or combo_id is not null)
);

create index if not exists idx_discounts_active_validity
  on public.discounts (active, valid_from, valid_until);

create index if not exists idx_discounts_category_id
  on public.discounts (category_id);

create index if not exists idx_combos_active_validity
  on public.combos (active, valid_from, valid_until);

create index if not exists idx_discount_applications_sale_id
  on public.discount_applications (sale_id);

alter table public.discounts enable row level security;
alter table public.combos enable row level security;
alter table public.discount_applications enable row level security;

drop policy if exists discounts_select_all on public.discounts;
create policy discounts_select_all
  on public.discounts
  for select
  using (auth.uid() is not null);

drop policy if exists discounts_insert_admin on public.discounts;
create policy discounts_insert_admin
  on public.discounts
  for insert
  with check (
    ((auth.jwt() ->> 'role') = 'admin')
    or (((auth.jwt() -> 'user_metadata') ->> 'role') = 'admin')
    or is_admin_user()
  );

drop policy if exists discounts_update_admin on public.discounts;
create policy discounts_update_admin
  on public.discounts
  for update
  using (
    ((auth.jwt() ->> 'role') = 'admin')
    or (((auth.jwt() -> 'user_metadata') ->> 'role') = 'admin')
    or is_admin_user()
  )
  with check (
    ((auth.jwt() ->> 'role') = 'admin')
    or (((auth.jwt() -> 'user_metadata') ->> 'role') = 'admin')
    or is_admin_user()
  );

drop policy if exists discounts_delete_admin on public.discounts;
create policy discounts_delete_admin
  on public.discounts
  for delete
  using (
    ((auth.jwt() ->> 'role') = 'admin')
    or (((auth.jwt() -> 'user_metadata') ->> 'role') = 'admin')
    or is_admin_user()
  );

drop policy if exists combos_select_all on public.combos;
create policy combos_select_all
  on public.combos
  for select
  using (auth.uid() is not null);

drop policy if exists combos_insert_admin on public.combos;
create policy combos_insert_admin
  on public.combos
  for insert
  with check (
    ((auth.jwt() ->> 'role') = 'admin')
    or (((auth.jwt() -> 'user_metadata') ->> 'role') = 'admin')
    or is_admin_user()
  );

drop policy if exists combos_update_admin on public.combos;
create policy combos_update_admin
  on public.combos
  for update
  using (
    ((auth.jwt() ->> 'role') = 'admin')
    or (((auth.jwt() -> 'user_metadata') ->> 'role') = 'admin')
    or is_admin_user()
  )
  with check (
    ((auth.jwt() ->> 'role') = 'admin')
    or (((auth.jwt() -> 'user_metadata') ->> 'role') = 'admin')
    or is_admin_user()
  );

drop policy if exists combos_delete_admin on public.combos;
create policy combos_delete_admin
  on public.combos
  for delete
  using (
    ((auth.jwt() ->> 'role') = 'admin')
    or (((auth.jwt() -> 'user_metadata') ->> 'role') = 'admin')
    or is_admin_user()
  );

drop policy if exists discount_applications_select_own_or_admin on public.discount_applications;
create policy discount_applications_select_own_or_admin
  on public.discount_applications
  for select
  using (
    exists (
      select 1
      from public.sales s
      where s.id = discount_applications.sale_id
        and (
          s.seller_id = auth.uid()
          or ((auth.jwt() ->> 'role') = 'admin')
          or (((auth.jwt() -> 'user_metadata') ->> 'role') = 'admin')
          or is_admin_user()
        )
    )
  );

drop policy if exists discount_applications_insert_own_or_admin on public.discount_applications;
create policy discount_applications_insert_own_or_admin
  on public.discount_applications
  for insert
  with check (
    exists (
      select 1
      from public.sales s
      where s.id = discount_applications.sale_id
        and (
          s.seller_id = auth.uid()
          or ((auth.jwt() ->> 'role') = 'admin')
          or (((auth.jwt() -> 'user_metadata') ->> 'role') = 'admin')
          or is_admin_user()
        )
    )
  );

drop policy if exists discount_applications_delete_admin on public.discount_applications;
create policy discount_applications_delete_admin
  on public.discount_applications
  for delete
  using (
    ((auth.jwt() ->> 'role') = 'admin')
    or (((auth.jwt() -> 'user_metadata') ->> 'role') = 'admin')
    or is_admin_user()
  );

create or replace view public.discount_impact_daily as
select
  date(s.created_at) as fecha,
  count(distinct s.id) as total_sales,
  count(distinct case when coalesce(s.discount, 0) > 0 then s.id end) as sales_with_discount,
  coalesce(sum(s.discount), 0)::numeric(12, 2) as total_discount_amount,
  coalesce(sum(s.total), 0)::numeric(12, 2) as total_revenue,
  case
    when coalesce(sum(s.total), 0) <= 0 then 0::numeric(10, 2)
    else round((coalesce(sum(s.discount), 0) / nullif(sum(s.total), 0)) * 100, 2)
  end as discount_percent_of_revenue
from public.sales s
where coalesce(s.status, 'completed') = 'completed'
group by date(s.created_at)
order by fecha desc;

create or replace function public.validate_discount_eligible(
  p_discount_id uuid,
  p_sale_total numeric,
  p_product_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_discount public.discounts%rowtype;
  v_now timestamptz := now();
  v_product_match boolean := false;
  v_message text := 'Elegible';
begin
  select *
  into v_discount
  from public.discounts
  where id = p_discount_id;

  if not found then
    return jsonb_build_object('eligible', false, 'reason', 'Descuento no encontrado');
  end if;

  if not v_discount.active then
    return jsonb_build_object('eligible', false, 'reason', 'Descuento inactivo');
  end if;

  if v_discount.valid_from is not null and v_now < v_discount.valid_from then
    return jsonb_build_object('eligible', false, 'reason', 'Descuento aun no vigente');
  end if;

  if v_discount.valid_until is not null and v_now > v_discount.valid_until then
    return jsonb_build_object('eligible', false, 'reason', 'Descuento vencido');
  end if;

  if v_discount.min_amount is not null and coalesce(p_sale_total, 0) < v_discount.min_amount then
    return jsonb_build_object('eligible', false, 'reason', 'Monto minimo no alcanzado');
  end if;

  if v_discount.applicable_to = 'product' then
    select exists (
      select 1
      from unnest(coalesce(v_discount.product_ids, '{}')) as d(pid)
      where d.pid = any(coalesce(p_product_ids, '{}'))
    )
    into v_product_match;

    if not v_product_match then
      return jsonb_build_object('eligible', false, 'reason', 'No aplica a productos del carrito');
    end if;
  elsif v_discount.applicable_to = 'category' then
    select exists (
      select 1
      from public.products p
      where p.id = any(coalesce(p_product_ids, '{}'))
        and p.category_id = v_discount.category_id
    )
    into v_product_match;

    if not v_product_match then
      return jsonb_build_object('eligible', false, 'reason', 'No aplica a categorias del carrito');
    end if;
  end if;

  return jsonb_build_object(
    'eligible', true,
    'reason', v_message,
    'discount_type', v_discount.type,
    'discount_value', v_discount.value,
    'discount_name', v_discount.name
  );
end;
$$;

create or replace function public.detectar_combos_disponibles(
  p_product_ids uuid[]
)
returns table (
  combo_id uuid,
  combo_name text,
  discount_type text,
  discount_value numeric,
  matched_count integer,
  required_count integer,
  is_fully_eligible boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select *
    from public.combos
    where active = true
      and (valid_from is null or now() >= valid_from)
      and (valid_until is null or now() <= valid_until)
  ),
  m as (
    select
      c.id,
      c.name,
      c.discount_type,
      c.discount_value,
      c.required_all,
      array_length(c.product_ids, 1) as required_count,
      (
        select count(*)
        from unnest(c.product_ids) cp
        where cp = any(coalesce(p_product_ids, '{}'))
      ) as matched_count
    from c
  )
  select
    m.id as combo_id,
    m.name as combo_name,
    m.discount_type,
    m.discount_value,
    coalesce(m.matched_count, 0)::integer as matched_count,
    coalesce(m.required_count, 0)::integer as required_count,
    case
      when m.required_all then coalesce(m.matched_count, 0) >= coalesce(m.required_count, 0)
      else coalesce(m.matched_count, 0) > 0
    end as is_fully_eligible
  from m
  where coalesce(m.matched_count, 0) > 0
  order by is_fully_eligible desc, matched_count desc, combo_name asc;
$$;

grant select on public.discount_impact_daily to authenticated;
grant execute on function public.validate_discount_eligible(uuid, numeric, uuid[]) to authenticated;
grant execute on function public.detectar_combos_disponibles(uuid[]) to authenticated;
