'use client'

import { useCallback, useEffect, useRef } from 'react'

export function useNotification() {
  const permissionRef = useRef<NotificationPermission>('default')

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      permissionRef.current = Notification.permission
    }
  }, [])

  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return false
    if (Notification.permission === 'granted') {
      permissionRef.current = 'granted'
      return true
    }
    if (Notification.permission === 'denied') return false
    const result = await Notification.requestPermission()
    permissionRef.current = result
    return result === 'granted'
  }, [])

  const notify = useCallback((title: string, body?: string) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission !== 'granted') return

    // Only notify if the page is not focused
    if (document.visibilityState === 'hidden') {
      const n = new Notification(title, {
        body,
        icon: '/favicon.ico',
        tag: 'bizu-notification',
      })
      n.onclick = () => {
        window.focus()
        n.close()
      }
    }
  }, [])

  return { requestPermission, notify }
}
