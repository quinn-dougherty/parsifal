"use client"

import { useState, useEffect, useRef } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { usePolling } from "@/hooks/use-polling"
import { Modal } from "@/components/modal"
import { relativeTime } from "@/lib/time"
import type { RunMeta } from "@/lib/types"
import { statusColors } from "@/lib/types"

// --- Control panel ---

interface ActionEntry {
  action: string
  message?: string
  time: string
  ok: boolean
}

const actionColors: Record<string, string> = {
  send: "text-blue-400",
  nudge: "text-green-400",
  interrupt: "text-yellow-400",
  reset: "text-red-400",
}

function ControlPanel({ id, onAction }: {
  id: string
  onAction: () => void
}) {
  const [msg, setMsg] = useState("")
  const [history, setHistory] = useState<ActionEntry[]>([])

  async function sendControl(action: string, message?: string) {
    const time = new Date().toLocaleTimeString()
    try {
      const res = await fetch("/api/parsifal/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, message: message || undefined }),
      })
      const data = await res.json()
      const ok = res.ok
      setHistory((h) => [{ action, message, time, ok }, ...h])
      if (ok) { setMsg(""); onAction() }
      if (!ok) console.error(data.error || `${action} failed`)
    } catch {
      setHistory((h) => [{ action, message, time, ok: false }, ...h])
    }
  }

  return (
    <div className="mb-4 rounded border border-gray-800 bg-gray-900 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && msg.trim()) sendControl("send", msg) }}
          placeholder="Message to agent..."
          className="flex-1 min-w-0 rounded border border-gray-700 bg-gray-950 p-2 text-sm text-white placeholder-gray-600 focus:border-gray-500 focus:outline-none"
        />
        <button
          onClick={() => sendControl("send", msg)}
          disabled={!msg.trim()}
          className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-30"
        >
          Send
        </button>
        <button
          onClick={() => sendControl("nudge", msg || undefined)}
          className="rounded bg-green-700 px-3 py-2 text-sm text-white hover:bg-green-600"
        >
          Nudge
        </button>
        <button
          onClick={() => sendControl("interrupt", msg || undefined)}
          className="rounded bg-yellow-700 px-3 py-2 text-sm text-white hover:bg-yellow-600"
        >
          Interrupt
        </button>
        <button
          onClick={() => {
            if (confirm("Reset this run? The session will be killed and relaunched.")) {
              sendControl("reset", msg || undefined)
            }
          }}
          className="rounded bg-red-700 px-3 py-2 text-sm text-white hover:bg-red-600"
        >
          Reset
        </button>
      </div>
      {history.length > 0 && (
        <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
          {history.map((entry, i) => (
            <div key={i} className="flex items-baseline gap-2 text-xs">
              <span className="text-gray-600">{entry.time}</span>
              <span className={actionColors[entry.action] || "text-gray-400"}>
                {entry.action}
              </span>
              {entry.message && (
                <span className="text-gray-500 truncate">{entry.message}</span>
              )}
              {!entry.ok && <span className="text-red-400">failed</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Deploy button ---

function DeployButton({ id, onDone }: { id: string; onDone: () => void }) {
  const [deploying, setDeploying] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  async function handleDeploy() {
    if (!confirm("Build and deploy Parsifal? The service will restart.")) return
    setDeploying(true)
    setStatus(null)
    try {
      const res = await fetch("/api/parsifal/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "deploy" }),
      })
      const data = await res.json()
      setStatus(res.ok ? "Deploy successful — service restarted" : `Deploy failed: ${data.error}`)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Deploy failed")
    } finally {
      setDeploying(false)
      onDone()
    }
  }

  return (
    <div className="mb-4 flex items-center gap-3">
      <button
        onClick={handleDeploy}
        disabled={deploying}
        className="rounded bg-purple-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-600 disabled:opacity-50"
      >
        {deploying ? "Deploying..." : "Deploy"}
      </button>
      {status && <span className="text-xs text-gray-400">{status}</span>}
    </div>
  )
}

// --- Log viewer ---

function LogViewer({ log, isRunning }: { log: string; isRunning: boolean }) {
  const [follow, setFollow] = useState(true)
  const ref = useRef<HTMLPreElement>(null)
  const prevLen = useRef(0)

  useEffect(() => {
    if (follow && log.length > prevLen.current && ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight
    }
    prevLen.current = log.length
  }, [log, follow])

  const handleScroll = () => {
    if (!ref.current) return
    const { scrollTop, scrollHeight, clientHeight } = ref.current
    setFollow(scrollHeight - scrollTop - clientHeight < 40)
  }

  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold text-gray-400">
          Log
          {isRunning && (
            <span className="ml-2 inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          )}
        </h2>
        <button
          onClick={() => {
            setFollow(true)
            if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
          }}
          className={`text-xs transition-colors ${follow ? "text-green-400" : "text-gray-600 hover:text-white"}`}
        >
          {follow ? "following" : "scroll to bottom"}
        </button>
      </div>
      <pre
        ref={ref}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-auto rounded border border-gray-800 bg-gray-900 p-3 font-mono text-xs text-gray-300 whitespace-pre-wrap"
        style={{ maxHeight: "calc(100vh - 280px)" }}
      >
        {log || <span className="text-gray-600">Waiting for output...</span>}
      </pre>
    </>
  )
}

// --- Run info box ---

function RunInfo({ meta, onViewReport }: { meta: RunMeta; onViewReport: () => void }) {
  return (
    <div className="mb-4 rounded border border-gray-800 bg-gray-900 p-3 text-sm">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-gray-400">
        <span>agent: <span className="text-white">{meta.agent}</span></span>
        <span>mode: <span className="text-white">{meta.mode}</span></span>
        <span>started {relativeTime(new Date(meta.startedAt))}</span>
        {meta.pr?.url && (
          <a
            href={meta.pr.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 underline hover:text-blue-300"
          >
            PR #{meta.pr.number}
          </a>
        )}
        {meta.hasReport && (
          <button onClick={onViewReport} className="text-blue-400 underline hover:text-blue-300">
            View Report
          </button>
        )}
      </div>
      {(meta.workdir || meta.lastActivity || (meta.resetCount && meta.resetCount > 0)) && (
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
          {meta.workdir && <span>workdir: {meta.workdir}</span>}
          {meta.lastActivity && <span>last activity: {relativeTime(new Date(meta.lastActivity))}</span>}
          {meta.resetCount && meta.resetCount > 0 && <span>resets: {meta.resetCount}</span>}
        </div>
      )}
      <p className="mt-2 text-gray-500 font-mono text-xs whitespace-pre-wrap">{meta.prompt}</p>
    </div>
  )
}

// --- Page ---

export default function RunPage() {
  const { id } = useParams<{ id: string }>()
  const { data: metaData, refetch: refetchMeta } = usePolling<{ run: RunMeta }>(`/api/parsifal/runs?id=${id}`, 5000)
  const { data: logData, refetch: refetchLog } = usePolling<{ content: string | null }>(`/api/parsifal/log?id=${id}`, 2000)
  const [reportContent, setReportContent] = useState<string | null>(null)
  const [showReport, setShowReport] = useState(false)

  const meta = metaData?.run ?? null
  const log = logData?.content ?? ""
  const isRunning = meta?.status === "running"
  const showDeploy = meta?.mode === "job" && meta.workdir?.includes("projects/self")

  async function viewReport() {
    const res = await fetch(`/api/parsifal/report?id=${id}`)
    if (res.ok) {
      const data = await res.json()
      setReportContent(data.content)
      setShowReport(true)
    }
  }

  function onControlAction() {
    refetchLog()
    refetchMeta()
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-950 p-4 text-white sm:p-6">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <Link href="/parsifal" className="text-gray-500 hover:text-white text-sm transition-colors">
          &larr; runs
        </Link>
        <h1 className="font-mono text-lg font-bold truncate">{id}</h1>
        {meta && (
          <span className={`text-sm font-medium ${meta.stale ? "text-yellow-400" : statusColors[meta.status] || "text-gray-400"}`}>
            {meta.stale ? "stuck" : meta.status}
          </span>
        )}
      </div>

      {meta && <RunInfo meta={meta} onViewReport={viewReport} />}
      {meta && isRunning && <ControlPanel id={id} onAction={onControlAction} />}
      {meta && showDeploy && <DeployButton id={id} onDone={refetchLog} />}

      <LogViewer log={log} isRunning={isRunning} />

      {showReport && reportContent !== null && (
        <Modal title="report" onClose={() => setShowReport(false)}>
          <pre className="whitespace-pre-wrap font-mono text-sm text-gray-200">
            {reportContent}
          </pre>
        </Modal>
      )}
    </div>
  )
}
