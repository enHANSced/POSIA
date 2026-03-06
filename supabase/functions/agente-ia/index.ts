import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_INSTRUCTION = `Eres un analista senior del sistema POS Retail IA.
La moneda es HNL (Lempiras hondureños), prefijo L.
Formato de 12 horas para horas (AM/PM).
Ve directo al grano pero actua como profesional experto en análisis de datos de retail, ventas, inventarios, desempeño de vendedores, precios y mercado local hondureño.

Tu contexto cubre TODO el sistema:
- Ventas y rendimiento por periodos
- Inventario, stock bajo y reposición
- Productos y categorías
- Desempeño por vendedor/equipo
- Preferencias de notificaciones y operación general

CAPACIDADES ESPECIALES - BÚSQUEDA WEB:
Tienes acceso a Google Search para buscar información en tiempo real de internet. ÚSALO ACTIVAMENTE cuando:
- El usuario pregunte sobre precios de productos: busca en tiendas y supermercados de Honduras (La Colonia, PriceSmart, Walmart Honduras, Diunsa, etc.)
- Necesites comparar precios del mercado local con los precios del sistema
- El usuario pregunte cosas que requieran datos actualizados (tendencias, temporadas, etc.)
- Quieras validar precios sugeridos contra precios reales del mercado hondureño
- Busques información sobre productos, proveedores o competencia en Honduras

Cuando uses búsqueda web para sugerir precios o información, SIEMPRE menciona las fuentes de donde obtuviste la información.

También tienes acceso a URL Context para leer contenido directamente de páginas web específicas. Si el usuario proporciona URLs o si encuentras URLs relevantes en la búsqueda, puedes acceder al contenido de esas páginas para dar respuestas más detalladas.

Objetivos:
1) Entregar respuestas accionables y priorizadas
2) Usar datos reales del contexto JSON adjunto
3) Mantener continuidad con el historial de la conversación
4) Proponer siguientes pasos concretos
5) Cuando sea relevante, buscar precios y datos en internet para comparar con los datos internos del sistema

SUGERENCIAS DE SEGUIMIENTO:
Al final de CADA respuesta, agrega un bloque especial con 3 preguntas de seguimiento relevantes, que sean como sugerencias de prompt al usuario para continuar la conversacion, que sean breves.
Usa EXACTAMENTE este formato (las etiquetas son obligatorias):
[SUGERENCIAS]
1. Primera pregunta de seguimiento específica y accionable
2. Segunda pregunta de seguimiento diferente
3. Tercera pregunta de seguimiento que profundice otro ángulo
[/SUGERENCIAS]

Las sugerencias deben ser:
- Específicas al tema que se acaba de discutir
- Que profundicen en los datos mencionados en la respuesta
- Accionables (que pidan análisis, comparaciones, planes, recomendaciones)
- Variadas (no repetir el mismo tipo de pregunta)
- En español, claras y concisas

Reglas:
- Responde siempre en español
- Sé claro, directo y práctico
- No inventes datos
- Si falta contexto, dilo explícitamente
- Cuando recomiendes acciones, indica impacto esperado y prioridad (Alta/Media/Baja)
- Si buscaste información en internet, indica las fuentes consultadas
- SIEMPRE incluye el bloque [SUGERENCIAS] al final`;

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

type WebSource = {
  url: string;
  title: string;
};

type GroundingSupport = {
  text: string;
  sourceIndices: number[];
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
      groundingSupports?: Array<{
        segment?: { startIndex?: number; endIndex?: number; text?: string };
        groundingChunkIndices?: number[];
      }>;
      searchEntryPoint?: {
        renderedContent?: string;
      };
    };
    urlContextMetadata?: {
      urlMetadata?: Array<{
        retrievedUrl?: string;
        urlRetrievalStatus?: string;
      }>;
    };
  }>;
};

type SaleRow = {
  seller_id: string | null;
  total: number | null;
  status: string | null;
  created_at: string | null;
};

type UserProfileRow = {
  id: string;
  full_name: string | null;
  email: string;
  role: string | null;
  active: boolean | null;
};

type SellerPerformance = {
  seller_id: string;
  seller_name: string;
  total_sales: number;
  total_revenue: number;
  avg_ticket: number;
  sales_last_7d: number;
  revenue_last_7d: number;
  last_sale_at: string | null;
};

