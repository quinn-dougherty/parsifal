"use client"

import { SessionCard } from "@/components/session-card"
import { usePolling } from "@/hooks/use-polling"
import type { TmuxSession } from "@/lib/types"

export default function SessionsPage() {
  const { data, error } = usePolling<{ sessions: TmuxSession[] }>("/api/sessions", 5000)
  const sessions = data?.sessions ?? null

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-8">tmux Sessions</h1>
      {error && <p className="text-red-400 mb-4 text-sm">Error: {error}</p>}
      {sessions === null ? (
        <p className="text-gray-400">Loading...</p>
      ) : sessions.length === 0 ? (
        <p className="text-gray-400">No active tmux sessions</p>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => <SessionCard key={s.name} session={s} />)}
        </div>
      )}
    </div>
  )
}
