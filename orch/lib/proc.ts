import { Effect } from "effect"
import { readFileSync } from "fs"
import { exec } from "./shell"
import type { MemInfo } from "./types"

const parseCpuFromTop = (output: string): number => {
  const m = output.match(/([\d.]+)\s*id/)
  return m ? Math.round((100 - parseFloat(m[1])) * 10) / 10 : 0
}

export const getCpuUsage = (): Effect.Effect<number, never> =>
  exec("top -bn1 | grep 'Cpu(s)'").pipe(
    Effect.map(parseCpuFromTop),
    Effect.catchAll(() => Effect.succeed(0)),
  )

const parseMemField = (raw: string, key: string): number => {
  const m = raw.match(new RegExp(`${key}:\\s+(\\d+)`))
  return m ? parseInt(m[1], 10) : 0
}

const kbToMB = (kb: number) => Math.round(kb / 1024)

const pct = (used: number, total: number) =>
  total > 0 ? Math.round((used / total) * 1000) / 10 : 0

export function getMemory(): { memory: MemInfo; swap: MemInfo } {
  const raw = readFileSync("/proc/meminfo", "utf-8")
  const get = (key: string) => parseMemField(raw, key)

  const memTotal = kbToMB(get("MemTotal"))
  const memUsed = kbToMB(get("MemTotal") - get("MemAvailable"))
  const swapTotal = kbToMB(get("SwapTotal"))
  const swapUsed = kbToMB(get("SwapTotal") - get("SwapFree"))

  return {
    memory: { totalMB: memTotal, usedMB: memUsed, usagePercent: pct(memUsed, memTotal) },
    swap: { totalMB: swapTotal, usedMB: swapUsed, usagePercent: pct(swapUsed, swapTotal) },
  }
}
