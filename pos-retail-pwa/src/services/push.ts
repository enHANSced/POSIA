import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied'
  return Notification.requestPermission()
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

export async function subscribeToPushNotifications(): Promise<PushSubscription | null> {
  if (!isPushSupported()) {
    return null
  }

  if (!VAPID_PUBLIC_KEY) {
    throw new Error('No se encontró VITE_VAPID_PUBLIC_KEY para configurar Web Push')
  }

  const permission = await requestNotificationPermission()
  if (permission !== 'granted') {
    throw new Error('Permiso de notificaciones denegado por el usuario')
  }

  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    })
  }

  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Debes iniciar sesión para activar notificaciones')
  }

  const authKey = subscription.getKey('auth')
  const p256dhKey = subscription.getKey('p256dh')

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: subscription.endpoint,
      auth_key: authKey ? arrayBufferToBase64(authKey) : null,
      p256dh_key: p256dhKey ? arrayBufferToBase64(p256dhKey) : null
    },
    { onConflict: 'endpoint' }
  )

  if (error) throw error
  return subscription
}

export async function unsubscribeFromPushNotifications(): Promise<void> {
  if (!isPushSupported()) return

  const subscription = await getExistingPushSubscription()
  if (!subscription) return

  const endpoint = subscription.endpoint
  await subscription.unsubscribe()

  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  if (error) throw error
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const normalized = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(normalized)
  return Uint8Array.from(raw, (char) => char.charCodeAt(0))
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
  return btoa(binary)
}