type SystemOverview = {
  app_modules: string[];
  sales_today: {
    total_sales: number;
    total_revenue: number;
    average_sale: number;
  };
  top_products: Array<{
    name: string;
    units_sold: number;
    stock: number | null;
    price: number | null;
  }>;
  low_stock_alerts: Array<{
    id: string;
    name: string;
    stock: number;
    min_stock: number;
    category_name: string | null;
  }>;
  inventory_recent_movements: Array<{
    type: string;
    quantity: number;
    reason: string | null;
    created_at: string | null;
    product_name: string | null;
  }>;
  recent_products_added: Array<{
    id: string;
    name: string;
    stock: number | null;
    min_stock: number | null;
    price: number | null;
    created_at: string | null;
    category_name: string | null;
  }>;
  products_added_summary: {
    last_7_days: number;
    last_30_days: number;
  };
  products_summary: {
    active_products: number;
    inactive_products: number;
    total_products: number;
  };
  staff_summary: {
    active_staff: number;
    by_role: Record<string, number>;
  };
  notifications_summary: {
    total_push_subscriptions: number;
    users_with_preferences: number;
    sales_push_enabled_users: number;
    low_stock_push_enabled_users: number;
  };
};

type ProductBasicRow = {
  id: string;
  name: string | null;
  stock: number | null;
  min_stock: number | null;
  price: number | null;
  created_at: string | null;
  category_id: string | null;
};

type CategoryBasicRow = {
  id: string;
  name: string;
};

type ProductNameRow = {
  id: string;
  name: string | null;
};

type InventoryMovementRow = {
  type: string;
  quantity: number | null;
  reason: string | null;
  created_at: string | null;
  product_id: string;
};

type TopProductRow = {
  name: string | null;
  units_sold: number | null;
  stock: number | null;
  price: number | null;
};

type LowStockRow = {
  id: string | null;
  name: string | null;
  stock: number | null;
  min_stock: number | null;
  category_name: string | null;
};

type NotificationPreferenceRow = {
  user_id: string;
  sales_push: boolean;
  low_stock_push: boolean;
};

function maxDateIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a) > new Date(b) ? a : b;
}

function buildSellerPerformance(sales: SaleRow[], profiles: UserProfileRow[]): SellerPerformance[] {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  const performanceMap = new Map<string, SellerPerformance>();

  for (const sale of sales) {
    if (!sale.seller_id) continue;
    if (sale.status !== "completed") continue;

    const amount = Number(sale.total || 0);
    const saleDate = sale.created_at ? new Date(sale.created_at) : null;
    const profile = profileMap.get(sale.seller_id);

    const current = performanceMap.get(sale.seller_id) || {
      seller_id: sale.seller_id,
      seller_name: profile?.full_name || "Sin nombre",
      total_sales: 0,
      total_revenue: 0,
      avg_ticket: 0,
      sales_last_7d: 0,
      revenue_last_7d: 0,
      last_sale_at: null,
    };

    current.total_sales += 1;
    current.total_revenue += amount;
    current.last_sale_at = maxDateIso(current.last_sale_at, sale.created_at || null);

    if (saleDate && saleDate >= sevenDaysAgo) {
      current.sales_last_7d += 1;
      current.revenue_last_7d += amount;
    }

    performanceMap.set(sale.seller_id, current);
  }

  return Array.from(performanceMap.values())
    .map((item) => ({
      ...item,
      avg_ticket: item.total_sales > 0 ? item.total_revenue / item.total_sales : 0,
    }))
    .sort((a, b) => b.total_revenue - a.total_revenue);
}

async function fetchSellerPerformance(supabaseAdmin: ReturnType<typeof createClient>) {
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 30);

  const { data: salesData, error: salesError } = await supabaseAdmin
    .from("sales")
    .select("seller_id, total, status, created_at")
    .gte("created_at", fromDate.toISOString());

  if (salesError) throw salesError;

  const { data: profilesData, error: profilesError } = await supabaseAdmin
    .from("user_profiles")
    .select("id, full_name, email, role, active")
    .in("role", ["seller", "admin"]);

  if (profilesError) throw profilesError;

  const performance = buildSellerPerformance(
    (salesData || []) as SaleRow[],
    (profilesData || []) as UserProfileRow[]
  );

  return {
    period_days: 30,
    sellers_analyzed: performance.length,
    top_by_revenue: performance.slice(0, 5),
    top_by_sales: [...performance].sort((a, b) => b.total_sales - a.total_sales).slice(0, 5),
  };
}

