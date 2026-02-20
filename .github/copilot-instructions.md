# POS Retail PWA - AI Coding Instructions

⚠️ **Critical Requirements**: The UI must be entirely in **Spanish**. Currency is **HNL** (Lempiras).

## Architecture Overview

**Tech Stack**: Vue 3 + TypeScript + Vite + Vuetify 3 + Pinia + Supabase (BaaS)

**Key Flow**:
1. App bootstraps in [src/main.ts](../../pos-retail-pwa/src/main.ts) with Pinia, router, and Vuetify
2. Auth initializes in [src/App.vue](../../pos-retail-pwa/src/App.vue) via `authStore.initialize()` on mount
3. Router gates access with nav guards in [src/router/index.ts](../../pos-retail-pwa/src/router/index.ts) using meta flags (`requiresAuth`, `requiresGuest`, `requiresAdmin`, `isCallback`)
4. Stores in [src/stores](../../pos-retail-pwa/src/stores) call centralized services in [src/services](../../pos-retail-pwa/src/services)
5. [src/services/database.ts](../../pos-retail-pwa/src/services/database.ts) handles all Supabase DB queries; [src/services/edge-functions.ts](../../pos-retail-pwa/src/services/edge-functions.ts) invokes server-side logic

## Development Workflows

```bash
npm install              # Node ^20.19.0 || >=22.12.0 required
npm run dev             # Vite dev server (auto-reload on file changes)
npm run type-check      # vue-tsc --build (strict TS checking)
npm run build           # Production build (type-check + vite build)
npm run lint            # oxlint + eslint with --fix
```

**Regenerate Supabase types** after schema changes:
```bash
npx supabase gen types typescript --project-id tbsbfnubbdiqstjzxtzl > src/types/supabase.ts
```

**Build Output**: Optimized into `dist/` with PWA service workers. Watch for chunk size warnings (>500 KiB).

## State & Auth Patterns

**Auth Store** ([src/stores/auth.ts](../../pos-retail-pwa/src/stores/auth.ts)):
- Owns `user`, `session`, `profile` (fetched from `user_profiles` table)
- Provides: `isAuthenticated`, `isAdmin`, `isSeller`, `userRole` computed properties
- Role checks use `profile.role` enum: `'admin'` | `'seller'` | `'viewer'`
- Error messages are auto-translated to Spanish via `translateAuthError()` helper

**Route Protection**:
- `requiresAuth`: Redirects unauthenticated users to `/login` with `redirect` query param
- `requiresAdmin`: Redirects non-admins to `/pos`
- `isCallback`: Allows unauthenticated access (for OAuth callbacks at `/auth/callback`)

**Stores Pattern** ([src/stores](../../pos-retail-pwa/src/stores)):
- Use Pinia `defineStore` with **composition API** (not Options API)
- Stores with object/array state use `shallowRef` + `triggerRef` to avoid TypeScript recursive type errors — see [carrito.ts](../../pos-retail-pwa/src/stores/carrito.ts) and [productos.ts](../../pos-retail-pwa/src/stores/productos.ts)
- Cart totals use getter functions (`getSubtotal()`, `getTax()`, `getTotal()`) rather than computed refs for the same reason

## Data & Service Layer

**Database Service** ([src/services/database.ts](../../pos-retail-pwa/src/services/database.ts)):
- Handles `products`, `categories`, `sales`, `sales_items`, `inventory_movements` queries
- Product images stored in Supabase Storage bucket `VITE_SUPABASE_PRODUCT_IMAGES_BUCKET` (default: `product-images`); path pattern: `{productId}/{timestamp}-{random}.{ext}`
- Product search uses `.or('name.ilike.%q%,sku.ilike.%q%,barcode.eq.q')` — barcode is exact match
- Inventory updates via RPC `update_product_stock` (with fallback to direct `UPDATE` if RPC missing)
- Realtime subscriptions use Supabase channels; call `subscribeToInventory()` / `subscribeToSales()`

