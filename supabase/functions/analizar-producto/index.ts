import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

type Suggestion = {
  name?: string;
  description?: string;
  category_name?: string;
  sell_by?: "unit" | "weight";
  sku?: string;
  barcode?: string;
  price?: number;
  cost?: number;
  tax_rate?: number;
  min_stock?: number;
};

type WebSource = {
  url: string;
  title: string;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    groundingMetadata?: {
      webSearchQueries?: string[];
      groundingChunks?: Array<{
        web?: { uri?: string; title?: string };
      }>;
    };
  }>;
};

function extraerTextoModelo(data: GeminiResponse): string {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((p) => (typeof p?.text === "string" ? p.text : ""))
    .join("\n")
    .trim();
}

function parsearJsonSeguro(texto: string): Suggestion {
  if (!texto) return {};

  try {
    return JSON.parse(texto) as Suggestion;
  } catch {
    const match = texto.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      return JSON.parse(match[0]) as Suggestion;
    } catch {
      return {};
    }
  }
}

function extractWebSources(data: GeminiResponse): WebSource[] {
  const chunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];

  const sources: WebSource[] = [];
  const seenUrls = new Set<string>();

  for (const chunk of chunks) {
    const url = chunk.web?.uri;
    const title = chunk.web?.title;
    if (url && !seenUrls.has(url)) {
      seenUrls.add(url);
      sources.push({ url, title: title || url });
    }
  }

  return sources;
}

function buildGeminiBody(
  prompt: string,
  imageBase64: string,
  mimeType: string,
  useSnakeCase: boolean,
  useGoogleSearch: boolean,
) {
  const imagePart = useSnakeCase
    ? {
        inline_data: {
          mime_type: mimeType,
          data: imageBase64,
        },
      }
    : {
        inlineData: {
          mimeType,
          data: imageBase64,
        },
      };

  const body: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }, imagePart],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 800,
    },
  };

  // Agregar herramienta de Google Search para investigación de precios
  if (useGoogleSearch) {
    body.tools = [{ google_search: {} }];
  }

  return body;
}

