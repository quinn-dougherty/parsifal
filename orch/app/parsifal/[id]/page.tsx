"use client"

import { useState, useEffect, useRef } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { usePolling } from "@/hooks/use-polling"
import { Modal } from "@/components/modal"
import { relativeTime } from "@/lib/time"
import type { RunMeta } from "@/lib/types"
import { statusColors } from "@/lib/types"
import { parseLog, type SegmentType, type LogSegment } from "@/lib/log-parser"

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

// --- Log segment rendering ---

const segmentStyles: Record<SegmentType, { border: string; bg: string; text: string; label: string; labelColor: string }> = {
  agent:          { border: "border-gray-800",  bg: "",                text: "text-gray-300",  label: "",           labelColor: "" },
  system:         { border: "border-amber-900",  bg: "bg-amber-950/30", text: "text-amber-400", label: "SYSTEM",     labelColor: "text-amber-500" },
  "user-send":    { border: "border-blue-900",   bg: "bg-blue-950/30",  text: "text-blue-300",  label: "SEND",       labelColor: "text-blue-400" },
  "user-nudge":   { border: "border-green-900",  bg: "bg-green-950/30", text: "text-green-300", label: "NUDGE",      labelColor: "text-green-400" },
  "user-interrupt":{ border: "border-yellow-900", bg: "bg-yellow-950/30",text: "text-yellow-300",label: "INTERRUPT",  labelColor: "text-yellow-400" },
  code:           { border: "border-gray-700",   bg: "bg-gray-950",     text: "text-emerald-300",label: "",          labelColor: "" },
}

const filterLabels: Record<string, { label: string; color: string; activeColor: string }> = {
  agent:    { label: "Agent",     color: "border-gray-600 text-gray-500",  activeColor: "border-gray-400 text-gray-200 bg-gray-800" },
  system:   { label: "System",    color: "border-amber-800 text-amber-600", activeColor: "border-amber-500 text-amber-300 bg-amber-950" },
  user:     { label: "User",      color: "border-blue-800 text-blue-600",  activeColor: "border-blue-500 text-blue-300 bg-blue-950" },
  code:     { label: "Code",      color: "border-emerald-800 text-emerald-600", activeColor: "border-emerald-500 text-emerald-300 bg-emerald-950" },
}

function LogSegmentView({ segment }: { segment: LogSegment }) {
  const style = segmentStyles[segment.type]

  if (segment.type === "system") {
    return (
      <div className={`flex items-center gap-2 px-3 py-1.5 ${style.bg} border-l-2 ${style.border}`}>
        <span className={`text-[10px] font-bold tracking-wider ${style.labelColor}`}>{style.label}</span>
        <span className={`text-xs ${style.text}`}>{segment.content}</span>
      </div>
    )
  }

  if (segment.type === "user-send" || segment.type === "user-nudge" || segment.type === "user-interrupt") {
    return (
      <div className={`flex items-start gap-2 px-3 py-1.5 ${style.bg} border-l-2 ${style.border}`}>
        <span className={`text-[10px] font-bold tracking-wider shrink-0 pt-0.5 ${style.labelColor}`}>{style.label}</span>
        <span className={`text-xs ${style.text} whitespace-pre-wrap`}>{segment.content}</span>
        {segment.timestamp && (
          <span className="text-[10px] text-gray-600 shrink-0 ml-auto">
            {new Date(segment.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>
    )
  }

  if (segment.type === "code") {
    return (
      <pre className={`px-3 py-2 ${style.bg} border-l-2 ${style.border} text-xs ${style.text} whitespace-pre-wrap overflow-x-auto`}>
        {segment.content}
      </pre>
    )
  }

  // agent output
  return (
    <pre className={`px-3 py-1 text-xs ${style.text} whitespace-pre-wrap`}>
      {segment.content}
    </pre>
  )
}

// --- Log viewer ---

type FilterKey = "agent" | "system" | "user" | "code"

function segmentFilter(type: SegmentType): FilterKey {
  if (type === "user-send" || type === "user-nudge" || type === "user-interrupt") return "user"
  if (type === "code") return "code"
  if (type === "system") return "system"
  return "agent"
}

function LogViewer({ log, isRunning }: { log: string; isRunning: boolean }) {
  const [follow, setFollow] = useState(true)
  const [filters, setFilters] = useState<Record<FilterKey, boolean>>({
    agent: true, system: true, user: true, code: true,
  })
  const ref = useRef<HTMLDivElement>(null)
  const prevLen = useRef(0)

  const segments = parseLog(log)
  const filtered = segments.filter((s) => filters[segmentFilter(s.type)])

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

  const toggleFilter = (key: FilterKey) =>
    setFilters((f) => ({ ...f, [key]: !f[key] }))

  const counts = segments.reduce(
    (acc, s) => { acc[segmentFilter(s.type)]++; return acc },
    { agent: 0, system: 0, user: 0, code: 0 } as Record<FilterKey, number>,
  )

  return (
    <>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-gray-400">
            Log
            {isRunning && (
              <span className="ml-2 inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            )}
          </h2>
          <div className="flex gap-1">
            {(Object.keys(filterLabels) as FilterKey[]).map((key) => (
              <button
                key={key}
                onClick={() => toggleFilter(key)}
                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                  filters[key] ? filterLabels[key].activeColor : filterLabels[key].color
                }`}
              >
                {filterLabels[key].label}
                {counts[key] > 0 && <span className="ml-1 opacity-60">{counts[key]}</span>}
              </button>
            ))}
          </div>
        </div>
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
      <div
        ref={ref}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-auto rounded border border-gray-800 bg-gray-900 font-mono"
        style={{ maxHeight: "calc(100vh - 300px)" }}
      >
        {filtered.length === 0 ? (
          <div className="p-3 text-xs text-gray-600">
            {log ? "All segments filtered out" : "Waiting for output..."}
          </div>
        ) : (
          <div className="divide-y divide-gray-800/50">
            {filtered.map((segment, i) => (
              <LogSegmentView key={i} segment={segment} />
            ))}
          </div>
        )}
      </div>
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
  const showDeploy = !!meta?.workdir?.includes("projects/self")

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
            {meta.stale ? "stuck" : meta.status}{!meta.stale && (meta.status === "completed" || meta.status === "failed") ? ` (exit ${meta.exitCode ?? "?"})` : ""}
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
