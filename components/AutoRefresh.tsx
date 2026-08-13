'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AutoRefresh({ intervalSeconds = 30 }: { intervalSeconds?: number }) {
  const router = useRouter()

  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh()
    }, intervalSeconds * 1000)

    return () => clearInterval(interval)
  }, [router, intervalSeconds])

  return null
}