async function fetchSystemOverview(supabaseAdmin: ReturnType<typeof createClient>): Promise<SystemOverview> {
  const appModules = [
    "Punto de Venta",
    "Productos",
    "Inventario",
    "Historial",
    "Reportes",
    "Empleados",
    "Configuración",
    "Notificaciones",
    "Asistente IA"
  ];

  const [
    salesTodayRes,
    topProductsRes,
    lowStockRes,
    movementsRes,
    recentProductsRes,
    productsAdded7dRes,
    productsAdded30dRes,
    activeProductsCountRes,
    inactiveProductsCountRes,
    profilesRes,
    subsCountRes,
    prefsRes,
  ] = await Promise.all([
    supabaseAdmin.from("sales_summary_today").select("total_sales, total_revenue, average_sale").maybeSingle(),
    supabaseAdmin.from("top_selling_products").select("name, units_sold, stock, price").limit(5),
    supabaseAdmin.from("low_stock_products").select("id, name, stock, min_stock, category_name").limit(10),
    supabaseAdmin
      .from("inventory_movements")
      .select("type, quantity, reason, created_at, product_id")
      .order("created_at", { ascending: false })
      .limit(12),
    supabaseAdmin
      .from("products")
      .select("id, name, stock, min_stock, price, created_at, category_id")
      .order("created_at", { ascending: false })
      .limit(15),
    supabaseAdmin
      .from("products")
      .select("id", { head: true, count: "exact" })
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    supabaseAdmin
      .from("products")
      .select("id", { head: true, count: "exact" })
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    supabaseAdmin.from("products").select("id", { head: true, count: "exact" }).eq("active", true),
    supabaseAdmin.from("products").select("id", { head: true, count: "exact" }).eq("active", false),
    supabaseAdmin.from("user_profiles").select("role, active"),
    supabaseAdmin.from("push_subscriptions").select("id", { head: true, count: "exact" }),
    supabaseAdmin.from("notification_preferences").select("user_id, sales_push, low_stock_push"),
  ]);

  const queryErrors = [
    salesTodayRes.error,
    topProductsRes.error,
    lowStockRes.error,
    movementsRes.error,
    recentProductsRes.error,
    productsAdded7dRes.error,
    productsAdded30dRes.error,
    activeProductsCountRes.error,
    inactiveProductsCountRes.error,
    profilesRes.error,
    subsCountRes.error,
    prefsRes.error,
  ].filter(Boolean);

  if (queryErrors.length > 0) {
    throw queryErrors[0];
  }

  const productsFromMovements = new Set(
    (movementsRes.data || [])
      .map((row: InventoryMovementRow) => row.product_id)
      .filter((id): id is string => Boolean(id)),
  );

  const { data: movementProductsData, error: movementProductsError } = productsFromMovements.size > 0
    ? await supabaseAdmin
      .from("products")
      .select("id, name")
      .in("id", Array.from(productsFromMovements))
    : { data: [], error: null };

  if (movementProductsError) {
    throw movementProductsError;
  }

  const productNameMap = new Map(
    ((movementProductsData || []) as ProductNameRow[]).map((row) => [row.id, row.name || "Producto"]),
  );

  const recentProducts = (recentProductsRes.data || []) as ProductBasicRow[];
  const categoryIds = Array.from(
    new Set(
      recentProducts
        .map((row) => row.category_id)
        .filter((id: string | null): id is string => Boolean(id)),
    ),
  );

  const { data: categoriesData, error: categoriesError } = categoryIds.length > 0
    ? await supabaseAdmin.from("categories").select("id, name").in("id", categoryIds)
    : { data: [], error: null };

  if (categoriesError) {
    throw categoriesError;
  }

  const categoryNameMap = new Map(
    ((categoriesData || []) as CategoryBasicRow[]).map((row) => [row.id, row.name]),
  );

  const salesToday = salesTodayRes.data || {
    total_sales: 0,
    total_revenue: 0,
    average_sale: 0,
  };

  const byRole: Record<string, number> = {};
  let activeStaff = 0;

  for (const profile of profilesRes.data || []) {
    const role = profile.role || "sin_rol";
    byRole[role] = (byRole[role] || 0) + 1;
    if (profile.active !== false) {
      activeStaff += 1;
    }
  }

  const preferences = (prefsRes.data || []) as NotificationPreferenceRow[];
  const salesPushEnabledUsers = preferences.filter((item) => item.sales_push !== false).length;
  const lowStockPushEnabledUsers = preferences.filter((item) => item.low_stock_push !== false).length;

  return {
    app_modules: appModules,
    sales_today: {
      total_sales: Number(salesToday.total_sales || 0),
      total_revenue: Number(salesToday.total_revenue || 0),
      average_sale: Number(salesToday.average_sale || 0),
    },
    top_products: ((topProductsRes.data || []) as TopProductRow[]).map((row) => ({
      name: row.name || "Producto",
      units_sold: Number(row.units_sold || 0),
      stock: row.stock,
      price: row.price,
    })),
    low_stock_alerts: ((lowStockRes.data || []) as LowStockRow[]).map((row) => ({
      id: row.id || "",
      name: row.name || "Producto",
      stock: Number(row.stock || 0),
      min_stock: Number(row.min_stock || 0),
      category_name: row.category_name,
    })),
    inventory_recent_movements: (movementsRes.data || []).map((row: InventoryMovementRow) => ({
      type: row.type,
      quantity: Number(row.quantity || 0),
      reason: row.reason,
      created_at: row.created_at,
      product_name: productNameMap.get(row.product_id) || null,
    })),
    recent_products_added: recentProducts.map((row) => ({
      id: row.id,
      name: row.name || "Producto",
      stock: row.stock,
      min_stock: row.min_stock,
      price: row.price,
      created_at: row.created_at,
      category_name: row.category_id ? (categoryNameMap.get(row.category_id) || null) : null,
    })),
    products_added_summary: {
      last_7_days: productsAdded7dRes.count || 0,
      last_30_days: productsAdded30dRes.count || 0,
    },
    products_summary: {
      active_products: activeProductsCountRes.count || 0,
      inactive_products: inactiveProductsCountRes.count || 0,
      total_products: (activeProductsCountRes.count || 0) + (inactiveProductsCountRes.count || 0),
    },
    staff_summary: {
      active_staff: activeStaff,
      by_role: byRole,
    },
    notifications_summary: {
      total_push_subscriptions: subsCountRes.count || 0,
      users_with_preferences: preferences.length,
      sales_push_enabled_users: salesPushEnabledUsers,
      low_stock_push_enabled_users: lowStockPushEnabledUsers,
    },
  };
}

