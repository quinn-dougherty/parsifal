"use client"

import { useState, useEffect, useCallback } from "react"

export function usePolling<T>(url: string, intervalMs: number) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "fetch failed")
    }
  }, [url])

  useEffect(() => {
    refetch()
    if (intervalMs <= 0) return
    const id = setInterval(refetch, intervalMs)
    return () => clearInterval(id)
  }, [refetch, intervalMs])

  return { data, error, refetch }
}
