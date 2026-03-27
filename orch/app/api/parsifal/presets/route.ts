import { Effect } from "effect"
import { respond } from "@/lib/respond"
import { loadPresets } from "@/lib/parsifal"

export const dynamic = "force-dynamic"

export const GET = () => respond(
  Effect.sync(() => ({ presets: loadPresets() })),
)
