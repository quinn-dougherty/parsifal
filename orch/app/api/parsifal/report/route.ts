import { Effect } from "effect"
import { existsSync, readFileSync } from "fs"
import { respond, BadRequest, NotFound } from "@/lib/respond"
import { sanitizeId, reportPath } from "@/lib/parsifal"

export const dynamic = "force-dynamic"

const getReport = (id: string) =>
  Effect.gen(function* () {
    const path = reportPath(sanitizeId(id))
    if (!existsSync(path)) return yield* Effect.fail(new NotFound("Report not found"))
    return { content: readFileSync(path, "utf-8") }
  })

export const GET = (request: Request) => {
  const id = new URL(request.url).searchParams.get("id")
  return respond(id ? getReport(id) : Effect.fail(new BadRequest("Missing id")))
}
