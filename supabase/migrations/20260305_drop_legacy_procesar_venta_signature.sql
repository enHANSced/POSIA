-- Elimina la firma legacy para evitar ambiguedad en llamadas RPC.

drop function if exists public.procesar_venta_completa(
  jsonb,
  numeric,
  numeric,
  numeric,
  numeric,
  text,
  text,
  uuid
);
