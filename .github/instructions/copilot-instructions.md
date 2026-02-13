# POS Retail PWA - AI Coding Instructions

⚠️ **Critical Requirements**: The UI must be entirely in **Spanish**. Currency is **HNL** (Lempiras).

## Architecture Overview

**Tech Stack**: Vue 3 + TypeScript + Vite + Vuetify + Pinia + Supabase

**Key Flow**:
1. App bootstraps in [src/main.ts](../../pos-retail-pwa/src/main.ts) with Pinia, router, and Vuetify
2. Auth initializes in [src/App.vue](../../pos-retail-pwa/src/App.vue) via `authStore.initialize()` on mount
3. Router gates access with nav guards in [src/router/index.ts](../../pos-retail-pwa/src/router/index.ts) using meta flags (`requiresAuth`, `requiresGuest`, `requiresAdmin`)
4. Stores in [src/stores](../../pos-retail-pwa/src/stores) call centralized services in [src/services](../../pos-retail-pwa/src/services)
5. [src/services/database.ts](../../pos-retail-pwa/src/services/database.ts) handles all Supabase queries; Supabase client in [src/services/supabase.ts](../../pos-retail-pwa/src/services/supabase.ts)

## Development Workflows

```bash
npm install              # Node ^20.19.0 || >=22.12.0 required
npm run dev             # Vite dev server (auto-reload on file changes)
npm run type-check      # vue-tsc --build (strict TS checking)
npm run build           # Production build (type-check + vite build)
npm run lint            # oxlint + eslint with --fix
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
- `isCallback`: Allows unauthenticated access (for OAuth callbacks)

**Stores Pattern** ([src/stores](../../pos-retail-pwa/src/stores)):
- Use Pinia `defineStore` with composition API (not Options API)
- Stores with object/array state use `shallowRef` + `triggerRef` to avoid TypeScript recursion (e.g., [carrito.ts](../../pos-retail-pwa/src/stores/carrito.ts), [productos.ts](../../pos-retail-pwa/src/stores/productos.ts))
- Cart items computed via `getSubtotal()`, `getTax()`, `getTotal()` functions

## Data & Service Layer

**Database Service** ([src/services/database.ts](../../pos-retail-pwa/src/services/database.ts)):
- Handles `products`, `categories`, `sales`, `sales_items`, `inventory_movements` queries
- Product search: `ilike` for name/SKU, exact match for barcode
- Inventory updates via RPC `update_product_stock` (with fallback to direct `UPDATE` if RPC missing)
- Realtime subscriptions use Supabase channels for inventory & sales updates

**Key Queries**:
- `fetchProducts()`: Active products with related category data
- `fetchProductByBarcode(barcode)`: E-commerce barcode lookup; returns null gracefully
- `createSale()`: Accepts `SaleItem[]` array; updates inventory automatically
- `subscribeToInventory()`: Channel-based realtime updates

## Component Organization

**Views** ([src/views](../../pos-retail-pwa/src/views)): Routed components for major pages
- `POSView.vue`: Point-of-sale interface (requires auth)
- `ProductosView.vue`: Product management (requires admin)
- `HistorialView.vue`: Sales history
- `ReportesView.vue`: Analytics/reports (requires admin)
- `LoginView.vue`: Auth entry (requiresGuest)

**Component Hierarchy** ([src/components](../../pos-retail-pwa/src/components)):
- `comunes/`: Shared utilities (likely reusable components)
- `pos/`: POS-specific UI components
- `productos/`: Product management components
- `reportes/`: Report/chart components
- `ia/`: AI-related features (experimental)
- `notificaciones/`: Toast or alert components
- `icons/`: Icon components (MDI wrappers)

## Critical Conventions

1. **Type Safety**: Import types from [src/types/](../../pos-retail-pwa/src/types/). Use auto-generated Supabase types; manually define `CartItem`, `SaleItem` extensions.

2. **Error Handling**: Catch Supabase errors, translate to Spanish, set `authStore.error` or store-local error state. Example: `translateAuthError()` in auth.ts.

3. **Spanish UI**: All user-facing strings must be Spanish. Check existing views for term patterns (e.g., "Punto de Venta" for POS, "Historial" for history).

4. **Vuetify Styling**: Neomorphism CSS theme in [src/assets/neomorphism.css](../../pos-retail-pwa/src/assets/neomorphism.css). Use `neo-bg`, `neo-circle` classes. Vuetify config in [src/plugins/vuetify.ts](../../pos-retail-pwa/src/plugins/vuetify.ts).

5. **Environment Variables**: Require `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`. Missing vars crash at startup.

## PWA & Build

- Service worker configured in [vite.config.ts](../../pos-retail-pwa/vite.config.ts) with Workbox
- Runtime caching: Supabase API (`NetworkFirst`) and Google Fonts (`CacheFirst`)
- Manifest: `start_url: '/pos'`, standalone display mode
- Regenerate types after Supabase schema changes: `npx supabase gen types typescript --project-id tbsbfnubbdiqstjzxtzl > src/types/supabase.ts`
