import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export function isVapidConfigured(): boolean {
  return Boolean(VAPID_PUBLIC_KEY?.trim())
}

export function canShowLocalNotifications(): boolean {
  return 'Notification' in window && Notification.permission === 'granted'
}

const SERVICE_WORKER_READY_TIMEOUT_MS = 8000

async function getPushServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Este navegador no soporta Service Worker')
  }

  const registrations = await navigator.serviceWorker.getRegistrations()
  if (registrations.length > 0) {
    const firstRegistration = registrations[0]
    if (!firstRegistration) {
      throw new Error('No se encontró un Service Worker válido')
    }

    const activeRegistration = registrations.find((registration) => registration.active)
    return waitForServiceWorkerReady(activeRegistration ?? firstRegistration)
  }

  const candidates = import.meta.env.DEV
    ? ['/dev-sw.js?dev-sw', '/sw.js']
    : ['/sw.js']

  let lastError: unknown = null

  for (const candidate of candidates) {
    try {
      const registration = await navigator.serviceWorker.register(candidate, { scope: '/' })
      return waitForServiceWorkerReady(registration)
    } catch (error) {
      lastError = error
    }
  }

  try {
    const fallback = await navigator.serviceWorker.ready
    return waitForServiceWorkerReady(fallback)
  } catch {
    throw new Error(
      `No se pudo registrar el Service Worker de notificaciones${
        lastError instanceof Error && lastError.message ? `: ${lastError.message}` : ''
      }`
    )
  }
}

async function waitForServiceWorkerReady(
  registration: ServiceWorkerRegistration
): Promise<ServiceWorkerRegistration> {
  if (registration.active) {
    return registration
  }

  const ready = navigator.serviceWorker.ready
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error('Tiempo de espera agotado iniciando notificaciones (Service Worker)'))
    }, SERVICE_WORKER_READY_TIMEOUT_MS)
  })

  return Promise.race([ready, timeout])
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied'
  return Notification.requestPermission()
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null
  const registration = await getPushServiceWorkerRegistration()
  return registration.pushManager.getSubscription()
}

export async function subscribeToPushNotifications(): Promise<PushSubscription | null> {
  if (!isPushSupported()) {
    return null
  }

  if (!isVapidConfigured()) {
    throw new Error(
      'Falta configurar VITE_VAPID_PUBLIC_KEY en pos-retail-pwa/.env y reiniciar el servidor'
    )
  }

  const permission = await requestNotificationPermission()
  if (permission !== 'granted') {
    throw new Error('Permiso de notificaciones denegado por el usuario')
  }

  const registration = await getPushServiceWorkerRegistration()
  let subscription = await registration.pushManager.getSubscription()

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!)
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

export async function showLocalNotification(
  title: string,
  body: string,
  url: string = '/pos'
): Promise<void> {
  if (!canShowLocalNotifications()) return

  if ('serviceWorker' in navigator) {
    const registration = await getPushServiceWorkerRegistration()
    await registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url }
    })
    return
  }

  new Notification(title, { body })
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