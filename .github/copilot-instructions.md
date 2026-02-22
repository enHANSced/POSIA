# POS Retail PWA - Instrucciones para agentes de IA

⚠️ Requisitos críticos: UI 100% en español y moneda HNL (Lempiras, prefijo `L`) formato de 12 horas.
Estoy usando un estilo neuomórfico para la interfaz.
Cuando pruebes la app puedes usar estas credenciales de prueba:
- Admin: `admin@gmail.com` / `admin123`
- Seller: `seller@gmail.com` / `seller123`

## Panorama del proyecto
- Stack: Vue 3 + TypeScript + Vite + Vuetify 3 + Pinia + Supabase.
- `src/main.ts` monta Pinia + router + Vuetify; `src/App.vue` ejecuta `authStore.initialize()` al iniciar.
- Flujo por capas: vistas (`src/views`) → stores (`src/stores`) → servicios (`src/services`) → Supabase/Edge Functions.
- Alias obligatorio: usar imports `@/...` (no rutas relativas que suban fuera de `src`).

## Ruteo y autorización
- Guardas en `src/router/index.ts` con meta flags: `requiresAuth`, `requiresGuest`, `requiresAdmin`, `isCallback`.
- Redirecciones clave: no autenticado → `/login`; no admin en ruta admin → `/pos`; callback OAuth en `/auth/callback`.
- Rutas admin reales: `/productos`, `/inventario`, `/reportes`, `/empleados`.

## Patrones de estado (Pinia)
- Este código usa `defineStore` estilo composition API.
- Para arrays/objetos en stores se usa `shallowRef` + `triggerRef` (ver `carrito.ts`, `productos.ts`, `empleados.ts`, `ia.ts`).
- En carrito, los totales se exponen como funciones (`getSubtotal()`, `getTax()`, `getTotal()`) en lugar de `computed`.
- `auth.ts` traduce errores de Supabase a español con `translateAuthError()` y gestiona `user_profiles`.

## Servicios y límites de responsabilidad
- `src/services/database.ts`: CRUD principal (productos, categorías, ventas, inventario, empleados) y suscripciones realtime.
- `searchProducts()` mezcla búsqueda parcial en `name/sku` y exacta para `barcode` con `.or(...)`.
- Inventario: `update_product_stock` vía RPC con fallback a `UPDATE` si falta la función (`PGRST202`).
- Ventas en POS: usar `procesarVenta()` de `src/services/edge-functions.ts` (transacción ACID), no inserts manuales de venta.
- Edge Functions activas: `procesar-venta`, `agente-ia`, `analizar-producto`, `gestionar-empleados`.

## Convenciones UI y dominio
- Mantener textos de UX en español (ej. “Punto de Venta”, “Inventario”, “Reportes”, “Configuración”).
- Tipos de dominio desde `src/types/supabase.ts`; `CartItem` y `SaleItem` son extensiones manuales usadas por POS.
- Estilo visual: neomorfismo (`src/assets/neomorphism.css`) + tema Vuetify en `src/plugins/vuetify.ts`.
- En POS/Productos se usa escaneo con `html5-qrcode`; en reportes los montos se muestran como `L {valor}`.

## Flujo de desarrollo (importante)
- Ejecutar comandos dentro de `pos-retail-pwa/` (en la raíz del repo no existe `package.json`).
- Comandos principales:
	- `npm install`
	- `npm run dev`
	- `npm run type-check`
	- `npm run build`
	- `npm run lint`
- No hay script de tests en `package.json`; la validación estándar es `type-check` + `build` + `lint`.

## Variables de entorno y PWA
- Requeridas: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (si faltan, falla en `src/services/supabase.ts`).
- Opcionales: `VITE_SUPABASE_PRODUCT_IMAGES_BUCKET` (default `product-images`), `VITE_VAPID_PUBLIC_KEY` (push web).
- PWA en `vite.config.ts` con Workbox (`importScripts: ['push-sw.js']`, `start_url: '/pos'`).
