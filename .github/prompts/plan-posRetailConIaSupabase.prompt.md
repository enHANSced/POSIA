## Plan: Sistema POS Retail con IA + Supabase + PWA

**TL;DR:** Migrar a **Supabase** (PostgreSQL + Edge Functions + Auth) manteniendo una arquitectura PWA con Web Push básico. Supabase ofrece mejor control de datos con RLS, queries complejas en SQL y costos más predecibles. El trade-off: no hay notificaciones push nativas (solo Web Push cuando navegador está abierto), offline-first requiere implementación manual, pero ganamos seguridad multi-tenencia, transacciones ACID y full-text search out-of-the-box. Deploy en Vercel + Supabase.

---

### **Cambios Clave vs Plan Original (Firebase)**

| Aspecto | Firebase | Supabase |
|--------|----------|----------|
| **Base de Datos** | Firestore (NoSQL documentos) | **PostgreSQL** (relacional) |
| **Autenticación** | Firebase Auth (OAuth2) | **Supabase Auth** (JWT + RLS) |
| **Almacenamiento** | Cloud Storage | **Cloud Storage** (S3-compatible) |
| **Backend Logic** | Cloud Functions | **Edge Functions** (Deno) |
| **Hosting** | Firebase Hosting | **Vercel** (CI/CD + Edge Functions) |
| **Offline** | IndexedDB automático | **Service Worker manual + IndexedDB** |
| **Notificaciones** | Cloud Messaging (FCM) | **Web Push** (navegador abierto) |
| **Seguridad BD** | Firestore Rules | **RLS (Row Level Security)** |
| **Búsqueda** | Sin full-text | **pg_trgm + JSONB** |

---

### **Steps**

#### **Fase 0 — Setup Proyecto & Supabase**

1. **Inicializar proyecto Vue 3 + Vite**: `npm create vue@latest pos-retail-pwa` con TypeScript, Pinia, Vue Router, ESLint

2. **Instalar dependencias core**:
   ```bash
   npm install vuetify @mdi/font @supabase/supabase-js pinia vue-router html5-qrcode jspdf chart.js
   npm install -D vite-plugin-pwa workbox-vite
   ```

