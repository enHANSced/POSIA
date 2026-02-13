# POS Retail PWA AI Coding Instructions

# Important: Read this before coding on the POS Retail PWA project!
The UI must be in spanish, with HNL as the currency. 

## Architecture at a glance
- Vue 3 + Vite app with Vuetify UI, Pinia state, and Supabase backend.
- App bootstraps in [pos-retail-pwa/src/main.ts](../../pos-retail-pwa/src/main.ts) with Pinia, router, and Vuetify.
- Auth gates routes via meta flags in [pos-retail-pwa/src/router/index.ts](../../pos-retail-pwa/src/router/index.ts) (requiresAuth, requiresGuest, requiresAdmin).
- Supabase client is typed and centralized in [pos-retail-pwa/src/services/supabase.ts](../../pos-retail-pwa/src/services/supabase.ts); feature services live in [pos-retail-pwa/src/services](../../pos-retail-pwa/src/services).
- Domain state is in Pinia stores under [pos-retail-pwa/src/stores](../../pos-retail-pwa/src/stores), which call the services layer.

## Critical workflows
- Install: `npm install`
- Dev server: `npm run dev`
- Type check: `npm run type-check`
- Build: `npm run build` (runs type-check + build-only)
- Lint: `npm run lint` (runs oxlint + eslint with --fix)
- Node version: ^20.19.0 or >=22.12.0 (see package.json engines).

## Conventions and patterns
- Auth initialization happens in [pos-retail-pwa/src/App.vue](../../pos-retail-pwa/src/App.vue) `onMounted` via `authStore.initialize()`.
- `useAuthStore` owns session/user/profile and reads `user_profiles`; role checks use `profile.role` (admin/seller).
- Data access lives in [pos-retail-pwa/src/services/database.ts](../../pos-retail-pwa/src/services/database.ts) for products, categories, sales, and inventory.
- Inventory updates call RPC `update_product_stock` with a fallback to direct updates if the RPC is missing.
- Stores with arrays use `shallowRef` + `triggerRef` to avoid TS recursion issues (see [pos-retail-pwa/src/stores/carrito.ts](../../pos-retail-pwa/src/stores/carrito.ts) and [pos-retail-pwa/src/stores/productos.ts](../../pos-retail-pwa/src/stores/productos.ts)).
- Realtime subscriptions use Supabase channels (helpers in [pos-retail-pwa/src/services/database.ts](../../pos-retail-pwa/src/services/database.ts)).

## External integrations
- Supabase requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; missing env vars throw at startup.
- Database types are generated in [pos-retail-pwa/src/types/supabase.ts](../../pos-retail-pwa/src/types/supabase.ts) (comment includes the `npx supabase gen types` command).
- PWA is configured in [pos-retail-pwa/vite.config.ts](../../pos-retail-pwa/vite.config.ts) with Workbox runtime caching for Supabase and Google Fonts.

## UI stack
- Vuetify configuration (themes/defaults) is in [pos-retail-pwa/src/plugins/vuetify.ts](../../pos-retail-pwa/src/plugins/vuetify.ts).
- Views live in [pos-retail-pwa/src/views](../../pos-retail-pwa/src/views) and are routed lazily via the router.