function buildPromptPayload(
  businessContext: unknown,
  sellerPerformance: {
    period_days: number;
    sellers_analyzed: number;
    top_by_revenue: SellerPerformance[];
    top_by_sales: SellerPerformance[];
  },
  systemOverview: SystemOverview,
  compact = false,
) {
  const summarizeBusinessContext = (context: unknown) => {
    if (!context || typeof context !== "object") return context;

    const obj = context as Record<string, unknown>;
    const tables = Array.isArray(obj.tables) ? obj.tables : [];
    const views = Array.isArray(obj.views) ? obj.views : [];

    if (tables.length === 0 && views.length === 0) {
      return context;
    }

    const summarizeEntities = (entities: unknown[]) =>
      entities.slice(0, 15).map((entity) => {
        const item = (entity || {}) as Record<string, unknown>;
        return {
          name: typeof item.name === "string" ? item.name : "sin_nombre",
          row_count: Number(item.row_count || 0),
          columns_count: Array.isArray(item.columns) ? item.columns.length : 0,
          sample_rows_count: Array.isArray(item.sample_rows) ? item.sample_rows.length : 0,
        };
      });

    return {
      generated_at: obj.generated_at || null,
      schema: obj.schema || "public",
      row_limit: Number(obj.row_limit || 0),
      tables_total: tables.length,
      views_total: views.length,
      tables_summary: summarizeEntities(tables),
      views_summary: summarizeEntities(views),
    };
  };

  if (!compact) {
    return {
      business_context: businessContext,
      seller_performance: sellerPerformance,
      system_overview: systemOverview,
    };
  }

  const compactTopSellers = sellerPerformance.top_by_revenue.slice(0, 3).map((item) => ({
    seller_name: item.seller_name,
    total_sales: item.total_sales,
    total_revenue: Number(item.total_revenue.toFixed(2)),
    avg_ticket: Number(item.avg_ticket.toFixed(2)),
  }));

  return {
    business_context: summarizeBusinessContext(businessContext),
    seller_performance_summary: {
      period_days: sellerPerformance.period_days,
      sellers_analyzed: sellerPerformance.sellers_analyzed,
      top_by_revenue: compactTopSellers,
    },
    system_overview_summary: {
      sales_today: systemOverview.sales_today,
      products_summary: systemOverview.products_summary,
      products_added_summary: systemOverview.products_added_summary,
      notifications_summary: systemOverview.notifications_summary,
      low_stock_count: systemOverview.low_stock_alerts.length,
      top_products: systemOverview.top_products.slice(0, 3),
      recent_products_added: systemOverview.recent_products_added.slice(0, 5),
    },
  };
}

