"use client"

import { Bar } from "@/components/bar"
import { usePolling } from "@/hooks/use-polling"
import type { UsageData } from "@/lib/types"

export default function UsagePage() {
  const { data, error } = usePolling<UsageData>("/api/usage", 2000)

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-8">System Usage</h1>
      {error && <p className="text-red-400 mb-4 text-sm">Error: {error}</p>}
      {!data ? (
        <p className="text-gray-400">Loading...</p>
      ) : (
        <>
          <Bar label="CPU" percent={data.cpu.usagePercent} />
          <Bar
            label="Memory"
            percent={data.memory.usagePercent}
            detail={`${data.memory.usedMB} / ${data.memory.totalMB} MB`}
          />
          <Bar
            label="Swap"
            percent={data.swap.usagePercent}
            detail={`${data.swap.usedMB} / ${data.swap.totalMB} MB`}
          />
        </>
      )}
    </div>
  )
}
