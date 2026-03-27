"use client"

import { useState } from "react"
import Link from "next/link"
import { usePolling } from "@/hooks/use-polling"
import { Modal } from "@/components/modal"
import { formatTime } from "@/lib/time"
import type { Run } from "@/lib/types"
import { statusColors } from "@/lib/types"

// --- Launch form ---

function LaunchForm({ runs, onLaunched }: { runs: Run[]; onLaunched: () => void }) {
  const [prompt, setPrompt] = useState("")
  const [repo, setRepo] = useState("")
  const [secrets, setSecrets] = useState("")
  const [agent, setAgent] = useState("claude")
  const [mode, setMode] = useState<Run["mode"]>("research")
  const [workdir, setWorkdir] = useState("")
  const [staleAfterMin, setStaleAfterMin] = useState("10")
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function applySelfPreset() {
    setMode("job")
    setAgent("claude")
    setWorkdir("~/projects/self")
    setStaleAfterMin("10")
    setRepo("")
    setPrompt((prev) => prev || "Read CLAUDE.md first. ")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setMessage(null)
    try {
      const res = await fetch("/api/parsifal/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          repo: repo || undefined,
          secrets: secrets.split(",").map((s) => s.trim()).filter(Boolean),
          agent,
          mode,
          ...(mode === "job" && workdir ? { workdir } : {}),
          ...(mode === "job" ? { watchdog: { staleAfterMin: parseInt(staleAfterMin) || 10 } } : {}),
        }),
      })
      if (res.ok) {
        setMessage({ text: "Launched successfully", ok: true })
        setPrompt("")
        onLaunched()
      } else {
        const data = await res.json().catch(() => ({}))
        setMessage({ text: data.error || `Launch failed (${res.status})`, ok: false })
      }
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Network error", ok: false })
    } finally {
      setSubmitting(false)
    }
  }

  const pastRepos = [...new Set(runs.map((r) => r.repo).filter((r): r is string => !!r))]
  const pastSecrets = [...new Set(runs.flatMap((r) => r.secrets ?? []).filter(Boolean))]
  const pastWorkdirs = [...new Set(runs.map((r) => r.workdir).filter((w): w is string => !!w))]
  const inputCls = "w-full rounded border border-gray-700 bg-gray-900 p-2 text-sm text-white placeholder-gray-600 focus:border-gray-500 focus:outline-none"

  return (
    <form onSubmit={handleSubmit} className="mb-8 space-y-4 rounded-lg border border-gray-800 bg-gray-900 p-4 sm:p-6">
      <div>
        <label className="mb-1 block text-sm text-gray-400">Repo</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="owner/repo or git URL (optional)"
            className={`flex-1 ${inputCls}`}
          />
          {pastRepos.length > 0 && (
            <select
              value=""
              onChange={(e) => setRepo(e.target.value)}
              className="rounded border border-gray-700 bg-gray-900 p-2 text-sm text-gray-400 focus:border-gray-500 focus:outline-none"
            >
              <option value="" disabled>recent...</option>
              {pastRepos.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-400">
          Prompt <span className="text-red-400">*</span>
        </label>
        <textarea
          required
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className={`font-mono ${inputCls}`}
          placeholder="Describe the task..."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm text-gray-400">Agent</label>
          <select value={agent} onChange={(e) => setAgent(e.target.value)} className={inputCls}>
            <option value="claude">claude</option>
            <option value="codex">codex</option>
            <option value="gemini">gemini</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-gray-400">Mode</label>
          <select value={mode} onChange={(e) => setMode(e.target.value as Run["mode"])} className={inputCls}>
            <option value="pr">Pull Request</option>
            <option value="research">Research</option>
            <option value="pm">Project Management</option>
            <option value="job">Job</option>
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-400">Secrets</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={secrets}
            onChange={(e) => setSecrets(e.target.value)}
            placeholder="myproject.OPENAI_API_KEY,myproject.ANTHROPIC_API_KEY"
            className={`flex-1 ${inputCls}`}
          />
          {pastSecrets.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                const val = e.target.value
                const current = secrets.split(",").map((s) => s.trim()).filter(Boolean)
                if (!current.includes(val)) {
                  setSecrets(current.length > 0 ? `${secrets}, ${val}` : val)
                }
              }}
              className="rounded border border-gray-700 bg-gray-900 p-2 text-sm text-gray-400 focus:border-gray-500 focus:outline-none"
            >
              <option value="" disabled>recent...</option>
              {pastSecrets.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </div>
      </div>

      {mode === "job" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-gray-400">Working Directory</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={workdir}
                onChange={(e) => setWorkdir(e.target.value)}
                placeholder="/path/to/persistent/workdir (optional)"
                className={`flex-1 ${inputCls}`}
              />
              {pastWorkdirs.length > 0 && (
                <select
                  value=""
                  onChange={(e) => setWorkdir(e.target.value)}
                  className="rounded border border-gray-700 bg-gray-900 p-2 text-sm text-gray-400 focus:border-gray-500 focus:outline-none"
                >
                  <option value="" disabled>recent...</option>
                  {pastWorkdirs.map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
              )}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-400">Stale after (min)</label>
            <input
              type="number"
              value={staleAfterMin}
              onChange={(e) => setStaleAfterMin(e.target.value)}
              min="1"
              className={inputCls}
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
        >
          {submitting ? "Launching..." : "Launch"}
        </button>
        <button
          type="button"
          onClick={applySelfPreset}
          className="rounded border border-purple-700 bg-purple-900/30 px-3 py-2 text-sm text-purple-300 transition-colors hover:bg-purple-800/50"
        >
          self
        </button>
        {message && (
          <span className={`text-sm ${message.ok ? "text-green-400" : "text-red-400"}`}>
            {message.text}
          </span>
        )}
      </div>
    </form>
  )
}

// --- Run card ---

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "\u2026" : s
}

function RunCard({ run, onViewReport, onViewLog }: {
  run: Run
  onViewReport: (id: string) => void
  onViewLog: (id: string) => void
}) {
  return (
    <Link
      href={`/parsifal/${run.id}`}
      className="block rounded-lg border border-gray-800 bg-gray-900 p-4 transition-colors hover:border-gray-600 hover:bg-gray-800"
    >
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <span className="font-mono text-sm text-gray-300">{run.id}</span>
        <span className={`text-sm font-medium ${run.stale ? statusColors.stuck : statusColors[run.status] || "text-gray-400"}`}>
          {run.stale ? "stuck" : run.status}
        </span>
        <span className="text-sm text-gray-500">{run.agent}</span>
      </div>
      <p className="mb-2 font-mono text-sm text-gray-400">{truncate(run.prompt, 80)}</p>
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
        <span>{formatTime(run.startedAt)}</span>
        <span className={run.mode === "job" ? "text-purple-400" : "text-gray-600"}>{run.mode}</span>
        {run.pr?.url && (
          <a
            href={run.pr.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 underline hover:text-blue-300"
            onClick={(e) => e.stopPropagation()}
          >
            PR #{run.pr.number}
          </a>
        )}
        {run.hasReport && (
          <button
            onClick={(e) => { e.preventDefault(); onViewReport(run.id) }}
            className="text-blue-400 underline hover:text-blue-300"
          >
            View Report
          </button>
        )}
        {run.hasLog && (
          <button
            onClick={(e) => { e.preventDefault(); onViewLog(run.id) }}
            className="text-yellow-500 underline hover:text-yellow-400"
          >
            View Log
          </button>
        )}
      </div>
    </Link>
  )
}

// --- Content viewer (modal for report or log) ---

function useContentViewer() {
  const [viewing, setViewing] = useState<{ id: string; type: "report" | "log" } | null>(null)
  const [content, setContent] = useState<string | null>(null)

  async function open(id: string, type: "report" | "log") {
    setViewing({ id, type })
    setContent(null)
    const endpoint = type === "report" ? "report" : "log"
    const res = await fetch(`/api/parsifal/${endpoint}?id=${id}`)
    if (res.ok) {
      const data = await res.json()
      setContent(data.content)
    }
  }

  async function refresh() {
    if (!viewing) return
    const endpoint = viewing.type === "report" ? "report" : "log"
    const res = await fetch(`/api/parsifal/${endpoint}?id=${viewing.id}`)
    if (res.ok) {
      const data = await res.json()
      setContent(data.content)
    }
  }

  function close() {
    setViewing(null)
    setContent(null)
  }

  return { viewing, content, open, refresh, close }
}

// --- Page ---

export default function ParsifalPage() {
  const { data, refetch } = usePolling<{ runs: Run[] }>("/api/parsifal/runs", 5000)
  const runs = data?.runs ?? []
  const viewer = useContentViewer()

  return (
    <div className="min-h-screen bg-gray-950 p-4 text-white sm:p-6">
      <h1 className="mb-6 font-mono text-2xl font-bold">Parsifal</h1>

      <LaunchForm runs={runs} onLaunched={refetch} />

      <h2 className="mb-4 font-mono text-lg font-semibold">Runs</h2>
      {runs.length === 0 ? (
        <p className="text-gray-500">No runs yet</p>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <RunCard
              key={run.id}
              run={run}
              onViewReport={(id) => viewer.open(id, "report")}
              onViewLog={(id) => viewer.open(id, "log")}
            />
          ))}
        </div>
      )}

      {viewer.viewing && viewer.content !== null && (
        <Modal
          title={viewer.viewing.type === "log" ? `log: ${viewer.viewing.id}` : viewer.viewing.id}
          onClose={viewer.close}
          borderColor={viewer.viewing.type === "log" ? "border-yellow-900/50" : undefined}
          actions={
            viewer.viewing.type === "log" ? (
              <button onClick={viewer.refresh} className="text-sm text-gray-500 hover:text-white">
                Refresh
              </button>
            ) : undefined
          }
        >
          <pre className={`whitespace-pre-wrap font-mono ${
            viewer.viewing.type === "log" ? "text-xs text-gray-300" : "text-sm text-gray-200"
          }`}>
            {viewer.content}
          </pre>
        </Modal>
      )}
    </div>
  )
}
