"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePolling } from "@/hooks/use-polling"
import { Modal } from "@/components/modal"
import { formatTime } from "@/lib/time"
import type { Run, Preset, Strategy } from "@/lib/types"
import { statusColors, strategyLabels } from "@/lib/types"

// --- Launch form ---

function LaunchForm({ runs, onLaunched }: { runs: Run[]; onLaunched: () => void }) {
  const [goal, setGoal] = useState("")
  const [repo, setRepo] = useState("")
  const [secrets, setSecrets] = useState("")
  const [agent, setAgent] = useState("claude")
  const [strategy, setStrategy] = useState<Strategy>("fire-and-forget")
  const [workdir, setWorkdir] = useState("")
  const [staleAfterMin, setStaleAfterMin] = useState("10")
  const [report, setReport] = useState(false)
  const [constraints, setConstraints] = useState("")
  const [winType, setWinType] = useState<"none" | "programmatic" | "vibes">("none")
  const [winCheck, setWinCheck] = useState("")
  const [winCriteria, setWinCriteria] = useState("")
  const [winLabel, setWinLabel] = useState("")
  const [presetName, setPresetName] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const [presets, setPresets] = useState<Preset[]>([])
  useEffect(() => {
    fetch("/api/parsifal/presets").then((r) => r.json()).then((d) => setPresets(d.presets ?? [])).catch(() => {})
  }, [])

  function applyPreset(p: Preset) {
    setPresetName(p.name)
    setStrategy(p.strategy)
    setAgent(p.agent)
    setWorkdir(p.workdir ?? "")
    setSecrets(p.secrets?.join(", ") ?? "")
    setStaleAfterMin(String(p.watchdog?.staleAfterMin ?? 10))
    setReport(p.report ?? false)
    setConstraints(p.constraints?.join("\n") ?? "")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setMessage(null)
    try {
      const win = winType === "programmatic" ? { type: "programmatic" as const, check: winCheck, label: winLabel || undefined }
        : winType === "vibes" ? { type: "vibes" as const, criteria: winCriteria, label: winLabel || undefined }
        : undefined
      const constraintList = constraints.split("\n").map((s) => s.trim()).filter(Boolean)

      const res = await fetch("/api/parsifal/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spec: {
            goal,
            repo: repo || undefined,
            report: report || undefined,
            win,
            constraints: constraintList.length > 0 ? constraintList : undefined,
          },
          strategy,
          agent,
          workdir: workdir || undefined,
          secrets: secrets.split(",").map((s) => s.trim()).filter(Boolean),
          ...(strategy === "monitored" ? { watchdog: { staleAfterMin: parseInt(staleAfterMin) || 10 } } : {}),
          preset: presetName || undefined,
        }),
      })
      if (res.ok) {
        setMessage({ text: "Launched successfully", ok: true })
        setGoal("")
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

  const pastRepos = [...new Set(runs.map((r) => r.spec?.repo).filter((r): r is string => !!r))]
  const pastSecrets = [...new Set(runs.flatMap((r) => r.secrets ?? []).filter(Boolean))]
  const pastWorkdirs = [...new Set(runs.map((r) => r.workdir).filter((w): w is string => !!w))]
  const inputCls = "w-full rounded border border-gray-700 bg-gray-900 p-2 text-sm text-white placeholder-gray-600 focus:border-gray-500 focus:outline-none"
  const selectCls = "rounded border border-gray-700 bg-gray-900 p-2 text-sm text-gray-400 focus:border-gray-500 focus:outline-none"

  return (
    <form onSubmit={handleSubmit} className="mb-8 space-y-4 rounded-lg border border-gray-800 bg-gray-900 p-4 sm:p-6">
      {/* Presets */}
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => applyPreset(p)}
              className={`rounded border px-3 py-1.5 text-sm transition-colors ${
                presetName === p.name
                  ? "border-purple-500 bg-purple-900/40 text-purple-300"
                  : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200"
              }`}
              title={p.description}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {/* Goal */}
      <div>
        <label className="mb-1 block text-sm text-gray-400">
          Goal <span className="text-red-400">*</span>
        </label>
        <textarea
          required
          rows={4}
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          className={`font-mono ${inputCls}`}
          placeholder="Describe the task..."
        />
      </div>

      {/* Repo */}
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
            <select value="" onChange={(e) => setRepo(e.target.value)} className={selectCls}>
              <option value="" disabled>recent...</option>
              {pastRepos.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Agent + Strategy */}
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
          <label className="mb-1 block text-sm text-gray-400">Strategy</label>
          <select value={strategy} onChange={(e) => setStrategy(e.target.value as Strategy)} className={inputCls}>
            {(Object.entries(strategyLabels) as [Strategy, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Secrets */}
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
              className={selectCls}
            >
              <option value="" disabled>recent...</option>
              {pastSecrets.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Workdir + Stale (for supervised/monitored) */}
      {strategy !== "fire-and-forget" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-gray-400">Working Directory</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={workdir}
                onChange={(e) => setWorkdir(e.target.value)}
                placeholder="/path/to/workdir (optional)"
                className={`flex-1 ${inputCls}`}
              />
              {pastWorkdirs.length > 0 && (
                <select value="" onChange={(e) => setWorkdir(e.target.value)} className={selectCls}>
                  <option value="" disabled>recent...</option>
                  {pastWorkdirs.map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
              )}
            </div>
          </div>
          {strategy === "monitored" && (
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
          )}
        </div>
      )}

      {/* Advanced: win condition, constraints, report */}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
      >
        {showAdvanced ? "Hide" : "Show"} advanced options
      </button>

      {showAdvanced && (
        <div className="space-y-4 border-t border-gray-800 pt-4">
          {/* Report */}
          <label className="flex items-center gap-2 text-sm text-gray-400">
            <input
              type="checkbox"
              checked={report}
              onChange={(e) => setReport(e.target.checked)}
              className="rounded border-gray-700"
            />
            Generate report
          </label>

          {/* Win condition */}
          <div>
            <label className="mb-1 block text-sm text-gray-400">Win Condition</label>
            <select value={winType} onChange={(e) => setWinType(e.target.value as typeof winType)} className={inputCls}>
              <option value="none">None</option>
              <option value="programmatic">Programmatic (shell command)</option>
              <option value="vibes">Vibes (LLM judge)</option>
            </select>
            {winType === "programmatic" && (
              <div className="mt-2 space-y-2">
                <input
                  type="text"
                  value={winCheck}
                  onChange={(e) => setWinCheck(e.target.value)}
                  placeholder="Shell command — exit 0 = pass"
                  className={`font-mono ${inputCls}`}
                />
                <input
                  type="text"
                  value={winLabel}
                  onChange={(e) => setWinLabel(e.target.value)}
                  placeholder="Label (optional, e.g. 'tests pass')"
                  className={inputCls}
                />
              </div>
            )}
            {winType === "vibes" && (
              <div className="mt-2 space-y-2">
                <textarea
                  rows={2}
                  value={winCriteria}
                  onChange={(e) => setWinCriteria(e.target.value)}
                  placeholder="Describe what success looks like..."
                  className={inputCls}
                />
                <input
                  type="text"
                  value={winLabel}
                  onChange={(e) => setWinLabel(e.target.value)}
                  placeholder="Label (optional)"
                  className={inputCls}
                />
              </div>
            )}
          </div>

          {/* Constraints */}
          <div>
            <label className="mb-1 block text-sm text-gray-400">Constraints (one per line)</label>
            <textarea
              rows={2}
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              placeholder="Don't modify X&#10;Keep under 500 lines"
              className={inputCls}
            />
          </div>
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
        >
          {submitting ? "Launching..." : "Launch"}
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

function displayGoal(run: Run): string {
  return run.spec?.goal ?? ""
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
        {run.preset && (
          <span className="rounded bg-purple-900/30 border border-purple-800 px-1.5 py-0.5 text-[10px] text-purple-400">
            {run.preset}
          </span>
        )}
        {run.winResult && (
          <span className={`text-xs font-medium ${run.winResult.passed ? "text-emerald-400" : "text-orange-400"}`}>
            {run.winResult.passed ? "win" : "win: failed"}
          </span>
        )}
      </div>
      <p className="mb-2 font-mono text-sm text-gray-400">{truncate(displayGoal(run), 80)}</p>
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
        <span>{formatTime(run.startedAt)}</span>
        <span className="text-gray-600">{run.strategy}</span>
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
    const res = await fetch(`/api/parsifal/${type === "report" ? "report" : "log"}?id=${id}`)
    if (res.ok) setContent((await res.json()).content)
  }

  async function refresh() {
    if (!viewing) return
    const res = await fetch(`/api/parsifal/${viewing.type === "report" ? "report" : "log"}?id=${viewing.id}`)
    if (res.ok) setContent((await res.json()).content)
  }

  return { viewing, content, open, refresh, close: () => { setViewing(null); setContent(null) } }
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
