import { Effect } from "effect"
import { existsSync, readFileSync } from "fs"
import { respond, BadRequest, NotFound } from "@/lib/respond"
import { sanitizeId, logPath } from "@/lib/parsifal"

export const dynamic = "force-dynamic"

const getLog = (id: string) =>
  Effect.gen(function* () {
    const path = logPath(sanitizeId(id))
    if (!existsSync(path)) return yield* Effect.fail(new NotFound("Log not found"))
    return { content: readFileSync(path, "utf-8") }
  })

export const GET = (request: Request) => {
  const id = new URL(request.url).searchParams.get("id")
  return respond(id ? getLog(id) : Effect.fail(new BadRequest("id is required")))
}
