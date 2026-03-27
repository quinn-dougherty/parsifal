import { Effect } from "effect"
import { respond } from "@/lib/respond"
import { getCpuUsage, getMemory } from "@/lib/proc"

export const dynamic = "force-dynamic"

const getUsage = Effect.gen(function* () {
  const cpuUsage = yield* getCpuUsage()
  const { memory, swap } = getMemory()
  return { cpu: { usagePercent: cpuUsage }, memory, swap }
})

export const GET = () => respond(getUsage)