**Edge Functions** ([src/services/edge-functions.ts](../../pos-retail-pwa/src/services/edge-functions.ts)):
All invoked via `supabase.functions.invoke(name, { body })`. Three functions exist:
- `procesar-venta`: ACID transaction — creates sale record, decrements stock, records inventory movements. **Always use this instead of direct DB inserts for sales.**
- `agente-ia`: Conversational AI powered by **Gemini 2.5 Flash**. Accepts `{ mensaje, conversation_id? }`. Conversations stored in `ia_conversations` table (messages as JSONB array).
- `analizar-producto`: Multimodal product analysis — receives `{ imageBase64, mimeType, barcode? }` and returns suggested product fields (name, description, price, SKU, etc.)

## Component Organization

**Views** ([src/views](../../pos-retail-pwa/src/views)): Routed components — one per page
- `POSView.vue`: Point-of-sale (auth required)
- `ProductosView.vue` / `InventarioView.vue` / `ReportesView.vue`: Admin-only
- `HistorialView.vue` / `ConfiguracionView.vue`: Any authenticated user
- `LoginView.vue`: Guest-only; `AuthCallbackView.vue`: OAuth callback

**Component Subdirectories** ([src/components](../../pos-retail-pwa/src/components)):
- `comunes/`: Shared reusable components
- `pos/`: POS checkout UI
- `productos/`: Product CRUD (uses `analizarProductoImagen` for AI-assisted creation)
- `reportes/`: Chart.js-based analytics (dependency: `chart.js`)
- `ia/AsistenteIADrawer.vue`: Sliding AI chat panel; uses `useIAStore`
- `notificaciones/`: Toast/alert components
- `icons/`: MDI icon wrappers

## Critical Conventions

1. **Type Safety**: Import domain types from [src/types/supabase.ts](../../pos-retail-pwa/src/types/supabase.ts). `CartItem` and `SaleItem` are manually extended types on top of generated DB types.

2. **Error Handling**: Translate all Supabase errors to Spanish before surfacing them. Use `translateAuthError()` in [src/stores/auth.ts](../../pos-retail-pwa/src/stores/auth.ts) as the reference pattern.

3. **Spanish UI**: All user-facing strings in Spanish. Glossary: "Punto de Venta" (POS), "Historial" (History), "Inventario" (Inventory), "Reportes" (Reports), "Configuración" (Settings).

4. **Vuetify Styling**: Apply neomorphism theme classes (`neo-bg`, `neo-circle`) from [src/assets/neomorphism.css](../../pos-retail-pwa/src/assets/neomorphism.css). Vuetify theme in [src/plugins/vuetify.ts](../../pos-retail-pwa/src/plugins/vuetify.ts).

5. **Path Alias**: `@` resolves to `src/` — always use `@/` imports, never relative paths that climb above `src/`.

## Environment Variables

Required in `.env.local`:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```
Optional:
```
VITE_SUPABASE_PRODUCT_IMAGES_BUCKET=product-images   # Storage bucket name
VITE_VAPID_PUBLIC_KEY=...                            # Required to enable Web Push notifications
```
Missing `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` throws at startup. Missing `VITE_VAPID_PUBLIC_KEY` silently disables push in [src/services/push.ts](../../pos-retail-pwa/src/services/push.ts).

## PWA & Push Notifications

- Workbox service worker in [vite.config.ts](../../pos-retail-pwa/vite.config.ts): Supabase API → `NetworkFirst` (3 s timeout), Google Fonts → `CacheFirst`
- Custom push handler in [public/push-sw.js](../../pos-retail-pwa/public/push-sw.js) is imported via `workbox.importScripts`
- Push subscriptions stored in `push_subscriptions` table (columns: `user_id`, `endpoint`, `auth_key`, `p256dh_key`)
- Use `subscribeToPushNotifications()` / `unsubscribeFromPushNotifications()` from [src/services/push.ts](../../pos-retail-pwa/src/services/push.ts)
- Manifest `start_url` is `/pos`; app runs in `standalone` display mode
