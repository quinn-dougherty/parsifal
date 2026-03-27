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
import type { RunMeta, LaunchRequest, Spec, Strategy, Preset, WinResult } from "./types"
import { exec, escapeShell, type ShellError } from "./shell"
import { paneStatus } from "./tmux"

// --- Constants ---

const home = process.env.HOME ?? homedir()
export const RUNS_DIR = join(home, ".parsifal", "runs")
export const ORCH_DIR = join(home, "projects", "self", "orch")
export const PRESETS_DIR = join(home, ".parsifal", "presets")

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

export const appendLog = (id: string, text: string): Effect.Effect<void, never> =>
  Effect.try({
    try: () => {
      const path = logPath(id)
      if (existsSync(path)) appendFileSync(path, text)
    },
    catch: () => new FsError("Failed to append log"),
  }).pipe(Effect.catchAll(() => Effect.void))

// --- Legacy migration ---

function migrateLegacyMeta(raw: Record<string, unknown>): RunMeta {
  if (raw.mode && !raw.spec) {
    const mode = raw.mode as string
    const prompt = (raw.prompt as string) ?? ""
    return {
      ...raw,
      spec: {
        goal: prompt,
        repo: (raw.repo as string) ?? undefined,
        report: mode === "research" || mode === "pm",
      },
      strategy: (mode === "job" || (mode === "pr" && raw.workdir))
        ? "supervised" as Strategy
        : "fire-and-forget" as Strategy,
      win: null,
      winResult: null,
      preset: null,
    } as unknown as RunMeta
  }
  return raw as unknown as RunMeta
}

// --- Metadata read/write ---

export const readMeta = (id: string) =>
  Effect.try({
    try: () => {
      const raw = JSON.parse(readFileSync(metaPath(id), "utf-8"))
      return migrateLegacyMeta(raw)
    },
    catch: () => new FsError(`Failed to read metadata for ${id}`),
  })

export const writeMeta = (id: string, meta: RunMeta) =>
  writeFile(metaPath(id), JSON.stringify(meta, null, 2))

// --- Presets ---

export function loadPresets(): Preset[] {
  if (!existsSync(PRESETS_DIR)) return []
  return readdirSync(PRESETS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try { return JSON.parse(readFileSync(join(PRESETS_DIR, f), "utf-8")) as Preset }
      catch { return null }
    })
    .filter((p): p is Preset => p !== null)
}

export function loadPreset(name: string): Preset | null {
  const path = join(PRESETS_DIR, `${sanitizeId(name)}.json`)
  if (!existsSync(path)) return null
  try { return JSON.parse(readFileSync(path, "utf-8")) as Preset }
  catch { return null }
}

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

