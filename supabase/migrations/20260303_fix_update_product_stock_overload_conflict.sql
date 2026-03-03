DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'update_product_stock'
      AND pg_get_function_identity_arguments(p.oid) = 'p_product_id uuid, p_quantity integer'
  ) THEN
    DROP FUNCTION public.update_product_stock(uuid, integer);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.update_product_stock(
  p_product_id uuid,
  p_quantity numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.products
  SET stock = COALESCE(stock, 0) + p_quantity,
      updated_at = now()
  WHERE id = p_product_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_product_stock(uuid, numeric) TO anon, authenticated;
