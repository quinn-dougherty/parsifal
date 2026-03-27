import { Effect } from "effect"
import { execSync, exec as execCb } from "child_process"

export class ShellError {
  readonly _tag = "ShellError" as const
  readonly message: string
  constructor(command: string, cause: unknown) {
    this.message = cause instanceof Error ? cause.message : `Command failed: ${command}`
  }
}

export const exec = (cmd: string, opts?: { timeout?: number; cwd?: string }) =>
  Effect.try({
    try: () =>
      execSync(cmd, {
        encoding: "utf-8",
        stdio: "pipe",
        timeout: opts?.timeout ?? 5000,
        cwd: opts?.cwd,
      }),
    catch: (e) => new ShellError(cmd, e),
  })

export const execFireAndForget = (cmd: string) =>
  Effect.sync(() => { execCb(cmd, () => {}) })

export const escapeShell = (s: string) => s.replace(/'/g, "'\\''")
