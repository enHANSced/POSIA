import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/services/supabase'
import type { UserProfile } from '@/types/supabase'

// Mapeo de errores de Supabase a mensajes amigables en español
function translateAuthError(msg: string): string {
  const errorMap: Record<string, string> = {
    'email rate limit exceeded': 'Se excedió el límite de correos. Esperá unos minutos e intentá de nuevo.',
    'rate limit exceeded': 'Demasiados intentos. Esperá unos minutos e intentá de nuevo.',
    'invalid login credentials': 'Correo o contraseña incorrectos.',
    'email not confirmed': 'Tu correo no ha sido verificado. Revisá tu bandeja de entrada.',
    'user already registered': 'Este correo ya está registrado. Intentá iniciar sesión.',
    'signup is disabled': 'El registro de nuevos usuarios está deshabilitado.',
    'password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres.',
    'user not found': 'No se encontró un usuario con ese correo.',
    'new password should be different from the old password': 'La nueva contraseña debe ser diferente a la anterior.',
  }
  const lower = msg.toLowerCase()
  for (const [key, value] of Object.entries(errorMap)) {
    if (lower.includes(key)) return value
  }
  return msg
}

export const useAuthStore = defineStore('auth', () => {
  // Estado
  const user = ref<User | null>(null)
  const session = ref<Session | null>(null)
  const profile = ref<UserProfile | null>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)

  // Computados
  const isAuthenticated = computed(() => !!session.value)
  const isAdmin = computed(() => profile.value?.role === 'admin')
  const isSeller = computed(() => profile.value?.role === 'seller' || profile.value?.role === 'admin')
  const userName = computed(() => profile.value?.full_name || user.value?.email || 'Usuario')
  const userRole = computed(() => profile.value?.role || 'viewer')

  // Acciones
  async function initialize() {
    loading.value = true
    error.value = null

    try {
      // Obtener sesión actual
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      
      if (currentSession) {
        session.value = currentSession
        user.value = currentSession.user
        await fetchProfile()
      }

      // Escuchar cambios de autenticación
      supabase.auth.onAuthStateChange(async (event, newSession) => {
        session.value = newSession
        user.value = newSession?.user || null

        if (newSession?.user) {
          await fetchProfile()
        } else {
          profile.value = null
        }
      })
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Error de inicialización'
      console.error('Error inicializando auth:', err)
    } finally {
      loading.value = false
    }
  }

  async function fetchProfile() {
    if (!user.value) return

    try {
      const { data, error: err } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.value.id)
        .single()

      if (err) throw err
      profile.value = data
    } catch (err) {
      console.error('Error obteniendo perfil:', err)
      // Si no existe perfil, crear uno básico
      profile.value = {
        id: user.value.id,
        email: user.value.email || '',
        full_name: user.value.user_metadata?.full_name || null,
        avatar_url: null,
        role: 'seller',
        phone: null,
        active: true,
        created_at: null,
        updated_at: null
      }
    }
  }

  async function login(email: string, password: string) {
    loading.value = true
    error.value = null

    try {
      const { data, error: err } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (err) throw err

      session.value = data.session
      user.value = data.user
      await fetchProfile()

      return { success: true }
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Error de inicio de sesión'
      error.value = translateAuthError(raw)
      return { success: false, error: error.value }
    } finally {
      loading.value = false
    }
  }

  async function register(email: string, password: string, fullName?: string, role: string = 'seller') {
    loading.value = true
    error.value = null

    try {
      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role: role
          },
          emailRedirectTo: `${window.location.origin}/auth/callback`
        }
      })

      if (err) throw err

      // Si Supabase devuelve sesión, el usuario fue auto-confirmado
      const autoConfirmed = !!data.session
      if (autoConfirmed) {
        session.value = data.session
        user.value = data.user
        await fetchProfile()
      }

      return { 
        success: true, 
        user: data.user,
        autoConfirmed,
        message: data.user?.identities?.length === 0 
          ? 'Usuario ya registrado' 
          : autoConfirmed
            ? 'Cuenta creada exitosamente'
            : 'Revisa tu correo para confirmar'
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Error de registro'
      error.value = translateAuthError(raw)
      return { success: false, error: error.value }
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    loading.value = true
    error.value = null

    try {
      const { error: err } = await supabase.auth.signOut()
      if (err) throw err

      user.value = null
      session.value = null
      profile.value = null

      return { success: true }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Error al cerrar sesión'
      return { success: false, error: error.value }
    } finally {
      loading.value = false
    }
  }

  async function updateProfile(updates: Partial<UserProfile>) {
    if (!user.value) return { success: false, error: 'No autenticado' }

    try {
      const { data, error: err } = await supabase
        .from('user_profiles')
        .update(updates)
        .eq('id', user.value.id)
        .select()
        .single()

      if (err) throw err
      profile.value = data

      return { success: true }
    } catch (err) {
      return { 
        success: false, 
        error: err instanceof Error ? err.message : 'Error actualizando perfil' 
      }
    }
  }

  async function resetPassword(email: string) {
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback`
      })

      if (err) throw err
      return { success: true, message: 'Revisa tu correo para restablecer la contraseña' }
    } catch (err) {
      return { 
        success: false, 
        error: err instanceof Error ? err.message : 'Error enviando correo' 
      }
    }
  }

  return {
    // Estado
    user,
    session,
    profile,
    loading,
    error,
    // Computados
    isAuthenticated,
    isAdmin,
    isSeller,
    userName,
    userRole,
    // Acciones
    initialize,
    login,
    register,
    logout,
    updateProfile,
    resetPassword,
    fetchProfile
  }
})
