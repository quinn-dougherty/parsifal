import { Effect } from "effect"
import { respond } from "@/lib/respond"
import { exec } from "@/lib/shell"

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "")

const getInfo = exec("fastfetch --logo none", { timeout: 5000 }).pipe(
  Effect.map((raw) => ({ output: stripAnsi(raw) })),
  Effect.catchAll(() => Effect.succeed({ output: "fastfetch is not installed or failed to run." })),
)

export const GET = () => respond(getInfo)
