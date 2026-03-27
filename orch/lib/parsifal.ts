import { Effect } from "effect"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  appendFileSync,
} from "fs"
import { join } from "path"
import { homedir } from "os"
import type { RunMeta, LaunchRequest } from "./types"
import { exec, escapeShell, type ShellError } from "./shell"
import { paneStatus } from "./tmux"

// --- Constants ---

const home = process.env.HOME ?? homedir()
export const RUNS_DIR = join(home, ".parsifal", "runs")
export const ORCH_DIR = join(home, "projects", "self", "orch")

// --- Path helpers ---

export const runDir = (id: string) => join(RUNS_DIR, id)
export const metaPath = (id: string) => join(runDir(id), "meta.json")
export const logPath = (id: string) => join(runDir(id), "log.txt")
export const promptPath = (id: string) => join(runDir(id), "prompt.md")
export const reportPath = (id: string) => join(runDir(id), "report.md")

// --- ID sanitization ---

export const sanitizeId = (id: string) => id.replace(/[^a-zA-Z0-9_\-]/g, "")

// --- FS effects ---

export class FsError {
  readonly _tag = "FsError" as const
  constructor(readonly message: string) {}
}

export const ensureDir = (path: string) =>
  Effect.try({
    try: () => { mkdirSync(path, { recursive: true }) },
    catch: () => new FsError(`Failed to create directory: ${path}`),
  })

export const writeFile = (path: string, content: string) =>
  Effect.try({
    try: () => writeFileSync(path, content),
    catch: () => new FsError(`Failed to write: ${path}`),
  })

export const readMeta = (id: string) =>
  Effect.try({
    try: () => JSON.parse(readFileSync(metaPath(id), "utf-8")) as RunMeta,
    catch: () => new FsError(`Failed to read metadata for ${id}`),
  })

export const writeMeta = (id: string, meta: RunMeta) =>
  writeFile(metaPath(id), JSON.stringify(meta, null, 2))

export const appendLog = (id: string, text: string): Effect.Effect<void, never> =>
  Effect.try({
    try: () => {
      const path = logPath(id)
      if (existsSync(path)) appendFileSync(path, text)
    },
    catch: () => new FsError("Failed to append log"),
  }).pipe(Effect.catchAll(() => Effect.void))

// --- Secrets ---

export function loadSecrets(secrets: string[]): Record<string, string> {
  const env: Record<string, string> = {}
  for (const secret of secrets) {
    const parts = secret.split(".")
    if (parts.length !== 2) continue
    const [project, key] = parts
    const secretFile = join(home, ".secrets", project, key)
    if (existsSync(secretFile)) {
      env[key] = readFileSync(secretFile, "utf-8").trim()
    }
  }
  return env
}

// --- Agent commands ---

export function buildAgentCommand(agent: string, promptFile: string, mode: string, hasWorkdir?: boolean): string | null {
  const prompt = `"$(cat ${promptFile})"`
  const interactive = mode === "job" || (mode === "pr" && hasWorkdir)
  switch (agent) {
    case "claude":
      return interactive
        ? `claude --dangerously-skip-permissions ${prompt}`
        : `claude --dangerously-skip-permissions --print ${prompt}`
    case "codex":
      return `codex --full-auto ${prompt}`
    case "gemini":
      return `gemini ${prompt}`
    default:
      return null
  }
}

// --- Workdir resolution ---

export function resolveWorkdir(mode: string, workdir: string | undefined, runId: string): string {
  if (workdir) return workdir.replace(/^~(?=$|\/)/, home)
  return `/tmp/${runId}`
}

// --- Prompt building ---

export function buildPromptContent(req: LaunchRequest, workDir: string, report: string): string {
  const parts = [req.prompt]

  if (req.repo) {
    parts.push(`\nRepo: ${req.repo} — clone it into your working directory to get started.`)
  }
  if (req.mode === "research" || req.mode === "pm") {
    parts.push(`\nWrite your final report/summary to: ${report}`)
  }
  if (req.mode === "job") {
    parts.push(`\nThis is a job run. Your working directory is persistent at: ${workDir}`)
    parts.push(`All output should stay in this directory. Do not create PRs.`)
  } else if (req.mode === "pr" && req.workdir) {
    parts.push(`\nYour working directory is: ${workDir}`)
    parts.push(`Edit the tree directly — do not create branches or commits. The workdir has existing state (gitignored artifacts, data, etc).`)
  } else {
    parts.push(`\nYour working directory is: ${workDir}`)
  }
  parts.push(`You are authenticated to the gh CLI and have git+ssh access.`)

  return parts.join("\n")
}