export function buildAgentCommand(agent: string, promptFile: string, strategy: Strategy): string | null {
  const prompt = `"$(cat ${promptFile})"`
  const interactive = strategy !== "fire-and-forget"
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

export function resolveWorkdir(workdir: string | undefined, runId: string): string {
  if (workdir) return workdir.replace(/^~(?=$|\/)/, home)
  return `/tmp/${runId}`
}

// --- Prompt building ---

export function buildPrompt(req: LaunchRequest, workDir: string, reportFile: string): string {
  const parts: string[] = [req.spec.goal]

  if (req.spec.repo) {
    parts.push(`\nRepo: ${req.spec.repo} — clone it into your working directory to get started.`)
  }

  parts.push(`\nYour working directory is: ${workDir}`)
  if (req.workdir) {
    parts.push(`This is a persistent directory. Edit the tree directly.`)
  }

  if (req.spec.report) {
    parts.push(`\nWrite your final report/summary to: ${reportFile}`)
  }

  if (req.spec.win) {
    if (req.spec.win.type === "programmatic") {
      const label = req.spec.win.label ? ` (${req.spec.win.label})` : ""
      parts.push(`\nSuccess criterion: \`${req.spec.win.check}\` must exit 0.${label}`)
    } else {
      parts.push(`\nSuccess will be judged by: ${req.spec.win.criteria}`)
    }
  }

  if (req.spec.constraints?.length) {
    parts.push(`\nConstraints:`)
    for (const c of req.spec.constraints) parts.push(`- ${c}`)
  }

  parts.push(`\nYou are authenticated to the gh CLI and have git+ssh access.`)

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

// --- Project name extraction (for run IDs) ---

export function projectName(req: LaunchRequest): string {
  if (req.workdir) {
    const normalized = req.workdir.replace(/\/+$/, "")
    const last = normalized.split("/").pop()
    if (last && last !== "~") return last
  }
  if (req.spec.repo) {
    const last = req.spec.repo.split("/").pop()?.replace(/\.git$/, "")
    if (last) return last
  }
  return "run"
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

// --- Win condition evaluation ---

export const checkProgrammaticWin = (
  check: string,
  workdir: string,
): Effect.Effect<WinResult, never> =>
  exec(check, { timeout: 30000, cwd: workdir }).pipe(
    Effect.map((stdout) => ({
      passed: true,
      checkedAt: new Date().toISOString(),
      detail: stdout.trim().slice(0, 500),
    })),
    Effect.catchAll(() =>
      Effect.succeed({
        passed: false,
        checkedAt: new Date().toISOString(),
        detail: "Check command exited non-zero",
      }),
    ),
  )

export const checkVibesWin = (
  id: string,
  criteria: string,
  workdir: string,
): Effect.Effect<WinResult, never> =>
  Effect.gen(function* () {
    const logContent = existsSync(logPath(id))
      ? readFileSync(logPath(id), "utf-8").slice(-10000)
      : "(no log available)"

    const judgePrompt = [
      "You are judging whether an agent run succeeded.",
      "",
      `Criteria: ${criteria}`,
      "",
      "Here is the tail of the agent's log:",
      "---",
      logContent,
      "---",
      "",
      'Respond with a JSON object: { "passed": true/false, "reason": "..." }',
      "Output ONLY the JSON, nothing else.",
    ].join("\n")

    const result = yield* exec(
      `echo '${escapeShell(judgePrompt)}' | claude --dangerously-skip-permissions --print -`,
      { timeout: 60000, cwd: workdir },
    ).pipe(Effect.catchAll(() => Effect.succeed('{"passed": false, "reason": "judge failed to run"}')))

    try {
      const parsed = JSON.parse(result.trim())
      return {
        passed: !!parsed.passed,
        checkedAt: new Date().toISOString(),
        detail: parsed.reason || "",
      }
    } catch {
      return {
        passed: false,
        checkedAt: new Date().toISOString(),
        detail: `Judge output unparseable: ${result.slice(0, 200)}`,
      }
    }
  })

// --- Run enrichment (status checks, PR detection, win conditions) ---

export const enrichRun = (run: RunMeta): Effect.Effect<{ run: RunMeta; dirty: boolean }, never> =>
  Effect.gen(function* () {
    let dirty = false

    if (run.status === "running") {
      const pane = yield* paneStatus(run.id)
      if (!pane.alive) {
        const baseStatus = pane.exitCode === null || pane.exitCode === 0 ? "completed" : "failed"
        run.exitCode = pane.exitCode
        run.status = baseStatus

        // Check win condition on clean exit
        if (baseStatus === "completed" && run.win) {
          const workdir = run.workdir || `/tmp/${run.id}`
          const result = run.win.type === "programmatic"
            ? yield* checkProgrammaticWin(run.win.check, workdir)
            : yield* checkVibesWin(run.id, run.win.criteria, workdir)
          run.winResult = result
          if (result.passed) run.status = "succeeded"
        }

        dirty = true
      } else {
        const { stale, lastActivity } = checkStale(run)
        run.stale = stale
        run.lastActivity = lastActivity
      }

      // PR detection for runs with repos
      if (run.spec?.repo) {
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
