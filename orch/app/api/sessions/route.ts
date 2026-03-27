import { Effect } from "effect"
import { respond } from "@/lib/respond"
import { listSessions } from "@/lib/tmux"

export const dynamic = "force-dynamic"

export const GET = () => respond(
  listSessions().pipe(Effect.map((sessions) => ({ sessions }))),
)
