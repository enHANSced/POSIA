// Configuración de Vuetify — Tema Neomorfismo Sutil
import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

export const vuetify = createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        dark: false,
        colors: {
          primary: '#4A7BF7',
          'primary-darken-1': '#3A63CC',
          secondary: '#6C7A92',
          accent: '#82B1FF',
          error: '#EF5350',
          info: '#42A5F5',
          success: '#66BB6A',
          warning: '#FFA726',
          background: '#e4e8ec',
          surface: '#e4e8ec',
          'on-background': '#2D3748',
          'on-surface': '#2D3748'
        }
      },
      dark: {
        dark: true,
        colors: {
          primary: '#6B93FF',
          'primary-darken-1': '#4A7BF7',
          secondary: '#8B9CB7',
          accent: '#FF80AB',
          error: '#EF5350',
          info: '#42A5F5',
          success: '#66BB6A',
          warning: '#FFA726',
          background: '#1e1e2e',
          surface: '#1e1e2e',
          'on-background': '#E2E8F0',
          'on-surface': '#E2E8F0'
        }
      }
    }
  },
  defaults: {
    VBtn: {
      variant: 'elevated',
      elevation: 0,
      rounded: 'lg'
    },
    VCard: {
      elevation: 0,
      rounded: 'xl'
    },
    VTextField: {
      variant: 'outlined',
      density: 'comfortable',
      rounded: 'lg'
    },
    VSelect: {
      variant: 'outlined',
      density: 'comfortable',
      rounded: 'lg'
    },
    VTextarea: {
      variant: 'outlined',
      rounded: 'lg'
    },
    VChip: {
      elevation: 0,
      rounded: 'xl'
    },
    VAlert: {
      rounded: 'lg',
      elevation: 0,
      variant: 'tonal'
    },
    VDialog: {
      maxWidth: 600
    },
    VDataTable: {
      density: 'comfortable'
    }
  }
})
