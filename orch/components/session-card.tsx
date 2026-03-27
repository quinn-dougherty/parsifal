"use client"

import type { TmuxSession } from "@/lib/types"
import { relativeTime } from "@/lib/time"

export function SessionCard({ session: s }: { session: TmuxSession }) {
  return (
    <div className="bg-gray-900 rounded p-3 border border-gray-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              s.attached ? "bg-green-400" : "bg-gray-600"
            }`}
          />
          <span className="font-mono font-semibold">{s.name}</span>
        </div>
        <span className="text-sm text-gray-500">
          {relativeTime(new Date(s.created * 1000))}
        </span>
      </div>
      <div className="text-sm text-gray-500 mt-1">
        {s.windows} {s.windows === 1 ? "window" : "windows"}
        <span className="mx-2">&middot;</span>
        {s.attached ? "attached" : "detached"}
      </div>
    </div>
  )
}