// --- Launch script building ---

export function writeEnvFile(runId: string, env: Record<string, string>): string | null {
  if (Object.keys(env).length === 0) return null
  const envFile = join(runDir(runId), ".env")
  const content = Object.entries(env)
    .map(([k, v]) => `export ${k}='${escapeShell(v)}'`)
    .join("\n")
  writeFileSync(envFile, content, { mode: 0o600 })
  return envFile
}

export function buildLaunchScript(
  workDir: string,
  envFile: string | null,
  agentCmd: string,
  logFile: string,
): string {
  const parts = [`cd ${workDir}`]
  if (envFile) parts.push(`. ${envFile}`)
  parts.push(`echo "=== AGENT STARTED $(date -Iseconds) ==="`)
  parts.push(agentCmd)
  const script = parts.join("; ")
  return `(${script}) 2>&1 | tee ${logFile}`
}

// --- Run status helpers ---

export function checkStale(run: RunMeta): { stale: boolean; lastActivity: string | null } {
  if (!run.watchdog || !run.log) return { stale: false, lastActivity: null }
  try {
    const mtime = statSync(run.log).mtimeMs
    const thresholdMs = run.watchdog.staleAfterMin * 60 * 1000
    return {
      stale: Date.now() - mtime > thresholdMs,
      lastActivity: new Date(mtime).toISOString(),
    }
  } catch {
    return { stale: false, lastActivity: null }
  }
}

export const checkForPR = (id: string, workdir?: string | null): Effect.Effect<
  { number: number; url: string; state: string } | null,
  never
> =>
  Effect.gen(function* () {
    const dir = workdir || `/tmp/${id}`
    if (!existsSync(dir)) return null
    const result = yield* exec(
      `cd ${dir} && gh pr list --head parsifal/${id} --json number,url,state --limit 1`,
      { timeout: 10000 },
    )
    const prs = JSON.parse(result)
    return Array.isArray(prs) && prs.length > 0 ? prs[0] : null
  }).pipe(Effect.catchAll(() => Effect.succeed(null)))

// --- Run enrichment (status checks, PR detection) ---

export const enrichRun = (run: RunMeta): Effect.Effect<{ run: RunMeta; dirty: boolean }, never> =>
  Effect.gen(function* () {
    let dirty = false

    if (run.status === "running") {
      const pane = yield* paneStatus(run.id)
      if (!pane.alive) {
        // null exitCode means session is gone entirely (e.g. killed by deploy restart)
        // — assume completed since we have no evidence of failure
        run.status = pane.exitCode === null || pane.exitCode === 0 ? "completed" : "failed"
        run.exitCode = pane.exitCode
        dirty = true
      } else {
        const { stale, lastActivity } = checkStale(run)
        run.stale = stale
        run.lastActivity = lastActivity
      }

      if (run.mode === "pr") {
        const pr = yield* checkForPR(run.id, run.workdir)
        if (pr) {
          run.pr = pr
          dirty = true
        }
      }
    }

    if (run.report) run.hasReport = existsSync(run.report)
    if (run.log) run.hasLog = existsSync(run.log)

    return { run, dirty }
  })

// --- List all runs ---

export const listRuns = (): Effect.Effect<RunMeta[], never> =>
  Effect.gen(function* () {
    if (!existsSync(RUNS_DIR)) return []

    const entries = readdirSync(RUNS_DIR, { withFileTypes: true })
    const runs: RunMeta[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const meta = yield* readMeta(entry.name).pipe(Effect.catchAll(() => Effect.succeed(null)))
      if (!meta) continue

      const { run, dirty } = yield* enrichRun(meta)
      if (dirty) yield* writeMeta(run.id, run).pipe(Effect.catchAll(() => Effect.void))
      runs.push(run)
    }

    runs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    return runs
  })
