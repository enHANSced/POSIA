import { supabase } from './supabase'
import type { User, Session } from '@supabase/supabase-js'

export interface AuthError {
  message: string
  status?: number
}

// Login con email y contraseña
export async function loginWithEmail(email: string, password: string): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (error) {
    throw error
  }

  return data.session!
}

// Registro con email y contraseña
export async function registerWithEmail(
  email: string,
  password: string,
  metadata?: { name?: string; role?: string }
): Promise<User> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: metadata
    }
  })

  if (error) {
    throw error
  }

  return data.user!
}

// Cerrar sesión
export async function logout(): Promise<void> {
  const { error } = await supabase.auth.signOut()

  if (error) {
    throw error
  }
}

// Obtener usuario actual
export async function getCurrentUser(): Promise<User | null> {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// Obtener sesión actual
export async function getCurrentSession(): Promise<Session | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

// Escuchar cambios de autenticación
export function onAuthStateChange(
  callback: (user: User | null, session: Session | null) => void
) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(session?.user || null, session)
  })
}

// Restablecer contraseña
export async function resetPassword(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`
  })

  if (error) {
    throw error
  }
}

// Actualizar contraseña
export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({
    password: newPassword
  })

  if (error) {
    throw error
  }
}

// Verificar si el usuario tiene un rol específico
export async function hasRole(role: string): Promise<boolean> {
  const user = await getCurrentUser()
  return user?.user_metadata?.role === role
}
