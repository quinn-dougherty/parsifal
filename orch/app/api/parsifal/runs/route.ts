import { Effect } from "effect"
import { respond, NotFound } from "@/lib/respond"
import { sanitizeId, readMeta, writeMeta, enrichRun, listRuns } from "@/lib/parsifal"

export const dynamic = "force-dynamic"

const getOneRun = (id: string) =>
  Effect.gen(function* () {
    const safeId = sanitizeId(id)
    const meta = yield* readMeta(safeId).pipe(
      Effect.mapError(() => new NotFound("Run not found")),
    )
    const { run, dirty } = yield* enrichRun(meta)
    if (dirty) yield* writeMeta(run.id, run).pipe(Effect.catchAll(() => Effect.void))
    return { run }
  })

const getAllRuns = listRuns().pipe(Effect.map((runs) => ({ runs })))

export const GET = (request: Request) => {
  const id = new URL(request.url).searchParams.get("id")
  if (id) return respond(getOneRun(id))
  return respond(getAllRuns)
}