async function fetchBusinessContext(supabaseAdmin: ReturnType<typeof createClient>) {
  const globalContextRes = await supabaseAdmin.rpc("obtener_contexto_ia_completo", {
    p_row_limit: 15,
    p_include_samples: true,
  });

  if (!globalContextRes.error && globalContextRes.data) {
    return globalContextRes.data;
  }

  if (globalContextRes.error) {
    console.warn("No se pudo obtener contexto global; usando contexto legado:", globalContextRes.error.message);
  }

  const legacyContextRes = await supabaseAdmin.rpc("obtener_contexto_ia");
  if (legacyContextRes.error) {
    throw legacyContextRes.error;
  }

  return legacyContextRes.data;
}

/**
 * Determina si una consulta se beneficiaría de búsqueda web.
 * Retorna true para preguntas sobre precios, mercado, competencia, productos externos, etc.
 */
function shouldUseWebSearch(mensaje: string): boolean {
  const webSearchPatterns = [
    /preci(o|os)\s+(de|del|en|mercado|competencia|actual|real)/i,
    /cu[aá]nto\s+(cuesta|vale|cobra)/i,
    /compar(ar|a|ación)\s+(preci|con\s+el\s+mercado)/i,
    /mercado\s+(local|hondure[ñn]o|actual)/i,
    /competencia/i,
    /sugerir?\s+preci/i,
    /precio\s+sugerido/i,
    /precio\s+de\s+venta/i,
    /investigar?\s+(precio|producto|mercado)/i,
    /buscar?\s+(precio|producto|información|info)/i,
    /tienda|supermercado|pulper[ií]a|la\s+colonia|pricesmart|walmart|diunsa/i,
    /proveedor/i,
    /tendencia/i,
    /temporada/i,
    /promoci[oó]n/i,
    /ofertas?\s+(del|en|de)/i,
    /(analiz|revis)(ar?|a)\s+(precio|producto|margen)/i,
    /ajust(ar|e)\s+preci/i,
    /margin|margen/i,
    /rentabilidad/i,
    /https?:\/\//i, // URLs in the message
  ];

  return webSearchPatterns.some(pattern => pattern.test(mensaje));
}

/**
 * Detecta si el mensaje contiene URLs para activar url_context.
 */
function containsUrls(mensaje: string): boolean {
  return /https?:\/\/\S+/i.test(mensaje);
}

/**
 * Extrae fuentes web del metadata de grounding de Gemini.
 * Mantiene el orden de los chunks para que los índices coincidan con groundingSupports.
 */
function extractWebSources(candidate: GeminiResponse["candidates"] | null | undefined): WebSource[] {
  if (!candidate || candidate.length === 0) return [];

  const first = candidate[0];
  const sources: WebSource[] = [];
  const seenUrls = new Set<string>();

  // Extraer de groundingChunks — preservar orden para mapeo de índices
  const chunks = first.groundingMetadata?.groundingChunks;
  if (Array.isArray(chunks)) {
    for (const chunk of chunks) {
      const url = chunk.web?.uri;
      const title = chunk.web?.title;
      if (url && !seenUrls.has(url)) {
        seenUrls.add(url);
        sources.push({ url, title: title || new URL(url).hostname });
      }
    }
  }

  // Extraer de urlContextMetadata
  const urlMeta = first.urlContextMetadata?.urlMetadata;
  if (Array.isArray(urlMeta)) {
    for (const meta of urlMeta) {
      const url = meta.retrievedUrl;
      if (url && meta.urlRetrievalStatus === "URL_RETRIEVAL_STATUS_SUCCESS" && !seenUrls.has(url)) {
        seenUrls.add(url);
        try {
          sources.push({ url, title: new URL(url).hostname });
        } catch {
          sources.push({ url, title: url });
        }
      }
    }
  }

  return sources;
}

/**
 * Inserta marcadores de cita [n] en el texto de la respuesta usando groundingSupports.
 * Los marcadores se insertan al final de cada segmento soportado por fuentes.
 */
function addInlineCitations(
  text: string,
  candidates: GeminiResponse["candidates"] | null | undefined,
): string {
  if (!candidates || candidates.length === 0) return text;

  const supports = candidates[0].groundingMetadata?.groundingSupports;
  const chunks = candidates[0].groundingMetadata?.groundingChunks;
  if (!supports || !chunks || supports.length === 0) return text;

  // Procesar en orden inverso para no alterar índices previos
  const sorted = [...supports].sort(
    (a, b) => (b.segment?.endIndex ?? 0) - (a.segment?.endIndex ?? 0),
  );

  let result = text;
  for (const support of sorted) {
    const endIdx = support.segment?.endIndex;
    const indices = support.groundingChunkIndices;
    if (endIdx == null || !Array.isArray(indices) || indices.length === 0) continue;

    // Deduplicar índices y construir string de citas como [1][2]
    const uniqueIdxs = [...new Set(indices)].sort((a, b) => a - b);
    const citations = uniqueIdxs.map((i) => `[${i + 1}]`).join("");
    result = result.slice(0, endIdx) + citations + result.slice(endIdx);
  }

  return result;
}

