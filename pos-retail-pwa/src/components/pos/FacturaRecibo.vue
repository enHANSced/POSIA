<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SaleItem } from '@/types/supabase'

export interface FacturaData {
  // Datos de la venta
  saleNumber: string
  saleId: string
  fecha: Date
  // Items
  items: SaleItem[]
  subtotal: number
  taxAmount: number
  discount: number
  total: number
  // Pago
  paymentMethod: 'efectivo' | 'tarjeta' | 'otro'
  montoRecibido?: number
  cambio?: number
  // Datos del vendedor y cliente
  sellerName: string
  customerName?: string
  customerRtn?: string
  // Datos del negocio (configurables)
  businessName?: string
  businessRtn?: string
  businessAddress?: string
  businessPhone?: string
  businessEmail?: string
  cai?: string
  invoiceRangeStart?: string
  invoiceRangeEnd?: string
  invoiceRangeExpiry?: string
}

const props = withDefaults(defineProps<{
  data: FacturaData
  show: boolean
}>(), {
  show: false
})

const emit = defineEmits<{
  'update:show': [value: boolean]
  close: []
}>()

// Datos del negocio por defecto — La Ceiba, Atlántida
const business = computed(() => ({
  name: props.data.businessName || 'POS Retail IA',
  rtn: props.data.businessRtn || '0501-XXXX-XXXXX',
  address: props.data.businessAddress || 'La Ceiba, Atlántida, Honduras',
  phone: props.data.businessPhone || '+504 XXXX-XXXX',
  email: props.data.businessEmail || 'contacto@posretail.hn',
  cai: props.data.cai || 'XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XX',
  rangeStart: props.data.invoiceRangeStart || '000-001-01-00000001',
  rangeEnd: props.data.invoiceRangeEnd || '000-001-01-00001000',
  rangeExpiry: props.data.invoiceRangeExpiry || '31/12/2026',
  municipality: 'La Ceiba',
  department: 'Atlántida',
}))

// Calcular ISV desglosado (Honduras: 15% estándar)
const isvRate = 15
const subtotalGravado = computed(() => props.data.subtotal)
const subtotalExento = computed(() => 0) // Todo gravado por ahora
const isvAmount = computed(() => props.data.taxAmount)