3. **Crear proyecto Supabase** en [supabase.com](https://supabase.com):
   - Crear proyecto `pos-retail-pwa`
   - Región: la más cercana a tu ubicación
   - Copiar `SUPABASE_URL` y `SUPABASE_ANON_KEY` a `.env.local`

4. **Habilitar extensiones PostgreSQL**:
   - `pg_trgm`: Full-text search con fuzzy matching
   - `uuid-ossp`: Generar UUIDs automáticamente

5. **Estructura de carpetas**:
   ```
   src/
   ├── assets/
   ├── components/
   │   ├── pos/           # Módulo POS
   │   ├── productos/     # Catálogo
   │   ├── reportes/      # Dashboard
   │   ├── ia/            # Chat IA
   │   ├── notificaciones/# Web Push
   │   └── comunes/
   ├── composables/       # useCarrito, useProductos, etc.
   ├── stores/            # Pinia
   ├── views/
   ├── router/
   ├── services/
   │   ├── supabase.ts    # Configuración Supabase
   │   ├── database.ts    # Operaciones BD
   │   ├── auth.ts        # Autenticación
   │   └── push.ts        # Web Push
   ├── types/             # Interfaces TypeScript
   ├── utils/
   ├── public/
   │   └── manifest.json  # PWA manifest
   └── sw.ts              # Service Worker (Workbox)
   ```

#### **Fase 1 — PostgreSQL Schema (Base de Datos)**

6. **Crear tablas en Supabase SQL Editor** ([referencia estructura]):

   [Crear en supabase.com → SQL Editor → paste y ejecutar]:

   ```sql
   -- Extensiones
   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
   CREATE EXTENSION IF NOT EXISTS "pg_trgm";

   -- Tabla: categorías
   CREATE TABLE categories (
     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     name TEXT NOT NULL UNIQUE,
     description TEXT,
     color TEXT DEFAULT '#1976d2',
     icon TEXT DEFAULT 'mdi-shopping',
     created_at TIMESTAMPTZ DEFAULT now(),
     updated_at TIMESTAMPTZ DEFAULT now()
   );

   -- Tabla: productos
   CREATE TABLE products (
     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     name TEXT NOT NULL,
     sku TEXT UNIQUE,
     barcode TEXT UNIQUE,
     description TEXT,
     category_id UUID REFERENCES categories ON DELETE SET NULL,
     price DECIMAL(10, 2) NOT NULL,
     cost DECIMAL(10, 2),
     stock INT DEFAULT 0,
     min_stock INT DEFAULT 5,
     image_url TEXT,
     tax_rate DECIMAL(5, 2) DEFAULT 0,
     active BOOLEAN DEFAULT true,
     metadata JSONB DEFAULT '{}',
     created_at TIMESTAMPTZ DEFAULT now(),
     updated_at TIMESTAMPTZ DEFAULT now()
   );

   -- Índices para búsqueda rápida
   CREATE INDEX idx_products_name_trgm ON products USING gin(name gin_trgm_ops);
   CREATE INDEX idx_products_barcode ON products(barcode);
   CREATE INDEX idx_products_active ON products(active);

   -- Tabla: ventas (transacciones)
   CREATE TABLE sales (
     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     sale_number TEXT UNIQUE NOT NULL,
     seller_id UUID REFERENCES auth.users ON DELETE RESTRICT,
     items JSONB NOT NULL, -- [{product_id, name, quantity, unit_price, subtotal, tax}, ...]
     subtotal DECIMAL(10, 2),
     tax_amount DECIMAL(10, 2),
     discount DECIMAL(10, 2) DEFAULT 0,
     total DECIMAL(10, 2) NOT NULL,
     payment_method TEXT NOT NULL, -- 'efectivo', 'tarjeta', 'otro'
     status TEXT DEFAULT 'completed', -- 'completed', 'refunded', 'pending'
     notes TEXT,
     created_at TIMESTAMPTZ DEFAULT now(),
     updated_at TIMESTAMPTZ DEFAULT now()
   );

   CREATE INDEX idx_sales_created ON sales(created_at DESC);
   CREATE INDEX idx_sales_seller ON sales(seller_id);

   -- Tabla: movimientos de inventario (auditoría)
   CREATE TABLE inventory_movements (
     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     product_id UUID NOT NULL REFERENCES products ON DELETE RESTRICT,
     type TEXT NOT NULL, -- 'sale', 'entry', 'adjustment'
     quantity INT NOT NULL,
     reason TEXT,
     user_id UUID REFERENCES auth.users ON DELETE SET NULL,
     created_at TIMESTAMPTZ DEFAULT now()
   );

   CREATE INDEX idx_inventory_product ON inventory_movements(product_id);

   -- Tabla: conversaciones IA
   CREATE TABLE ia_conversations (
     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
     title TEXT,
     messages JSONB DEFAULT '[]', -- [{role: 'user'|'assistant', content, timestamp}, ...]
     created_at TIMESTAMPTZ DEFAULT now(),
     updated_at TIMESTAMPTZ DEFAULT now()
   );

   -- Tabla: suscripciones Web Push
   CREATE TABLE push_subscriptions (
     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
     endpoint TEXT NOT NULL UNIQUE,
     auth_key TEXT,
     p256dh_key TEXT,
     created_at TIMESTAMPTZ DEFAULT now()
   );

   -- RLS: Habilitar en todas las tablas
   ALTER TABLE products ENABLE ROW LEVEL SECURITY;
   ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
   ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
   ALTER TABLE ia_conversations ENABLE ROW LEVEL SECURITY;
   ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

   -- RLS Policies
   -- Productos: todos ven productos activos
   CREATE POLICY "view_active_products" ON products FOR SELECT USING (active = true);

   -- Ventas: vendedor ve solo sus ventas, admin ve todas
   CREATE POLICY "seller_view_own_sales" ON sales FOR SELECT
   USING (auth.uid() = seller_id);

   CREATE POLICY "sellers_create_sales" ON sales FOR INSERT
   WITH CHECK (auth.uid() = seller_id);

   -- Chat IA: usuario ve solo sus conversaciones
   CREATE POLICY "user_own_conversations" ON ia_conversations FOR SELECT
   USING (auth.uid() = user_id);

   -- Web Push: usuario ve solo sus suscripciones
   CREATE POLICY "user_own_push_subs" ON push_subscriptions FOR SELECT
   USING (auth.uid() = user_id);
   ```

7. **Crear vistas útiles** (SQL):
   ```sql
   -- Vista: resumen de ventas del día
   CREATE VIEW sales_summary_today AS
   SELECT 
     DATE(created_at) as fecha,
     COUNT(*) as total_sales,
     SUM(total) as total_revenue,
     SUM(tax_amount) as total_tax
   FROM sales
   WHERE created_at >= CURRENT_DATE
   GROUP BY DATE(created_at);

   -- Vista: productos con stock bajo
   CREATE VIEW low_stock_products AS
   SELECT * FROM products
   WHERE stock <= min_stock AND active = true;
   ```

#### **Fase 2 — Supabase Auth & Seguridad**

8. **Configurar Authentication** en Supabase Console:
   - Habilitar: Email/Password
   - Opcional: Google OAuth (signo único)
   - Custom Metadata: guardar `role` (admin, seller)

9. **Servicio de Autenticación** (`src/services/auth.ts`):
   ```typescript
   import { supabase } from './supabase'
   
   export async function loginWithEmail(email: string, password: string) {
     const { data, error } = await supabase.auth.signInWithPassword({ email, password })
     if (error) throw error
     return data.session
   }
   
   export async function logout() {
     const { error } = await supabase.auth.signOut()
     if (error) throw error
   }
   
   export async function getCurrentUser() {
     const { data: { user } } = await supabase.auth.getUser()
     return user
   }
   
   export function onAuthStateChange(callback) {
     return supabase.auth.onAuthStateChange((event, session) => {
       callback(session?.user || null)
     })
   }
   ```

#### **Fase 3 — Frontend Core (Vue 3 + Pinia + Supabase SDK)**

10. **Servicio Supabase** (`src/services/supabase.ts`):
    ```typescript
    import { createClient } from '@supabase/supabase-js'
    
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
    
    export const supabase = createClient(supabaseUrl, supabaseKey)
    
    // Habilitar persistencia automática (sesión en localStorage)
    // Supabase lo hace por defecto
    ```

11. **Servicio de Base de Datos** (`src/services/database.ts`):
    ```typescript
    import { supabase } from './supabase'
    
    // Productos
    export async function fetchProducts() {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('active', true)
      
      if (error) throw error
      return data
    }
    
    export async function searchProducts(query: string) {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .ilike('name', `%${query}%`) // Full-text fuzzy
        .eq('active', true)
      
      if (error) throw error
      return data
    }
    
    // Ventas
    export async function createSale(items, total, methodPago) {
      const { data: { user } } = await supabase.auth.getUser()
      const saleNumber = `VTA-${Date.now()}`
      
      const { data, error } = await supabase
        .from('sales')
        .insert([{
          sale_number: saleNumber,
          seller_id: user.id,
          items,
          total,
          payment_method: methodPago,
          created_at: new Date()
        }])
        .select()
      
      if (error) throw error
      
      // Actualizar stock
      for (const item of items) {
        await supabase
          .from('products')
          .update({ stock: supabase.from('products').sql`stock - ${item.quantity}` })
          .eq('id', item.product_id)
      }
      
      return data[0]
    }
    
    export async function fetchSalesHistory(startDate?, endDate?) {
      let query = supabase
        .from('sales')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (startDate) query = query.gte('created_at', startDate)
      if (endDate) query = query.lte('created_at', endDate)
      
      const { data, error } = await query
      if (error) throw error
      return data
    }
    ```

12. **Pinia Stores** (mantener estructura del original, adaptada a Supabase):
    - `useAuthStore`: loginWithEmail, logout, currentUser
    - `useProductosStore`: fetchProducts, searchProducts, realtime listener
    - `useCarritoStore`: items, agregar, quitar, calcular totales
    - `useVentasStore`: createSale, fetchHistory, filtros por fecha
    - `usePushStore`: suscribirANotificaciones, contador de alertas

13. **Vue Router** (igual que original):
    ```
    /login → LoginView
    /pos → POSView (protegida)
    /productos → ProductosView (admin)
    /historial → HistorialView (admin)
    /reportes → ReportesView (admin)
    ```

14. **Layout Vuetify** con drawer lateral para Chat IA (igual al original)

#### **Fase 4 — PWA + Web Push**

15. **Configuración PWA** (`vite.config.ts`):
    ```typescript
    import { VitePWA } from 'vite-plugin-pwa'
    
    export default defineConfig({
      plugins: [
        VitePWA({
          registerType: 'autoUpdate',
          manifest: {
            name: 'POS Retail con IA',
            short_name: 'POS IA',
            description: 'Sistema POS minorista',
            theme_color: '#1976d2',
            icons: [
              { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }
            ],
            start_url: '/pos',
            display: 'standalone'
          },
          workbox: {
            globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
            runtimeCaching: [
              {
                urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
                handler: 'NetworkFirst',
                options: { cacheName: 'supabase-cache', networkTimeoutSeconds: 3 }
              },
              {
                urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                handler: 'CacheFirst',
                options: { cacheName: 'fonts-cache', expiration: { maxEntries: 20 } }
              }
            ]
          }
        })
      ]
    })
    ```

16. **Web Push** (`src/services/push.ts`):
    ```typescript
    import { supabase } from './supabase'
    
    const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY
    
    export async function subscribeToPushNotifications() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.log('Push no soportado')
        return
      }
      
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      })
      
      const { data: { user } } = await supabase.auth.getUser()
      
      // Guardar suscripción en BD
      await supabase
        .from('push_subscriptions')
        .insert([{
          user_id: user.id,
          endpoint: subscription.endpoint,
          auth_key: btoa(new Uint8Array(subscription.getKey('auth'))),
          p256dh_key: btoa(new Uint8Array(subscription.getKey('p256dh')))
        }])
    }
    
    function urlBase64ToUint8Array(base64String: string) {
      const padding = '='.repeat((4 - base64String.length % 4) % 4)
      const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/')
      const rawData = window.atob(base64)
      return new Uint8Array([...rawData].map(char => char.charCodeAt(0)))
    }
    ```

17. **Service Worker personalizado** (`public/sw.js` o vía Workbox):
    ```javascript
    self.addEventListener('push', (event) => {
      const options = {
        body: event.data?.text() || 'Nueva notificación',
        icon: '/icon-192.png',
        badge: '/badge-72.png'
      }
      
      event.waitUntil(
        self.registration.showNotification('POS IA', options)
      )
    })
    
    self.addEventListener('notificationclick', (event) => {
      event.notification.close()
      event.waitUntil(
        clients.matchAll({ type: 'window' }).then((clientList) => {
          if (clientList.length > 0) {
            return clientList[0].focus()
          }
          return clients.openWindow('/')
        })
      )
    })
    ```

#### **Fase 5 — Edge Functions (Lógica Backend)**

18. **Crear Edge Function** en Supabase:
    - Dashboard → Edge Functions → Create (nuevo)
    - Nombre: `procesar-venta`
    - Runtime: Deno

    ```typescript
    // functions/procesar-venta/index.ts
    import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
    import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabase = createClient(supabaseUrl, supabaseKey)
    
    serve(async (req) => {
      if (req.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 })
      }
      
      const { items, total, methodPago, sellerId } = await req.json()
      
      const saleNumber = `VTA-${Date.now()}`
      
      try {
        // Crear venta
        const { data: sale, error: saleError } = await supabase
          .from('sales')
          .insert([{
            sale_number: saleNumber,
            seller_id: sellerId,
            items,
            total,
            payment_method: methodPago
          }])
          .select()
        
        if (saleError) throw saleError
        
        // Actualizar stock en productos
        for (const item of items) {
          await supabase.rpc('decrement_stock', {
            product_id: item.product_id,
            amount: item.quantity
          })
        }
        
        // Registrar movimiento de inventario
        for (const item of items) {
          await supabase
            .from('inventory_movements')
            .insert([{
              product_id: item.product_id,
              type: 'sale',
              quantity: item.quantity,
              reason: `Venta ${saleNumber}`,
              user_id: sellerId
            }])
        }
        
        return new Response(
          JSON.stringify({ success: true, sale: sale[0] }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      } catch (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }
    })
    ```

    **Helper función para decrementar stock** (agregar SQL en Supabase):
    ```sql
    CREATE OR REPLACE FUNCTION decrement_stock(product_id UUID, amount INT)
    RETURNS VOID AS $$
    BEGIN
      UPDATE products SET stock = stock - amount WHERE id = product_id;
    END;
    $$ LANGUAGE plpgsql;
    ```

19. **Edge Function: Agente IA con Google Gemini** (`functions/agente-ia/index.ts`):
    ```typescript
    // functions/agente-ia/index.ts
    import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
    import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')
    
    const supabase = createClient(supabaseUrl, supabaseKey)
    
    serve(async (req) => {
      const { mensaje, conversationId, userId } = await req.json()
      
      // Obtener historial de conversación
      const { data: conversation } = await supabase
        .from('ia_conversations')
        .select('messages')
        .eq('id', conversationId)
        .single()
      
      const messages = conversation?.messages || []
      
      // Construir contexto para Gemini
      const systemPrompt = `Eres un asistente inteligente de un POS retail.
Ayuda a:
1. Consultar ventas del día/semana/mes
2. Revisar disponibilidad de productos
3. Alertas de stock bajo
4. Recomendaciones de mejora
Responde en español, conciso y práctico.`
      
      // Llamar a Gemini
      const response = await fetch(
        'https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              { role: 'user', parts: [{ text: systemPrompt + '\n\n' + mensaje }] }
            ],
            generationConfig: { maxOutputTokens: 500 }
          })
        }
      )
      
      const geminiResponse = await response.json()
      const aiMessage = geminiResponse.candidates[0].content.parts[0].text
      
      // Guardar en historial
      const updatedMessages = [
        ...messages,
        { role: 'user', content: mensaje, timestamp: new Date() },
        { role: 'assistant', content: aiMessage, timestamp: new Date() }
      ]
      
      await supabase
        .from('ia_conversations')
        .update({ messages: updatedMessages, updated_at: new Date() })
        .eq('id', conversationId)
      
      return new Response(
        JSON.stringify({ message: aiMessage }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    })
    ```

#### **Fase 6 — Módulos POS, Productos, Historial**

20. **Vista de Productos** (`src/views/ProductosView.vue`): 
    - Usar `useProductosStore` con Supabase realtime listeners
    - CRUD productos con imágenes en Storage

21. **Módulo POS** (`src/views/POSView.vue`):
    - Carrito con `useCarritoStore`
    - Escaneo código de barras
    - Método de pago
    - Botón "Finalizar venta" → Edge Function `procesar-venta`

22. **Historial de Ventas** (`src/views/HistorialView.vue`):
    - Filtro por fecha (rango)
    - Tabla con todas las ventas
    - Detalles de cada venta

23. **Panel IA** (drawer lateral):
    - Chat interactivo → Edge Function `agente-ia`
    - Historial de conversaciones

#### **Fase 7 — Deploy**

24. **Preparar deploy en Vercel**:
    ```bash
    npm run build
    ```
    - Conectar repo GitHub a Vercel
    - Agregar variables de entorno:
      - `VITE_SUPABASE_URL`
      - `VITE_SUPABASE_ANON_KEY`
      - `VITE_VAPID_PUBLIC_KEY` (si usas Web Push)

25. **Desplegar Edge Functions**:
    - Dashboard Supabase → Edge Functions → Deploy
    - O usar CLI: `supabase functions deploy`

26. **Configurar CORS en Supabase**:
    - API Settings → CORS allowed origins: agregar URL de Vercel

#### **Fase 8 — Testing PWA & Offline**

27. **Pruebas**:
    - Chrome DevTools → Application → Manifest (validar)
    - Network → Offline → verificar que carga desde caché
    - Instalar PWA en móvil
    - Web Push: enviar notificación desde servidor

---

### **Ventajas Supabase vs Firebase para este MVP**

✅ **Seguridad a nivel BD**: RLS policies evitan leaks de datos  
✅ **Queries SQL complejas**: JOINs, agregaciones sin denormalización  
✅ **Full-text search nativo**: Sin librerías externas  
✅ **Transacciones ACID**: Múltiples tablas atómicamente  
✅ **Costos predecibles**: Basado en compute, no por operación  
✅ **Edge Functions**: Ejecución distribuida, baja latencia  

---

### **Decisiones**

| Decisión | Elegido | Razón |
|----------|---------|-------|
| **Database** | **PostgreSQL** | Relaciones reales, transacciones ACID, seguridad RLS |
| **Auth** | **Supabase Auth** | JWT + RLS integrado |
| **Notificaciones** | **Web Push** | Simple MVP, sin costos adicionales |
| **Offline** | **Service Worker + caché básico** | Carga de productos inicial cacheada |
| **Hosting** | **Vercel** | CI/CD + Edge Functions + mejor integración |
| **IA** | **Edge Function + Gemini API** | Baja latencia, distribución global |
