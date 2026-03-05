import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type PromotionBody = {
  id?: string;
  source?: "discount" | "combo" | "manual";
  type?: "percentage" | "fixed";
  value?: number;
  amount?: number;
  name?: string;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parsePromotion(value: unknown): PromotionBody | null {
  if (!value || typeof value !== "object") return null;

  const obj = value as Record<string, unknown>;
  const source = obj.source;
  const type = obj.type;

  if (source !== "discount" && source !== "combo" && source !== "manual") {
    return null;
  }

  if (type !== "percentage" && type !== "fixed") {
    return null;
  }

  return {
    id: typeof obj.id === "string" ? obj.id : undefined,
    source,
    type,
    value: typeof obj.value === "number" ? obj.value : undefined,
    amount: typeof obj.amount === "number" ? obj.amount : undefined,
    name: typeof obj.name === "string" ? obj.name : undefined,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método no permitido" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "No autorizado: falta token de autenticación" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      return jsonResponse({ error: "No autorizado: sesión inválida" }, 401);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Body JSON inválido" }, 400);
    }

    const {
      items,
      total,
      subtotal,
      tax_amount,
      discount,
      payment_method,
      notes,
      customer_name,
      customer_rtn,
      promotion,
    } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return jsonResponse({ error: "Debe incluir al menos un producto en la venta" }, 400);
    }

    if (!total || (total as number) <= 0) {
      return jsonResponse({ error: "El total debe ser mayor a 0" }, 400);
    }

    const validPaymentMethods = ["efectivo", "tarjeta", "otro"];
    if (!payment_method || !validPaymentMethods.includes(payment_method as string)) {
      return jsonResponse(
        { error: `Método de pago inválido. Use: ${validPaymentMethods.join(", ")}` },
        400,
      );
    }

    for (const item of items as Array<Record<string, unknown>>) {
      if (!item.product_id || !item.quantity || (item.quantity as number) <= 0) {
        return jsonResponse(
          { error: "Item inválido: cada item debe tener product_id y quantity > 0" },
          400,
        );
      }
    }

    const parsedPromotion = parsePromotion(promotion);

    const { data, error } = await supabaseAdmin.rpc("procesar_venta_completa", {
      p_items: items,
      p_total: total,
      p_subtotal: subtotal || 0,
      p_tax_amount: tax_amount || 0,
      p_discount: discount || 0,
      p_payment_method: payment_method,
      p_notes: notes || null,
      p_seller_id: user.id,
      p_promotion_id:
        parsedPromotion?.source !== "manual" && parsedPromotion?.id
          ? parsedPromotion.id
          : null,
      p_promotion_source:
        parsedPromotion?.source === "discount" || parsedPromotion?.source === "combo"
          ? parsedPromotion.source
          : null,
      p_promotion_type: parsedPromotion?.type || null,
      p_promotion_value: parsedPromotion?.value ?? null,
      p_promotion_amount: parsedPromotion?.amount ?? null,
      p_promotion_name: parsedPromotion?.name ?? null,
    });

    if (error) {
      console.error("Error al procesar venta:", JSON.stringify(error));

      let userMessage = "Error al procesar la venta";
      if (error.message?.includes("Stock insuficiente")) {
        userMessage = error.message;
      } else if (error.message?.includes("Producto no encontrado")) {
        userMessage = error.message;
      } else {
        userMessage = error.message || userMessage;
      }

      return jsonResponse({ error: userMessage, details: error.message }, 400);
    }

    const { data: sellerProfile } = await supabaseAdmin
      .from("user_profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    const saleData = (data as Record<string, unknown>) || {};

    return jsonResponse({
      success: true,
      sale: {
        sale_id: saleData.sale_id || null,
        sale_number: saleData.sale_number || "N/A",
        total: saleData.total || total,
        items_count: saleData.items_count || (items as Array<unknown>).length,
      },
      seller_name: sellerProfile?.full_name || user.email,
      customer_name: customer_name || null,
      customer_rtn: customer_rtn || null,
      applied_promotion: parsedPromotion || null,
      message: `Venta ${saleData.sale_number || ""} procesada exitosamente`,
    });
  } catch (err) {
    console.error("Error inesperado:", err);
    return jsonResponse(
      { error: "Error interno del servidor", details: (err as Error).message },
      500,
    );
  }
});
