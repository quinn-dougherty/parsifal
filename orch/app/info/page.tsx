"use client"

import { usePolling } from "@/hooks/use-polling"

export default function InfoPage() {
  const { data } = usePolling<{ output: string }>("/api/info", 0)

  return (
    <div className="min-h-screen bg-gray-950 text-green-400 p-4 sm:p-8">
      <pre className="font-mono text-sm whitespace-pre-wrap break-words">
        {data?.output ?? "Loading..."}
      </pre>
    </div>
  )
}
