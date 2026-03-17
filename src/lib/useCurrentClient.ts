'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type ClientInfo = {
  id: string
  name: string
  product_name: string | null
  status: string
}

export function useCurrentClient() {
  const [client, setClient] = useState<ClientInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasClient, setHasClient] = useState(false)

  useEffect(() => {
    loadClient()
  }, [])

  async function loadClient() {
    const supabase = createClient()
    const { data } = await supabase
      .from('clients')
      .select('id, name, product_name, status')
      .eq('status', 'active')
      .limit(1)
      .single()

    if (data) {
      setClient(data)
      setHasClient(true)
    }
    setLoading(false)
  }

  return { client, loading, hasClient, reload: loadClient }
}