const fechaFormateada = computed(() => {
  const d = props.data.fecha
  return d.toLocaleDateString('es-HN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
})

const horaFormateada = computed(() => {
  const d = props.data.fecha
  return d.toLocaleTimeString('es-HN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
})

function getPaymentLabel(method: string): string {
  const map: Record<string, string> = {
    efectivo: 'Efectivo',
    tarjeta: 'Tarjeta',
    otro: 'Otro',
  }
  return map[method] || method
}

function formatHNL(value: number): string {
  return `L ${value.toFixed(2)}`
}

// Formatear número de factura estilo hondureño
const invoiceNumber = computed(() => {
  // Formato: 000-001-01-00000XXX
  const num = props.data.saleNumber.replace(/[^0-9]/g, '').slice(-8).padStart(8, '0')
  return `000-001-01-${num}`
})

const printRef = ref<HTMLElement | null>(null)

function handlePrint() {
  const content = document.getElementById('factura-print-area')
  if (!content) return

  const printWindow = window.open('', '_blank', 'width=400,height=600')
  if (!printWindow) return

  printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Factura ${invoiceNumber.value}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Courier New', monospace; font-size: 11px; padding: 8px; width: 80mm; color: #000; }
    .center { text-align: center; }
    .right { text-align: right; }
    .bold { font-weight: bold; }
    .divider { border-top: 1px dashed #000; margin: 6px 0; }
    .header { margin-bottom: 8px; }
    .header h1 { font-size: 14px; margin-bottom: 2px; }
    .header p { font-size: 10px; line-height: 1.4; }
    .info-row { display: flex; justify-content: space-between; line-height: 1.6; }
    .items-table { width: 100%; border-collapse: collapse; margin: 4px 0; }
    .items-table th { text-align: left; font-size: 10px; border-bottom: 1px solid #000; padding: 2px 0; }
    .items-table td { font-size: 10px; padding: 2px 0; vertical-align: top; }
    .items-table .qty { width: 30px; text-align: center; }
    .items-table .price { width: 60px; text-align: right; }
    .totals { margin-top: 4px; }
    .totals .info-row { font-size: 11px; }
    .totals .total-line { font-size: 14px; font-weight: bold; border-top: 2px solid #000; padding-top: 4px; margin-top: 4px; }
    .legal { font-size: 8px; line-height: 1.3; margin-top: 8px; color: #333; }
    .footer { margin-top: 10px; font-size: 9px; }
    @media print { body { width: 80mm; } }
  </style>
</head>
<body>
  ${content.innerHTML}
</body>
</html>`)
  printWindow.document.close()
  printWindow.focus()
  setTimeout(() => {
    printWindow.print()
    printWindow.close()
  }, 300)
}

function handleClose() {
  emit('update:show', false)
  emit('close')
}
</script>

<template>
  <v-dialog :model-value="show" max-width="440" persistent @update:model-value="emit('update:show', $event)">
    <v-card>
      <!-- Botones de acción arriba -->
      <v-card-actions class="pa-4 pb-0">
        <v-btn variant="text" prepend-icon="mdi-close" @click="handleClose">
          Cerrar
        </v-btn>
        <v-spacer />
        <v-btn color="primary" variant="elevated" prepend-icon="mdi-printer" @click="handlePrint">
          Imprimir
        </v-btn>
      </v-card-actions>

      <!-- Contenido imprimible -->
      <v-card-text class="pa-4">
        <div id="factura-print-area" ref="printRef" class="factura-preview">
          <!-- Header del negocio -->
          <div class="center header">
            <h1 class="bold">{{ business.name }}</h1>
            <p class="bold">RTN: {{ business.rtn }}</p>
            <p>{{ business.address }}</p>
            <p>Tel: {{ business.phone }}</p>
            <p v-if="business.email">{{ business.email }}</p>
          </div>

          <div class="divider"></div>

          <!-- Título documento fiscal -->
          <div class="center" style="margin-bottom: 6px;">
            <p class="bold" style="font-size: 13px; letter-spacing: 1px;">FACTURA</p>
            <p style="font-size: 9px;">Documento Autorizado por el SAR</p>
          </div>

          <!-- CAI -->
          <div class="info-row"><span class="bold">CAI:</span></div>
          <div class="center" style="font-size: 9px; word-break: break-all; margin-bottom: 4px;">{{ business.cai }}</div>

          <!-- Datos de la factura -->
          <div class="info-row"><span>No. Factura:</span><span class="bold">{{ invoiceNumber }}</span></div>
          <div class="info-row"><span>Fecha de Emisión:</span><span>{{ fechaFormateada }}</span></div>
          <div class="info-row"><span>Hora:</span><span>{{ horaFormateada }}</span></div>
          <div class="info-row"><span>Vendedor:</span><span>{{ data.sellerName }}</span></div>

          <div class="divider"></div>

          <!-- Datos del cliente -->
          <div class="info-row"><span>Cliente:</span><span>{{ data.customerName || 'Consumidor Final' }}</span></div>
          <div class="info-row"><span>RTN Cliente:</span><span>{{ data.customerRtn || 'CF' }}</span></div>

          <div class="divider"></div>

          <!-- Detalle de items -->
          <table class="items-table">
            <thead>
              <tr>
                <th>Descripción</th>
                <th class="qty">Cant</th>
                <th class="price">P/U</th>
                <th class="price">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, i) in data.items" :key="i">
                <td>{{ item.name }}</td>
                <td class="qty">{{ item.quantity }}</td>
                <td class="price">{{ formatHNL(item.unit_price) }}</td>
                <td class="price">{{ formatHNL(item.subtotal) }}</td>
              </tr>
            </tbody>
          </table>

          <div class="divider"></div>

          <!-- Totales -->
          <div class="totals">
            <div class="info-row">
              <span>Subtotal Gravado ({{ isvRate }}%):</span>
              <span>{{ formatHNL(subtotalGravado) }}</span>
            </div>
            <div class="info-row">
              <span>Subtotal Exento:</span>
              <span>{{ formatHNL(subtotalExento) }}</span>
            </div>
            <div class="info-row">
              <span>ISV ({{ isvRate }}%):</span>
              <span>{{ formatHNL(isvAmount) }}</span>
            </div>
            <div v-if="data.discount > 0" class="info-row">
              <span>Descuento:</span>
              <span>-{{ formatHNL(data.discount) }}</span>
            </div>
            <div class="info-row total-line">
              <span class="bold">TOTAL:</span>
              <span class="bold">{{ formatHNL(data.total) }}</span>
            </div>
          </div>

          <div class="divider"></div>

          <!-- Datos de pago -->
          <div class="info-row">
            <span>Forma de Pago:</span>
            <span>{{ getPaymentLabel(data.paymentMethod) }}</span>
          </div>
          <template v-if="data.paymentMethod === 'efectivo' && data.montoRecibido">
            <div class="info-row">
              <span>Efectivo Recibido:</span>
              <span>{{ formatHNL(data.montoRecibido) }}</span>
            </div>
            <div class="info-row bold">
              <span>Cambio:</span>
              <span>{{ formatHNL(data.cambio || 0) }}</span>
            </div>
          </template>

          <div class="divider"></div>

          <!-- Información legal SAR Honduras -->
          <div class="legal center">
            <p class="bold">Rango Autorizado</p>
            <p>{{ business.rangeStart }} a {{ business.rangeEnd }}</p>
            <p>Fecha Límite de Emisión: {{ business.rangeExpiry }}</p>
            <div style="margin-top: 6px; padding: 3px; border: 1px solid #999;">
              <p class="bold">La factura es beneficio de todos. ¡Exíjala!</p>
            </div>
            <p style="margin-top: 3px;">Art. 1 Acuerdo No. 027-2002 del 20/06/2002</p>
            <p style="margin-top: 2px;">Original: Cliente &nbsp;|&nbsp; Copia: Obligado Tributario</p>
            <p style="margin-top: 2px;">No se aceptan devoluciones sin esta factura</p>
          </div>

          <!-- Footer -->
          <div class="footer center">
            <div class="divider"></div>
            <p class="bold">¡Gracias por su compra!</p>
            <p style="font-size: 8px; margin-top: 2px;">{{ business.municipality }}, {{ business.department }}</p>
            <p style="font-size: 8px; margin-top: 2px;">Generado por POS Retail IA</p>
          </div>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.factura-preview {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.5;
  background: white;
  color: #000;
  padding: 16px;
  border-radius: 8px;
  border: 1px solid #e0e0e0;
  max-width: 360px;
  margin: 0 auto;
}

.factura-preview .center { text-align: center; }
.factura-preview .right { text-align: right; }
.factura-preview .bold { font-weight: bold; }

.factura-preview .divider {
  border-top: 1px dashed #999;
  margin: 8px 0;
}

.factura-preview .header {
  margin-bottom: 4px;
}

.factura-preview .header h1 {
  font-size: 16px;
  letter-spacing: 1px;
}

.factura-preview .header p {
  font-size: 10px;
  color: #444;
}

.factura-preview .info-row {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  line-height: 1.6;
}

.factura-preview .items-table {
  width: 100%;
  border-collapse: collapse;
  margin: 4px 0;
}

.factura-preview .items-table th {
  text-align: left;
  font-size: 10px;
  border-bottom: 1px solid #999;
  padding: 2px 0;
}

.factura-preview .items-table td {
  font-size: 10px;
  padding: 3px 0;
  vertical-align: top;
}

.factura-preview .items-table .qty {
  width: 35px;
  text-align: center;
}

.factura-preview .items-table .price {
  width: 65px;
  text-align: right;
}

.factura-preview .totals .info-row {
  font-size: 11px;
}

.factura-preview .totals .total-line {
  font-size: 14px;
  border-top: 2px solid #000;
  padding-top: 4px;
  margin-top: 4px;
}

.factura-preview .legal {
  font-size: 9px;
  line-height: 1.3;
  margin-top: 8px;
  color: #555;
}

.factura-preview .footer {
  margin-top: 8px;
  font-size: 10px;
}
</style>
