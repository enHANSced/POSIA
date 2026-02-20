import { defineStore } from 'pinia'
import { ref, computed, shallowRef, triggerRef } from 'vue'
import type { UserProfile } from '@/types/supabase'
import { fetchEmployees, updateEmployeeProfile, subscribeToEmployees } from '@/services/database'
import { crearEmpleado, sincronizarEmpleados } from '@/services/edge-functions'
import type { CrearEmpleadoRequest } from '@/services/edge-functions'

export const useEmpleadosStore = defineStore('empleados', () => {
  // Estado
  const empleados = shallowRef<UserProfile[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const saving = ref(false)

  // Computados
  const totalEmpleados = computed(() => empleados.value.length)
  const empleadosActivos = computed(() => empleados.value.filter(e => e.active !== false))
  const empleadosInactivos = computed(() => empleados.value.filter(e => e.active === false))

  const countByRole = computed(() => {
    const counts = { admin: 0, seller: 0, viewer: 0 }
    for (const emp of empleados.value) {
      const role = emp.role as keyof typeof counts
      if (role in counts) counts[role]++
    }
    return counts
  })

  // Acciones
  async function cargarEmpleados() {
    loading.value = true
    error.value = null
    try {
      empleados.value = await fetchEmployees()
      triggerRef(empleados)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Error al cargar empleados'
      console.error('Error cargando empleados:', err)
    } finally {
      loading.value = false
    }
  }

  async function crearNuevoEmpleado(datos: CrearEmpleadoRequest) {
    saving.value = true
    error.value = null
    try {
      const result = await crearEmpleado(datos)
      // Recargar lista después de crear
      await cargarEmpleados()
      return { success: true, message: result.message }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al crear empleado'
      error.value = msg
      return { success: false, error: msg }
    } finally {
      saving.value = false
    }
  }

  async function actualizarEmpleado(
    id: string,
    updates: Partial<Pick<UserProfile, 'full_name' | 'phone' | 'role' | 'active'>>
  ) {
    saving.value = true
    error.value = null
    try {
      const updated = await updateEmployeeProfile(id, updates)
      // Actualizar en la lista local
      const idx = empleados.value.findIndex(e => e.id === id)
      if (idx !== -1) {
        empleados.value[idx] = updated
        triggerRef(empleados)
      }
      return { success: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al actualizar empleado'
      error.value = msg
      return { success: false, error: msg }
    } finally {
      saving.value = false
    }
  }

  async function toggleEstadoEmpleado(id: string, active: boolean) {
    return actualizarEmpleado(id, { active })
  }

  function iniciarSuscripcion() {
    return subscribeToEmployees(() => {
      cargarEmpleados()
    })
  }

  /**
   * Sincroniza usuarios que existen en auth pero no tienen perfil en user_profiles.
   * Útil cuando se crean usuarios directamente en el panel de Supabase.
   */
  async function sincronizar() {
    saving.value = true
    error.value = null
    try {
      const result = await sincronizarEmpleados()
      if (result.synced > 0) {
        await cargarEmpleados()
      }
      return { success: true, synced: result.synced, message: result.message }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al sincronizar empleados'
      error.value = msg
      return { success: false, synced: 0, error: msg }
    } finally {
      saving.value = false
    }
  }

  return {
    // Estado
    empleados,
    loading,
    error,
    saving,
    // Computados
    totalEmpleados,
    empleadosActivos,
    empleadosInactivos,
    countByRole,
    // Acciones
    cargarEmpleados,
    crearNuevoEmpleado,
    actualizarEmpleado,
    toggleEstadoEmpleado,
    iniciarSuscripcion,
    sincronizar,
  }
})