/**
 * Extrae los datos de groundingSupports para enviarlo al frontend.
 */
function extractGroundingSupports(
  candidates: GeminiResponse["candidates"] | null | undefined,
): GroundingSupport[] {
  if (!candidates || candidates.length === 0) return [];

  const supports = candidates[0].groundingMetadata?.groundingSupports;
  if (!Array.isArray(supports)) return [];

  return supports
    .filter((s) => s.segment?.text && s.groundingChunkIndices?.length)
    .map((s) => ({
      text: s.segment!.text!,
      sourceIndices: [...new Set(s.groundingChunkIndices!)].sort((a, b) => a - b),
    }));
}

/**
 * Extrae las queries de búsqueda usadas por el modelo.
 */
function extractSearchQueries(candidate: GeminiResponse["candidates"] | null | undefined): string[] {
  if (!candidate || candidate.length === 0) return [];
  return candidate[0].groundingMetadata?.webSearchQueries || [];
}

async function callGemini(
  geminiApiKey: string,
  payloadText: string,
  historyForModel: Array<{ role: string; parts: Array<{ text: string }> }>,
  useWebSearch: boolean,
  useUrlContext: boolean,
) {
  // Construir herramientas de búsqueda web
  const tools: Array<Record<string, unknown>> = [];
  if (useWebSearch) {
    tools.push({ google_search: {} });
  }
  if (useUrlContext) {
    tools.push({ url_context: {} });
  }

  const geminiBody: Record<string, unknown> = {
    systemInstruction: {
      parts: [{ text: SYSTEM_INSTRUCTION }],
    },
    contents: [
      ...historyForModel,
      {
        role: "user",
        parts: [{ text: payloadText }],
      },
    ],
    generationConfig: {
      maxOutputTokens: 1500,
      temperature: 0.55,
    },
  };

  // Solo incluir tools si hay alguna herramienta activa
  if (tools.length > 0) {
    geminiBody.tools = tools;
  }

  return await fetch(GEMINI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": geminiApiKey,
    },
    body: JSON.stringify(geminiBody),
  });
}

function buildFallbackAnswer(mensaje: string, sellerPerformance: { top_by_revenue: SellerPerformance[]; period_days: number }) {
  const isSellerQuestion = /(vendedor|desempeño|desempeno|rendimiento|mejor vendedor)/i.test(mensaje);
  const top = sellerPerformance.top_by_revenue;

  if (isSellerQuestion && top.length > 0) {
    const top3 = top
      .slice(0, 3)
      .map(
        (item, idx) =>
          `${idx + 1}. ${item.seller_name}: ${item.total_sales} ventas, L ${item.total_revenue.toFixed(2)} ingresos, ticket promedio L ${item.avg_ticket.toFixed(2)}`
      )
      .join("\n");

    return [
      "No pude consultar el modelo IA en este intento, pero sí te doy el análisis con datos reales del sistema:",
      "",
      `Top vendedores por ingresos (últimos ${sellerPerformance.period_days} días):`,
      top3,
      "",
      "Si querés, te desgloso también por margen estimado y crecimiento semanal.",
    ].join("\n");
  }

  return "No pude consultar el modelo IA en este momento. Intenta de nuevo en unos segundos o haz una consulta más específica.";
}

function extractSuggestionsFromResponse(aiMessage: string): { cleanMessage: string; suggestions: string[] } {
  const suggestionsMatch = aiMessage.match(/\[SUGERENCIAS\]\s*\n([\s\S]*?)\[\/SUGERENCIAS\]/);
  if (!suggestionsMatch) {
    return { cleanMessage: aiMessage, suggestions: [] };
  }

  const cleanMessage = aiMessage.replace(/\s*\[SUGERENCIAS\][\s\S]*?\[\/SUGERENCIAS\]\s*$/, '').trim();
  const suggestionsBlock = suggestionsMatch[1];
  const suggestions = suggestionsBlock
    .split('\n')
    .map(line => line.replace(/^\d+[.)]\s*/, '').trim())
    .filter(line => line.length > 5 && line.length < 200);

  return { cleanMessage, suggestions: suggestions.slice(0, 4) };
}

