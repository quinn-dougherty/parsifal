import { Effect } from "effect"
import { respond, BadRequest, Internal } from "@/lib/respond"
import {
  resolveWorkdir,
  loadSecrets,
  loadPreset,
  buildAgentCommand,
  buildPrompt,
  buildLaunchScript,
  writeEnvFile,
  projectName,
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

const mergePreset = (body: LaunchRequest): LaunchRequest => {
  if (!body.preset) return body
  const preset = loadPreset(body.preset)
  if (!preset) return body
  return {
    ...body,
    strategy: body.strategy ?? preset.strategy,
    agent: body.agent ?? preset.agent,
    workdir: body.workdir ?? preset.workdir,
    secrets: body.secrets?.length ? body.secrets : preset.secrets,
    watchdog: body.watchdog ?? preset.watchdog,
    spec: {
      ...body.spec,
      report: body.spec.report ?? preset.report,
      constraints: body.spec.constraints?.length ? body.spec.constraints : preset.constraints,
    },
  }
}

const launch = (raw: LaunchRequest) =>
  Effect.gen(function* () {
    const body = mergePreset(raw)
    const runId = `${projectName(body)}-${Date.now()}`
    const workDir = resolveWorkdir(body.workdir, runId)
    yield* ensureDir(workDir).pipe(Effect.mapError((e) => new Internal(e.message)))

    const env = loadSecrets(body.secrets ?? [])

    yield* ensureDir(runDir(runId)).pipe(Effect.mapError((e) => new Internal(e.message)))

    const meta: RunMeta = {
      id: runId,
      spec: body.spec,
      strategy: body.strategy,
      agent: body.agent,
      status: "running",
      startedAt: new Date().toISOString(),
      pr: null,
      report: body.spec.report ? reportPath(runId) : null,
      log: logPath(runId),
      secrets: body.secrets?.length ? body.secrets : null,
      workdir: body.workdir ? workDir : null,
      watchdog: body.strategy === "monitored" ? (body.watchdog ?? { staleAfterMin: 10 }) : null,
      win: body.spec.win ?? null,
      winResult: null,
      preset: body.preset ?? null,
    }
    yield* writeMeta(runId, meta).pipe(Effect.mapError((e) => new Internal(e.message)))

    const promptContent = buildPrompt(body, workDir, reportPath(runId))
    yield* writeFile(promptPath(runId), promptContent).pipe(
      Effect.mapError((e) => new Internal(e.message)),
    )

    const agentCmd = buildAgentCommand(body.agent, promptPath(runId), body.strategy)
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
