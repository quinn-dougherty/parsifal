// --- Execution strategy ---

export type Strategy = "fire-and-forget" | "supervised" | "monitored"

// --- Win conditions ---

export interface ProgrammaticWin {
  type: "programmatic"
  check: string
  label?: string
}

export interface VibesWin {
  type: "vibes"
  criteria: string
  label?: string
}

export type WinCondition = ProgrammaticWin | VibesWin

export interface WinResult {
  passed: boolean
  checkedAt: string
  detail?: string
}

// --- Structured spec ---

export interface Spec {
  goal: string
  win?: WinCondition
  constraints?: string[]
  repo?: string
  report?: boolean
}

// --- Watchdog ---

export interface WatchdogConfig {
  staleAfterMin: number
}

// --- Preset (stored at ~/.parsifal/presets/{name}.json) ---

export interface Preset {
  name: string
  description?: string
  strategy: Strategy
  agent: string
  workdir?: string
  secrets?: string[]
  watchdog?: WatchdogConfig
  report?: boolean
  constraints?: string[]
}

// --- Launch request ---

export interface LaunchRequest {
  spec: Spec
  strategy: Strategy
  agent: string
  workdir?: string
  secrets?: string[]
  watchdog?: WatchdogConfig
  preset?: string
}

// --- Control request ---

export interface ControlRequest {
  id: string
  action: "nudge" | "reset" | "interrupt" | "send" | "deploy"
  message?: string
}

// --- Run metadata (persisted to disk) ---

export interface RunMeta {
  id: string
  spec: Spec
  strategy: Strategy
  agent: string
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
  exitCode?: number | null
  win?: WinCondition | null
  winResult?: WinResult | null
  preset?: string | null
}

// --- Run (client-side subset) ---

export interface Run {
  id: string
  spec: Spec
  strategy: Strategy
  agent: string
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
  win?: WinCondition | null
  winResult?: WinResult | null
  preset?: string | null
}

// --- System types ---

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

// --- UI constants ---

export const statusColors: Record<string, string> = {
  running: "text-green-400",
  completed: "text-gray-400",
  succeeded: "text-emerald-400",
  failed: "text-red-400",
  error: "text-red-400",
  stuck: "text-yellow-400",
}

export const strategyLabels: Record<Strategy, string> = {
  "fire-and-forget": "Fire & Forget",
  supervised: "Supervised",
  monitored: "Monitored",
}
