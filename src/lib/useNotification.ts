'use client'

import { useCallback, useEffect, useRef } from 'react'

export function useNotification() {
  const permissionRef = useRef<NotificationPermission>('default')
  const hasRequestedRef = useRef(false)

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
    // ユーザー操作起因でないと権限要求がブロックされるブラウザ対策
    // 初回のみリクエストし、以降はスキップ
    if (hasRequestedRef.current) return false
    hasRequestedRef.current = true
    try {
      const result = await Notification.requestPermission()
      permissionRef.current = result
      return result === 'granted'
    } catch {
      return false
    }
  }, [])

  const notify = useCallback((title: string, body?: string) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return

    // 権限がない場合はリクエストを試みる
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(result => {
        permissionRef.current = result
        if (result === 'granted') {
          sendNotification(title, body)
        }
      }).catch(() => { /* ignore */ })
      return
    }

    if (Notification.permission !== 'granted') return
    sendNotification(title, body)
  }, [])

  return { requestPermission, notify }
}

function sendNotification(title: string, body?: string) {
  // タブがフォーカスされていてもいなくても通知を送る
  const n = new Notification(title, {
    body,
    icon: '/favicon.ico',
    tag: `bizu-${Date.now()}`, // ユニークタグで通知が上書きされないようにする
  })
  n.onclick = () => {
    window.focus()
    n.close()
  }
  // 10秒後に自動で閉じる
  setTimeout(() => n.close(), 10000)
}
