import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_PROMPT = `Eres un analista experto en retail y promociones para un sistema POS en Honduras.
Moneda: HNL (Lempiras hondureños), prefijo L.

Tu tarea es analizar los patrones de compra y sugerir descuentos y combos que maximicen ventas y fidelización.

REGLAS ESTRICTAS DE FORMATO:
- Responde ÚNICAMENTE con un JSON válido, sin texto adicional, sin markdown, sin backticks.
- El JSON debe tener exactamente esta estructura:
{
  "suggestions": [
    {
      "type": "discount" | "combo",
      "name": "Nombre corto y descriptivo",
      "description": "Descripción breve",
      "reason": "Explicación de por qué se recomienda (1-2 oraciones basadas en datos)",
      "discount_type": "percentage" | "fixed",
      "discount_value": number,
      "applicable_to": "all" | "category" | "product",
      "category_id": "uuid o null",
      "category_name": "nombre o null",
      "product_ids": ["uuid", ...],
      "product_names": ["nombre", ...],
      "priority": "alta" | "media" | "baja",
      "estimated_impact": "Impacto esperado en 1 oración"
    }
  ]
}

DIRECTRICES:
1. Sugiere entre 3 y 6 promociones variadas (mezcla de descuentos y combos)
2. Basa tus sugerencias en los datos reales proporcionados
3. Para combos: usa product_ids de productos que se compran juntos frecuentemente
4. Para descuentos de categoría: usa el category_id real
5. No dupliques promociones que ya existen
6. Los valores de descuento deben ser razonables (5-25% o L 5-50 fijos)
7. Prioriza productos sin promoción existente y con alta frecuencia de venta
8. El campo "reason" debe explicar brevemente por qué basándote en datos concretos
9. Responde SOLO con el JSON, nada más`;

type SuggestionItem = {
  type: "discount" | "combo";
  name: string;
  description: string;
  reason: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  applicable_to: "all" | "category" | "product";
  category_id: string | null;
  category_name: string | null;
  product_ids: string[];
  product_names: string[];
  priority: "alta" | "media" | "baja";
  estimated_impact: string;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ error: "Servicio de IA no configurado" }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Authenticate user
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "No autorizado: sesión inválida" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check admin role
    const { data: userProfile, error: profileError } = await supabaseUser
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !userProfile || userProfile.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Acceso denegado: solo administradores" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch purchase patterns analysis
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: analysisData, error: analysisError } =
      await supabaseAdmin.rpc("analizar_patrones_compra_para_descuentos");

    if (analysisError) {
      console.error("Error fetching analysis:", analysisError);
      return new Response(
        JSON.stringify({
          error: "Error al analizar patrones de compra",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Call Gemini
    const userPrompt = `Analiza estos patrones de compra y sugiere descuentos y combos óptimos:\n\n${JSON.stringify(analysisData)}`;

    const geminiBody = {
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        maxOutputTokens: 2000,
        temperature: 0.4,
        responseMimeType: "application/json",
      },
    };

    const geminiRes = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": geminiApiKey,
      },
      body: JSON.stringify(geminiBody),
    });

    if (!geminiRes.ok) {
      const errorText = await geminiRes.text();
      console.error("Gemini error:", geminiRes.status, errorText);
      return new Response(
        JSON.stringify({ error: "Error al consultar modelo de IA" }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const geminiData = await geminiRes.json();
    const rawText =
      geminiData.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? "")
        .join("")
        .trim() || "";

    let suggestions: SuggestionItem[] = [];

    try {
      const parsed = JSON.parse(rawText);
      suggestions = Array.isArray(parsed.suggestions)
        ? parsed.suggestions
        : Array.isArray(parsed)
          ? parsed
          : [];
    } catch {
      console.error("Failed to parse Gemini response as JSON:", rawText);
      return new Response(
        JSON.stringify({
          error: "La IA no generó sugerencias válidas. Intenta de nuevo.",
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate and sanitize suggestions
    suggestions = suggestions
      .filter(
        (s) =>
          s.type &&
          s.name &&
          s.discount_type &&
          typeof s.discount_value === "number" &&
          s.discount_value > 0
      )
      .map((s) => ({
        type: s.type === "combo" ? "combo" : "discount",
        name: String(s.name).slice(0, 100),
        description: String(s.description || "").slice(0, 300),
        reason: String(s.reason || "").slice(0, 500),
        discount_type:
          s.discount_type === "fixed" ? "fixed" : "percentage",
        discount_value: Math.min(
          s.discount_value,
          s.discount_type === "percentage" ? 50 : 200
        ),
        applicable_to: s.applicable_to || "all",
        category_id: s.category_id || null,
        category_name: s.category_name || null,
        product_ids: Array.isArray(s.product_ids) ? s.product_ids : [],
        product_names: Array.isArray(s.product_names)
          ? s.product_names
          : [],
        priority: ["alta", "media", "baja"].includes(s.priority)
          ? s.priority
          : "media",
        estimated_impact: String(s.estimated_impact || "").slice(0, 200),
      }));

    return new Response(
      JSON.stringify({
        success: true,
        suggestions,
        analysis_summary: {
          total_sales: analysisData.basket_metrics?.total_sales ?? 0,
          avg_basket: analysisData.basket_metrics?.avg_basket_value ?? 0,
          top_products_count: analysisData.top_products?.length ?? 0,
          copurchase_pairs: analysisData.co_purchased_products?.length ?? 0,
          products_without_promos:
            analysisData.products_without_promotions?.length ?? 0,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("sugerir-descuentos error:", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
