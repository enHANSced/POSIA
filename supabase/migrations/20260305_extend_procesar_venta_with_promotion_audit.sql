-- Extiende la venta transaccional para auditar descuentos/combos en la misma transacción.

create or replace function public.procesar_venta_completa(
  p_items jsonb,
  p_total numeric,
  p_subtotal numeric,
  p_tax_amount numeric,
  p_discount numeric default 0,
  p_payment_method text default 'efectivo',
  p_notes text default null,
  p_seller_id uuid default auth.uid(),
  p_promotion_id uuid default null,
  p_promotion_source text default null,
  p_promotion_type text default null,
  p_promotion_value numeric default null,
  p_promotion_amount numeric default null,
  p_promotion_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sale_number text;
  v_sale_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric(10,3);
  v_current_stock numeric(10,3);
begin
  v_sale_number := 'VTA-' || extract(epoch from now())::bigint::text || '-' || substring(gen_random_uuid()::text, 1, 4);

  insert into sales (
    sale_number, seller_id, items, subtotal, tax_amount, discount, total, payment_method, status, notes
  ) values (
    v_sale_number, p_seller_id, p_items, p_subtotal, p_tax_amount, p_discount, p_total, p_payment_method, 'completed', p_notes
  )
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric(10,3);

    select stock into v_current_stock from products where id = v_product_id for update;

    if v_current_stock is null then
      raise exception 'Producto no encontrado: %', v_product_id;
    end if;

    if v_current_stock < v_quantity then
      raise exception 'Stock insuficiente para producto %: disponible %, solicitado %',
        v_product_id, v_current_stock, v_quantity;
    end if;

    update products
    set stock = stock - v_quantity, updated_at = now()
    where id = v_product_id;

    insert into inventory_movements (product_id, type, quantity, reason, user_id)
    values (v_product_id, 'sale', -v_quantity, 'Venta ' || v_sale_number, p_seller_id);
  end loop;

  if coalesce(p_promotion_amount, 0) > 0
    and p_promotion_type in ('percentage', 'fixed')
    and p_promotion_source in ('discount', 'combo')
    and p_promotion_id is not null then

    insert into discount_applications (
      sale_id,
      discount_id,
      combo_id,
      discount_type,
      discount_value,
      amount_saved,
      reason
    ) values (
      v_sale_id,
      case when p_promotion_source = 'discount' then p_promotion_id else null end,
      case when p_promotion_source = 'combo' then p_promotion_id else null end,
      p_promotion_type,
      coalesce(p_promotion_value, p_promotion_amount),
      p_promotion_amount,
      coalesce(p_promotion_name, p_promotion_source)
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'sale_id', v_sale_id,
    'sale_number', v_sale_number,
    'total', p_total,
    'items_count', jsonb_array_length(p_items)
  );
end;
$function$;
