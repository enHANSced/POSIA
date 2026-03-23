# POSIA — Punto de Venta Inteligente con IA

> Sistema POS moderno para retail con asistente de inteligencia artificial integrado, diseñado para pequeños y medianos negocios.

---

## ¿Qué es POSIA?

**POSIA** es una aplicación web progresiva (PWA) de punto de venta (POS) que combina la gestión completa de un negocio retail con un asistente de IA conversacional. Permite procesar ventas, administrar inventario, gestionar empleados y obtener reportes analíticos, todo desde el navegador o instalado como app en cualquier dispositivo.

---

## Funcionalidades Principales

### 🛒 Punto de Venta (POS)
- Procesamiento de ventas con carrito en tiempo real
- Búsqueda de productos por nombre, SKU o código de barras (escaneo con cámara)
- Soporte para productos por unidad y por peso (granel)
- Aplicación automática de descuentos y combos promocionales
- Múltiples métodos de pago
- Generación de recibo/factura en PDF con datos del cliente

### 📦 Gestión de Inventario
- Ajuste manual de stock por producto
- Alertas automáticas de stock mínimo
- Historial de movimientos de inventario
- Escaneo QR/código de barras para localizar productos rápidamente

### 🏷️ Catálogo de Productos
- Creación y edición de productos con imagen, categoría, precio, SKU y código de barras
- Análisis de imagen con IA para completar datos del producto automáticamente
- Reconocimiento de productos en el catálogo desde una foto

### 💰 Descuentos y Combos
- Configuración de descuentos por porcentaje o monto fijo
- Combos promocionales por agrupación de productos
- Descuentos por categoría o producto específico
- Sugerencias de descuentos generadas por IA basadas en patrones de venta

### 📊 Reportes y Analítica
- Dashboard de ventas diarias, semanales y mensuales
- Ranking de vendedores y productos más vendidos
- Impacto de descuentos aplicados
- Gráficas interactivas de ingresos y transacciones

### 📜 Historial de Ventas
- Consulta y filtrado de ventas por fecha, vendedor o cliente
- Reimpresión de recibos en cualquier momento

### 👥 Gestión de Empleados
- Alta y edición de empleados con roles diferenciados (Admin, Vendedor)
- Control de acceso por rol en toda la aplicación

### 🤖 Asistente de IA (Gemini 2.5 Flash)
- Chat conversacional con contexto del negocio en tiempo real
- Consulta de ventas del día, ingresos, ticket promedio y stock bajo
- Búsqueda en internet para preguntas generales
- Sugerencias proactivas basadas en el desempeño del negocio

### 🔔 Notificaciones en Tiempo Real
- Alertas de ventas completadas
- Avisos de productos con stock bajo
- Notificaciones push en el dispositivo (opt-in)

### ⚙️ Configuración de Usuario
- Perfil de usuario con foto, nombre y teléfono
- Preferencias de notificaciones push

---

## Roles de Acceso

| Rol | Acceso |
|-----|--------|
| **Admin** | Acceso completo: POS, productos, inventario, reportes, descuentos, empleados, configuración |
| **Vendedor** | POS, historial de ventas, configuración de perfil |

---

## Stack Tecnológico

| Capa | Tecnologías |
|------|-------------|
| **Frontend** | Vue 3, TypeScript, Vuetify 3, Pinia, Vue Router |
| **Backend** | Supabase (Postgres, Auth, Realtime, Storage, Edge Functions) |
| **IA** | Google Gemini 2.5 Flash |
| **Build** | Vite, vite-plugin-pwa |
| **PWA** | Service Worker, Web Push (VAPID) |
| **Extras** | Chart.js, jsPDF, html5-qrcode |

---

## Estructura del Proyecto

```
POSIA/
├── pos-retail-pwa/          # Aplicación frontend (Vue 3 + Vite)
│   ├── src/
│   │   ├── views/           # Páginas principales (POS, Productos, Reportes…)
│   │   ├── stores/          # Estado global con Pinia
│   │   ├── services/        # Lógica de acceso a Supabase y Edge Functions
│   │   ├── components/      # Componentes reutilizables
│   │   └── router/          # Rutas con guardas de autenticación y roles
│   └── public/              # Assets PWA (iconos, service worker)
└── supabase/
    ├── functions/           # Edge Functions serverless (TypeScript)
    │   ├── procesar-venta/      # Transacción ACID de venta
    │   ├── agente-ia/           # Agente conversacional con Gemini
    │   ├── analizar-producto/   # Análisis multimodal de imágenes
    │   └── sugerir-descuentos/  # Sugerencias promocionales con IA
    └── migrations/          # Migraciones SQL de base de datos
```

---

## Configuración y Desarrollo

```bash
cd pos-retail-pwa
npm install
```

Crea un archivo `.env` en `pos-retail-pwa/` con las siguientes variables:

```env
VITE_SUPABASE_URL=tu_url_de_supabase
VITE_SUPABASE_ANON_KEY=tu_anon_key
# Opcionales:
VITE_SUPABASE_PRODUCT_IMAGES_BUCKET=product-images
VITE_VAPID_PUBLIC_KEY=tu_clave_vapid_publica
```

### Comandos disponibles

```bash
npm run dev          # Servidor de desarrollo con hot reload
npm run build        # Build de producción (type-check + minify)
npm run type-check   # Verificación de tipos TypeScript
npm run lint         # Linting con ESLint
```

---

## Credenciales de Prueba

| Rol | Email | Contraseña |
|-----|-------|------------|
| Admin | `admin@gmail.com` | `admin123` |
| Vendedor | `seller@gmail.com` | `seller123` |

---

## Moneda y Región

La aplicación está configurada para Honduras. Los montos se muestran en **Lempiras (L)** y el formato de hora es de **12 horas**. La interfaz está completamente en **español**.
