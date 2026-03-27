import { Effect } from "effect"
import { respond, BadRequest, Internal } from "@/lib/respond"
import {
  resolveWorkdir,
  loadSecrets,
  buildAgentCommand,
  buildPromptContent,
  buildLaunchScript,
  writeEnvFile,
  ensureDir,
  writeFile,
  writeMeta,
  runDir,
  logPath,
  promptPath,
  reportPath,
} from "@/lib/parsifal"
import { launchInSession } from "@/lib/tmux"
import type { LaunchRequest, RunMeta } from "@/lib/types"

const projectName = (req: LaunchRequest): string => {
  if (req.workdir) {
    const normalized = req.workdir.replace(/\/+$/, "")
    const last = normalized.split("/").pop()
    if (last && last !== "~") return last
  }
  if (req.repo) {
    const last = req.repo.split("/").pop()?.replace(/\.git$/, "")
    if (last) return last
  }
  return "run"
}

const launch = (body: LaunchRequest) =>
  Effect.gen(function* () {
    const runId = `${projectName(body)}-${Date.now()}`
    const workDir = resolveWorkdir(body.mode, body.workdir, runId)
    yield* ensureDir(workDir).pipe(Effect.mapError((e) => new Internal(e.message)))

    const env = loadSecrets(body.secrets)

    yield* ensureDir(runDir(runId)).pipe(Effect.mapError((e) => new Internal(e.message)))

    const meta: RunMeta = {
      id: runId,
      prompt: body.prompt,
      repo: body.repo ?? null,
      agent: body.agent,
      mode: body.mode,
      status: "running",
      startedAt: new Date().toISOString(),
      pr: null,
      report: body.mode !== "pr" && body.mode !== "job" ? reportPath(runId) : null,
      log: logPath(runId),
      secrets: body.secrets.length > 0 ? body.secrets : null,
      workdir: body.workdir ? workDir : null,
      watchdog: body.watchdog ?? null,
    }
    yield* writeMeta(runId, meta).pipe(Effect.mapError((e) => new Internal(e.message)))

    const promptContent = buildPromptContent(body, workDir, reportPath(runId))
    yield* writeFile(promptPath(runId), promptContent).pipe(
      Effect.mapError((e) => new Internal(e.message)),
    )

    const agentCmd = buildAgentCommand(body.agent, promptPath(runId), body.mode, !!body.workdir)
    if (!agentCmd) return yield* Effect.fail(new BadRequest(`Unknown agent: ${body.agent}`))

    const envFile = writeEnvFile(runId, env)
    const script = buildLaunchScript(workDir, envFile, agentCmd, logPath(runId))
    yield* launchInSession(runId, script).pipe(
      Effect.mapError((e) => new Internal(e.message)),
    )

    return { runId, status: "running" }
  })

export const POST = async (request: Request) =>
  respond(
    Effect.tryPromise({
      try: () => request.json() as Promise<LaunchRequest>,
      catch: () => new BadRequest("Invalid request body"),
    }).pipe(Effect.flatMap(launch)),
  )
