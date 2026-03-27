import { Effect } from "effect"
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import { respond, NotFound, BadRequest, Conflict, Internal } from "@/lib/respond"
import {
  sanitizeId,
  readMeta,
  writeMeta,
  appendLog,
  buildAgentCommand,
  promptPath,
  logPath,
  ORCH_DIR,
} from "@/lib/parsifal"
import { sessionExists, sendText, sendKeys, killSession, launchInSession, sendKeysDelayed } from "@/lib/tmux"
import { escapeShell, exec, execFireAndForget } from "@/lib/shell"
import type { ControlRequest, RunMeta } from "@/lib/types"

// --- Shared guards ---

const requireSession = (id: string) =>
  sessionExists(id).pipe(
    Effect.flatMap((alive) =>
      alive ? Effect.void : Effect.fail(new Conflict("Session not running")),
    ),
  )

// --- Action handlers ---

const handleSend = (id: string, message?: string) =>
  Effect.gen(function* () {
    if (!message) return yield* Effect.fail(new BadRequest("message required for send action"))
    yield* requireSession(id)
    yield* appendLog(id, `\n⟫ SEND [${new Date().toISOString()}]: ${message}\n`)
    yield* sendText(id, message).pipe(Effect.mapError((e) => new Internal(e.message)))
    return { ok: true, action: "send" as const }
  })

const handleNudge = (id: string, message?: string) =>
  Effect.gen(function* () {
    yield* requireSession(id)
    const text = message || "continue"
    yield* appendLog(id, `\n⟫ NUDGE [${new Date().toISOString()}]: ${text}\n`)
    yield* sendText(id, text).pipe(
      Effect.mapError((e) => new Internal(e.message)),
    )
    return { ok: true, action: "nudge" as const }
  })

const handleInterrupt = (id: string, message?: string) =>
  Effect.gen(function* () {
    yield* requireSession(id)
    yield* appendLog(id, `\n⟫ INTERRUPT [${new Date().toISOString()}]${message ? `: ${message}` : ""}\n`)
    yield* sendKeys(id, "C-c").pipe(Effect.mapError((e) => new Internal(e.message)))
    if (message) {
      yield* sendKeysDelayed(id, `'${escapeShell(message)}' Enter`, 500)
    }
    return { ok: true, action: "interrupt" as const }
  })

const handleReset = (id: string, meta: RunMeta, message?: string) =>
  Effect.gen(function* () {
    yield* killSession(id)

    const prompt = promptPath(id)
    if (!existsSync(prompt)) {
      return yield* Effect.fail(new Internal("Prompt file missing, cannot reset"))
    }

    if (message) {
      const existing = readFileSync(prompt, "utf-8")
      writeFileSync(prompt, existing + `\n\n---\n\n**Reset note:** ${message}`)
    }

    const workDir = meta.workdir || `/tmp/${id}`
    mkdirSync(workDir, { recursive: true })

    const agentCmd = buildAgentCommand(meta.agent, prompt, meta.mode)
    if (!agentCmd) return yield* Effect.fail(new Internal(`Unknown agent: ${meta.agent}`))

    meta.status = "running"
    meta.resetAt = new Date().toISOString()
    meta.resetCount = (meta.resetCount || 0) + 1
    yield* writeMeta(id, meta).pipe(Effect.mapError((e) => new Internal(e.message)))

    yield* appendLog(id, `\n\n=== RESET #${meta.resetCount} at ${meta.resetAt} ===\n\n`)

    const script = `(cd ${workDir}; ${agentCmd}) 2>&1 | tee -a ${logPath(id)}`
    yield* launchInSession(id, script).pipe(
      Effect.mapError((e) => new Internal(e.message)),
    )

    return { ok: true, action: "reset" as const, resetCount: meta.resetCount }
  })

const handleDeploy = (id: string) =>
  Effect.gen(function* () {
    const deployStart = new Date().toISOString()
    yield* appendLog(id, `\n\n=== DEPLOY started at ${deployStart} ===\n`)

    const buildOutput = yield* exec(`cd ${ORCH_DIR} && bun run build 2>&1`, { timeout: 120000 }).pipe(
      Effect.mapError((e) => new Internal(`Build failed: ${e.message}`)),
    )

    yield* appendLog(
      id,
      `Build output:\n${buildOutput}\n=== DEPLOY completed at ${new Date().toISOString()} — restarting service ===\n`,
    )

    // Fire-and-forget: the restart kills this process, so we must send the
    // response before it happens.  A small delay lets the HTTP response flush.
    yield* execFireAndForget(
      "sleep 1 && /run/wrappers/bin/sudo /run/current-system/sw/bin/systemctl restart parsifal-ui",
    )

    return { ok: true, action: "deploy" as const }
  }).pipe(
    Effect.catchTag("Internal", (err) =>
      appendLog(id, `\n=== DEPLOY FAILED: ${err.message} ===\n`).pipe(
        Effect.flatMap(() => Effect.fail(err)),
      ),
    ),
  )

// --- Router ---

const control = (body: ControlRequest) =>
  Effect.gen(function* () {
    const safeId = sanitizeId(body.id)
    const meta = yield* readMeta(safeId).pipe(
      Effect.mapError(() => new NotFound("Run not found")),
    )

    switch (body.action) {
      case "send": return yield* handleSend(safeId, body.message)
      case "nudge": return yield* handleNudge(safeId, body.message)
      case "interrupt": return yield* handleInterrupt(safeId, body.message)
      case "reset": return yield* handleReset(safeId, meta, body.message)
      case "deploy": return yield* handleDeploy(safeId)
      default: return yield* Effect.fail(new BadRequest(`Unknown action: ${body.action}`))
    }
  })

export const POST = async (request: Request) =>
  respond(
    Effect.tryPromise({
      try: () => request.json() as Promise<ControlRequest>,
      catch: () => new BadRequest("Invalid request body"),
    }).pipe(Effect.flatMap(control)),
  )
