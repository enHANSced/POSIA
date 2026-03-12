<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import {
  Chart,
  BarController,
  LineController,
  DoughnutController,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
  type ChartConfiguration,
  type ChartType,
} from 'chart.js'

Chart.register(
  BarController,
  LineController,
  DoughnutController,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
)

const props = defineProps<{
  config: ChartConfiguration<ChartType>
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let chartInstance: Chart | null = null

function renderChart() {
  if (!canvasRef.value) return
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }

  const ctx = canvasRef.value.getContext('2d')
  if (!ctx) return

  chartInstance = new Chart(ctx, {
    ...props.config,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      ...props.config.options,
    },
  })
}

onMounted(() => {
  nextTick(renderChart)
})

watch(() => props.config, () => {
  nextTick(renderChart)
}, { deep: true })

onBeforeUnmount(() => {
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }
})
</script>

<template>
  <div class="neo-chart-container">
    <canvas ref="canvasRef" />
  </div>
</template>

<style scoped>
.neo-chart-container {
  position: relative;
  width: 100%;
  height: 280px;
}
</style>