async function callGemini(
  geminiApiKey: string,
  prompt: string,
  imageBase64: string,
  mimeType: string,
  useGoogleSearch: boolean,
) {
  for (const useSnakeCase of [false, true]) {
    const body = buildGeminiBody(prompt, imageBase64, mimeType, useSnakeCase, useGoogleSearch);
    const geminiRes = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": geminiApiKey,
      },
      body: JSON.stringify(body),
    });

    if (geminiRes.ok) {
      return { ok: true as const, data: (await geminiRes.json()) as GeminiResponse };
    }

    const errorBody = await geminiRes.text();
    console.error("Gemini error", { status: geminiRes.status, useSnakeCase, useGoogleSearch, body: errorBody });
  }

  return { ok: false as const, data: null };
}

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
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

    if (!geminiApiKey) {
      return new Response(JSON.stringify({ error: "Servicio IA no configurado" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "No autorizado: sesión inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const imageBase64 = typeof body?.imageBase64 === "string" ? body.imageBase64 : "";
    const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "image/jpeg";
    const barcode = typeof body?.barcode === "string" ? body.barcode : "";
    const categoriesFromClient = Array.isArray(body?.categories) ? body.categories.filter((c: unknown) => typeof c === "string") : [];

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "Imagen requerida" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const categoriesSection = categoriesFromClient.length > 0
      ? `\nCategorías disponibles en el sistema: [${categoriesFromClient.join(", ")}]\nPara "category_name": revisa las categorías listadas arriba. Usa una de ellas SOLO si el producto realmente pertenece a esa categoría. NO fuerces un producto en una categoría incorrecta. Por ejemplo, frutas y verduras NO son "Abarrotes", carnes NO son "Lácteos". Si NINGUNA categoría de la lista es genuinamente apropiada para este producto, sugiere el nombre de una NUEVA categoría en español que sea adecuada (ej: "Frutas y Verduras", "Carnes y Embutidos", "Panadería", "Congelados", etc.). Preferir crear una categoría correcta antes que forzar una incorrecta.`
      : `\nPara "category_name" sugiere una categoría en español apropiada para el producto (ej: Bebidas, Snacks, Limpieza, Lácteos, Abarrotes, Frutas y Verduras, Carnes).`;

    const prompt = `Eres un experto en productos retail del mercado hondureño. Analiza la imagen del producto y responde SOLO con un JSON válido.
Si no puedes inferir un campo, déjalo vacío o no lo incluyas.
Usa este formato exacto:
{
  "name": "nombre del producto en español",
  "description": "descripción breve en español del producto",
  "category_name": "categoría del producto",
  "sell_by": "unit",
  "sku": "código SKU si es visible",
  "barcode": "código de barras si es visible",
  "price": 0,
  "cost": 0,
  "tax_rate": 15,
  "min_stock": 5
}

Reglas importantes:
- CONTEXTO: Tienda retail en HONDURAS. Todos los precios en Lempiras (HNL).
- "price": precio de venta al público en Honduras en Lempiras. USA GOOGLE SEARCH para investigar el precio REAL y ACTUAL de este producto en supermercados y tiendas de Honduras (La Colonia, PriceSmart, Walmart Honduras, Diunsa, pulperías). Si encuentras múltiples precios, usa el promedio. Si no encuentras precio exacto, estima basándote en productos similares del mercado hondureño. Debe ser un número sin símbolo de moneda.
- "cost": costo estimado de compra/mayorista (normalmente 60-75% del precio de venta). Número sin símbolo.
- "tax_rate": tasa de impuesto ISV de Honduras. Usa 15 para la mayoría de productos. Usa 18 para bebidas alcohólicas, cigarrillos y productos de lujo. Usa 0 para productos de la canasta básica exentos (granos básicos, leche, huevos, medicinas).
- "min_stock": stock mínimo recomendado para alertas de reposición. Estima según el tipo de producto:
  * Productos de alta rotación (bebidas, snacks, lácteos): 10-20 unidades
  * Productos de rotación media (enlatados, abarrotes, limpieza): 5-10 unidades
  * Productos de baja rotación (especializados, premium): 3-5 unidades
  * Productos perecederos: 5-15 unidades (depende de vida útil)
  Considera que es una tienda retail pequeña/mediana en Honduras.
- "name": nombre comercial del producto en español.
- "description": descripción breve y útil en español.
- "sell_by": tipo de venta del producto. Usa "unit" para productos que se venden por unidad (la mayoría: latas, botellas, paquetes, cajas). Usa "weight" para productos que se venden a granel o por peso (frutas, verduras, carnes, granos sueltos, embutidos por libra, quesos). Si el producto se vende típicamente por libra/kilo en un supermercado hondureño, usa "weight".
${categoriesSection}
- No escribas texto fuera del JSON, SOLO responde con el JSON.
${barcode ? `Código de barras proporcionado por el usuario: ${barcode}` : ""}

IMPORTANTE: Investiga precios reales del mercado hondureño usando búsqueda web. Tu sugerencia de precio debe reflejar precios actuales en Honduras.`;

    // Intentar primero CON Google Search para precios más precisos
    let geminiCall = await callGemini(geminiApiKey, prompt, imageBase64, mimeType, true);

    // Si falla con Google Search, reintentar SIN búsqueda web
    if (!geminiCall.ok) {
      console.warn("Reintentando análisis de producto sin Google Search...");
      geminiCall = await callGemini(geminiApiKey, prompt, imageBase64, mimeType, false);
    }

    if (!geminiCall.ok) {
      return new Response(
        JSON.stringify({ error: "Error analizando imagen con IA" }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const textoModelo = extraerTextoModelo(geminiCall.data!);
    const suggestion = parsearJsonSeguro(textoModelo);

    // Extraer fuentes web consultadas para los precios
    const webSources = extractWebSources(geminiCall.data!);
    const searchQueries = geminiCall.data?.candidates?.[0]?.groundingMetadata?.webSearchQueries || [];

    if (webSources.length > 0) {
      console.log("Producto analizado con web search:", { searchQueries, sourcesCount: webSources.length });
    }

    return new Response(
      JSON.stringify({
        success: true,
        suggestion,
        price_sources: webSources,
        search_queries: searchQueries,
        price_researched: webSources.length > 0,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("analizar-producto error", error);
    return new Response(JSON.stringify({ error: "Error interno del servidor" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
