"use client"

import { Bar } from "@/components/bar"
import { SessionCard } from "@/components/session-card"
import { usePolling } from "@/hooks/use-polling"
import type { UsageData, TmuxSession } from "@/lib/types"

function UsageSection() {
  const { data, error } = usePolling<UsageData>("/api/usage", 2000)

  if (error) return <p className="text-red-400 text-sm">Usage error: {error}</p>
  if (!data) return <p className="text-gray-500 text-sm">Loading usage...</p>

  return (
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
  )
}

function InfoSection() {
  const { data } = usePolling<{ output: string }>("/api/info", 0)

  return (
    <pre className="font-mono text-sm text-green-400 whitespace-pre-wrap break-words bg-gray-900 border border-gray-800 rounded p-3 overflow-auto max-h-64">
      {data?.output ?? "Loading..."}
    </pre>
  )
}

function SessionsSection() {
  const { data, error } = usePolling<{ sessions: TmuxSession[] }>("/api/sessions", 5000)
  const sessions = data?.sessions ?? null

  if (error) return <p className="text-red-400 text-sm">Sessions error: {error}</p>
  if (sessions === null) return <p className="text-gray-500 text-sm">Loading sessions...</p>
  if (sessions.length === 0) return <p className="text-gray-500 text-sm">No active tmux sessions</p>

  return (
    <div className="space-y-2">
      {sessions.map((s) => <SessionCard key={s.name} session={s} />)}
    </div>
  )
}

export default function SystemPage() {
  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto font-mono">
      <h1 className="text-xl sm:text-2xl font-bold mb-6">System</h1>

      <section className="mb-8">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">
          Usage
        </h2>
        <UsageSection />
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">
          Sessions
        </h2>
        <SessionsSection />
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">
          Info
        </h2>
        <InfoSection />
      </section>
    </div>
  )
}
