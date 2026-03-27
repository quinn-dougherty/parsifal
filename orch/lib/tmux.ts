import { Effect } from "effect"
import { execSync } from "child_process"
import { exec, execFireAndForget, escapeShell } from "./shell"
import type { TmuxSession } from "./types"
import { homedir } from "os"
import { join } from "path"

const home = process.env.HOME ?? homedir()
const SOCKET_PATH = join(home, ".parsifal", "tmux.sock")
const tmux = (args: string) => `tmux -S ${SOCKET_PATH} ${args}`

export const sessionExists = (id: string): Effect.Effect<boolean, never> =>
  exec(tmux(`has-session -t ${id}`)).pipe(
    Effect.as(true),
    Effect.catchAll(() => Effect.succeed(false)),
  )

export const paneAlive = (id: string): Effect.Effect<boolean, never> =>
  exec(tmux(`list-panes -t ${id} -F '#{pane_dead}'`)).pipe(
    Effect.map((out) => out.trim() === "0"),
    Effect.catchAll(() => Effect.succeed(false)),
  )

export interface PaneStatus {
  alive: boolean
  exitCode: number | null
}

export const paneStatus = (id: string): Effect.Effect<PaneStatus, never> =>
  exec(tmux(`list-panes -t ${id} -F '#{pane_dead}|#{pane_dead_status}'`)).pipe(
    Effect.map((out) => {
      const [dead, code] = out.trim().split("|")
      if (dead === "0") return { alive: true, exitCode: null }
      const parsed = parseInt(code, 10)
      return { alive: false, exitCode: isNaN(parsed) ? null : parsed }
    }),
    Effect.catchAll(() =>
      // tmux unreachable — fall back to process-based detection
      exec(`pgrep -f "tmux.*-S ${SOCKET_PATH}.*${id}"`, { timeout: 5000 }).pipe(
        Effect.map(() => ({ alive: true, exitCode: null } as PaneStatus)),
        Effect.catchAll(() => Effect.succeed({ alive: false, exitCode: null } as PaneStatus)),
      )
    ),
  )

export const sendKeys = (id: string, keys: string) =>
  exec(tmux(`send-keys -t ${id} ${keys}`))

export const sendText = (id: string, text: string) =>
  sendKeys(id, `'${escapeShell(text)}' Enter`)

export const sendKeysDelayed = (id: string, keys: string, delayMs: number) =>
  Effect.sync(() => {
    setTimeout(() => {
      try { execSync(tmux(`send-keys -t ${id} ${keys}`), { stdio: "pipe" }) } catch { /* session may be dead */ }
    }, delayMs)
  })

export const newSession = (id: string) =>
  exec(tmux(`new-session -d -s ${id}`)).pipe(
    Effect.flatMap(() => exec(tmux(`set-option -t ${id} remain-on-exit on`))),
  )

export const killSession = (id: string): Effect.Effect<void, never> =>
  exec(tmux(`kill-session -t ${id}`)).pipe(
    Effect.asVoid,
    Effect.catchAll(() => Effect.void),
  )

export const launchInSession = (id: string, script: string) =>
  newSession(id).pipe(
    Effect.flatMap(() =>
      execFireAndForget(tmux(`send-keys -t ${id} '${escapeShell(script)}' Enter`)),
    ),
  )

export const listSessions = (): Effect.Effect<TmuxSession[], never> =>
  exec(
    tmux(`list-sessions -F '#{session_name}|#{session_windows}|#{session_attached}|#{session_created}'`),
  ).pipe(
    Effect.map((raw) =>
      raw.trim().split("\n").filter(Boolean).map(parseTmuxLine),
    ),
    Effect.catchAll(() => Effect.succeed([] as TmuxSession[])),
  )

function parseTmuxLine(line: string): TmuxSession {
  const [name, windows, attached, created] = line.split("|")
  return {
    name,
    windows: parseInt(windows, 10),
    attached: attached === "1",
    created: parseInt(created, 10),
  }
}