function buildFollowUpSuggestions(mensaje: string, aiMessage: string): string[] {
  // Las sugerencias dinámicas se extraen del propio texto del modelo via extractSuggestionsFromResponse
  // Esta función solo genera fallbacks heurísticos
  const source = `${mensaje} ${aiMessage}`.toLowerCase();

  if (/(vendedor|empleado|equipo|rendimiento|desempeñ|desempen)/.test(source)) {
    return [
      "Compárame los 3 mejores vendedores por ingresos y ticket promedio.",
      "¿Qué vendedor necesita apoyo y en qué indicador específico?",
      "Dame un plan de mejora por vendedor para los próximos 7 días.",
      "¿Qué metas diarias recomiendas por vendedor para esta semana?",
    ];
  }

  if (/(stock|inventario|reposici|quiebre|minimo|mínimo)/.test(source)) {
    return [
      "Prioriza los productos con mayor riesgo de quiebre esta semana.",
      "Sugiéreme cantidades de reposición por producto crítico.",
      "¿Qué productos de bajo stock también son de alta rotación?",
      "Crea un plan de compras para los próximos 5 días.",
    ];
  }

  if (/(venta|ingreso|ticket|margen|factur|recaud)/.test(source)) {
    return [
      "Compárame hoy vs ayer en ingresos, ticket promedio y cantidad de ventas.",
      "¿Qué productos impulsan más ingresos y cuáles menos?",
      "Dame 3 acciones para subir ticket promedio mañana.",
      "¿Qué método de pago predomina y qué impacto tiene en ventas?",
    ];
  }

  if (/(preci|mercado|competencia|compar)/.test(source)) {
    return [
      "Compara mis precios de los 5 productos más vendidos con los del mercado.",
      "¿Qué productos tienen margen bajo comparado con la competencia?",
      "Sugiéreme ajustes de precios basados en el mercado local.",
      "Investiga precios de mis productos en supermercados de Honduras.",
    ];
  }

  return [
    "Dame un resumen ejecutivo del negocio de hoy.",
    "¿Cuáles son los 5 productos que debo vigilar esta semana?",
    "Compara mis precios con el mercado local hondureño.",
    "¿Qué acciones concretas recomiendas para subir ingresos mañana?",
  ];
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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

    if (!geminiApiKey) {
      return new Response(JSON.stringify({ error: "Servicio de IA no configurado" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

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

    const { data: userProfile, error: profileError } = await supabaseUser
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !userProfile || userProfile.role !== "admin") {
      return new Response(JSON.stringify({ error: "Acceso denegado: solo administradores" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const mensaje = typeof body?.mensaje === "string" ? body.mensaje.trim() : "";
    const conversationIdInput = typeof body?.conversation_id === "string" ? body.conversation_id : null;

    if (!mensaje) {
      return new Response(JSON.stringify({ error: "El mensaje no puede estar vacío" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let conversationId = conversationIdInput;
    let existingMessages: ConversationMessage[] = [];

    if (conversationId) {
      const { data: conversation, error: convReadError } = await supabaseAdmin
        .from("ia_conversations")
        .select("id, messages")
        .eq("id", conversationId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (convReadError) {
        return new Response(JSON.stringify({ error: "Error al leer conversación" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!conversation) {
        return new Response(JSON.stringify({ error: "Conversación no encontrada" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      existingMessages = Array.isArray(conversation.messages)
        ? (conversation.messages as ConversationMessage[])
        : [];
    } else {
      const title = mensaje.length > 60 ? `${mensaje.slice(0, 60)}...` : mensaje;
      const { data: newConv, error: convCreateError } = await supabaseAdmin
        .from("ia_conversations")
        .insert([{ user_id: user.id, title, messages: [] }])
        .select("id")
        .single();

      if (convCreateError || !newConv) {
        return new Response(JSON.stringify({ error: "Error al crear conversación" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      conversationId = newConv.id;
    }

    const [businessContext, sellerPerformance, systemOverview] = await Promise.all([
      fetchBusinessContext(supabaseAdmin),
      fetchSellerPerformance(supabaseAdmin),
      fetchSystemOverview(supabaseAdmin),
    ]);

    const historyForModel = existingMessages.slice(-12).map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    // Determinar si usar herramientas de búsqueda web
    const useWebSearch = shouldUseWebSearch(mensaje);
    const useUrlContext = containsUrls(mensaje);

    const fullPayload = buildPromptPayload(businessContext, sellerPerformance, systemOverview, false);

    // Si se usa búsqueda web, agregar contexto adicional al prompt
    let promptSuffix = "";
    if (useWebSearch) {
      promptSuffix = `\n\nNOTA: Usa Google Search para buscar información actualizada del mercado hondureño si es relevante para responder esta consulta. Compara los datos internos del sistema con los precios y tendencias reales del mercado.`;
    }
    if (useUrlContext) {
      promptSuffix += `\n\nNOTA: El usuario ha proporcionado URLs. Accede al contenido de las URLs para enriquecer tu respuesta.`;
    }

    const fullPromptText = `Contexto integral del sistema (JSON): ${JSON.stringify(fullPayload)}\n\nConsulta del administrador: ${mensaje}${promptSuffix}`;

    let geminiRes = await callGemini(geminiApiKey, fullPromptText, historyForModel, useWebSearch, useUrlContext);

    if (!geminiRes.ok) {
      // Reintentar con contexto compacto
      const compactPayload = buildPromptPayload(businessContext, sellerPerformance, systemOverview, true);
      const compactPromptText = `Contexto resumido del sistema (JSON): ${JSON.stringify(compactPayload)}\n\nConsulta del administrador: ${mensaje}${promptSuffix}`;
      geminiRes = await callGemini(geminiApiKey, compactPromptText, historyForModel, useWebSearch, useUrlContext);
    }

    if (!geminiRes.ok && (useWebSearch || useUrlContext)) {
      // Si falla con tools, reintentar sin herramientas de búsqueda
      console.warn("Reintentando sin herramientas de búsqueda web...");
      const compactPayload = buildPromptPayload(businessContext, sellerPerformance, systemOverview, true);
      const compactPromptText = `Contexto resumido del sistema (JSON): ${JSON.stringify(compactPayload)}\n\nConsulta del administrador: ${mensaje}`;
      geminiRes = await callGemini(geminiApiKey, compactPromptText, historyForModel, false, false);
    }

    let aiMessage: string;
    let webSources: WebSource[] = [];
    let searchQueries: string[] = [];
    let groundingSupports: GroundingSupport[] = [];

    if (!geminiRes.ok) {
      const errorText = await geminiRes.text();
      console.error("Gemini error", geminiRes.status, errorText);
      aiMessage = buildFallbackAnswer(mensaje, {
        top_by_revenue: sellerPerformance.top_by_revenue,
        period_days: sellerPerformance.period_days,
      });
    } else {
      const geminiData = (await geminiRes.json()) as GeminiResponse;
      aiMessage =
        geminiData.candidates?.[0]?.content?.parts
          ?.map((part) => part.text ?? "")
          .join("")
          .trim() || "No pude generar una respuesta en este momento.";

      // Extraer fuentes web, consultas de búsqueda y soporte de grounding
      webSources = extractWebSources(geminiData.candidates);
      searchQueries = extractSearchQueries(geminiData.candidates);
      groundingSupports = extractGroundingSupports(geminiData.candidates);

      // Insertar marcadores de cita inline [1], [2]... en el texto
      if (webSources.length > 0) {
        aiMessage = addInlineCitations(aiMessage, geminiData.candidates);
      }

      if (webSources.length > 0 || searchQueries.length > 0) {
        console.log("Web search used:", {
          searchQueries,
          sourcesCount: webSources.length,
          supportsCount: groundingSupports.length,
        });
      }
    }

    // Extraer sugerencias dinámicas generadas por el modelo
    const { cleanMessage, suggestions: dynamicSuggestions } = extractSuggestionsFromResponse(aiMessage);
    aiMessage = cleanMessage;

    // Usar sugerencias dinámicas del modelo si las hay, sino fallback heurístico
    const followUpSuggestions = dynamicSuggestions.length >= 2
      ? dynamicSuggestions
      : buildFollowUpSuggestions(mensaje, aiMessage);

    const now = new Date().toISOString();
    const updatedMessages: ConversationMessage[] = [
      ...existingMessages,
      { role: "user", content: mensaje, timestamp: now },
      { role: "assistant", content: aiMessage, timestamp: now },
    ];

    const { error: updateError } = await supabaseAdmin
      .from("ia_conversations")
      .update({ messages: updatedMessages, updated_at: now })
      .eq("id", conversationId)
      .eq("user_id", user.id);

    if (updateError) {
      return new Response(JSON.stringify({ error: "Error al guardar conversación" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: aiMessage,
        conversation_id: conversationId,
        follow_up_suggestions: followUpSuggestions,
        web_sources: webSources,
        search_queries: searchQueries,
        grounding_supports: groundingSupports,
        used_web_search: useWebSearch && webSources.length > 0,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("agente-ia error", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
