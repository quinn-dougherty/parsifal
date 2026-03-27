export interface WatchdogConfig {
  staleAfterMin: number
}

export interface RunMeta {
  id: string
  prompt: string
  repo?: string | null
  agent: string
  mode: "pr" | "research" | "pm" | "job"
  status: string
  startedAt: string
  pr?: { number: number; url: string; state: string } | null
  report?: string | null
  hasReport?: boolean
  log?: string | null
  hasLog?: boolean
  secrets?: string[] | null
  workdir?: string | null
  watchdog?: WatchdogConfig | null
  stale?: boolean
  lastActivity?: string | null
  resetCount?: number
  resetAt?: string
}

export interface TmuxSession {
  name: string
  windows: number
  attached: boolean
  created: number
}

export interface MemInfo {
  totalMB: number
  usedMB: number
  usagePercent: number
}

export interface UsageData {
  cpu: { usagePercent: number }
  memory: MemInfo
  swap: MemInfo
}

export interface LaunchRequest {
  prompt: string
  repo?: string
  secrets: string[]
  agent: string
  mode: "pr" | "research" | "pm" | "job"
  workdir?: string
  watchdog?: WatchdogConfig
}

export interface ControlRequest {
  id: string
  action: "nudge" | "reset" | "interrupt" | "send" | "deploy"
  message?: string
}

export interface Run {
  id: string
  agent: string
  prompt: string
  repo?: string | null
  mode: "pr" | "research" | "pm" | "job"
  status: string
  pr?: { number: number; url: string; state: string } | null
  hasReport?: boolean
  hasLog?: boolean
  startedAt: string
  secrets?: string[] | null
  stale?: boolean
  workdir?: string | null
  lastActivity?: string | null
  resetCount?: number
}

export const statusColors: Record<string, string> = {
  running: "text-green-400",
  completed: "text-gray-400",
  error: "text-red-400",
  stuck: "text-yellow-400",
}
