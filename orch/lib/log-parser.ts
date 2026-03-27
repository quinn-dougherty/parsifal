export type SegmentType =
  | "agent"       // agent text output
  | "system"      // === AGENT STARTED / RESET / DEPLOY ===
  | "user-send"   // ⟫ SEND
  | "user-nudge"  // ⟫ NUDGE
  | "user-interrupt" // ⟫ INTERRUPT
  | "code"        // fenced code blocks within agent output

export interface LogSegment {
  type: SegmentType
  content: string
  timestamp?: string
}

const SYSTEM_RE = /^=== (.+?) ===$/
const USER_SEND_RE = /^⟫ SEND \[(.+?)\]: (.+)$/
const USER_NUDGE_RE = /^⟫ NUDGE \[(.+?)\]: (.+)$/
const USER_INTERRUPT_RE = /^⟫ INTERRUPT \[(.+?)\](?:: (.+))?$/

export function parseLog(raw: string): LogSegment[] {
  if (!raw) return []

  const segments: LogSegment[] = []
  const lines = raw.split("\n")
  let buf: string[] = []
  let currentType: SegmentType = "agent"
  let inCodeBlock = false

  function flush() {
    const text = buf.join("\n")
    if (text.trim()) {
      segments.push({ type: currentType, content: text })
    }
    buf = []
  }

  for (const line of lines) {
    // Check for code block boundaries within agent output
    if (line.startsWith("```") && currentType === "agent") {
      if (!inCodeBlock) {
        // Flush any agent text before the code block
        flush()
        inCodeBlock = true
        currentType = "code"
        buf.push(line)
        continue
      } else {
        // End of code block
        buf.push(line)
        flush()
        inCodeBlock = false
        currentType = "agent"
        continue
      }
    }

    if (inCodeBlock) {
      buf.push(line)
      continue
    }

    // System markers
    const systemMatch = line.match(SYSTEM_RE)
    if (systemMatch) {
      flush()
      currentType = "agent"
      segments.push({ type: "system", content: systemMatch[1] })
      continue
    }

    // User signals
    const sendMatch = line.match(USER_SEND_RE)
    if (sendMatch) {
      flush()
      currentType = "agent"
      segments.push({ type: "user-send", content: sendMatch[2], timestamp: sendMatch[1] })
      continue
    }

    const nudgeMatch = line.match(USER_NUDGE_RE)
    if (nudgeMatch) {
      flush()
      currentType = "agent"
      segments.push({ type: "user-nudge", content: nudgeMatch[2], timestamp: nudgeMatch[1] })
      continue
    }

    const interruptMatch = line.match(USER_INTERRUPT_RE)
    if (interruptMatch) {
      flush()
      currentType = "agent"
      segments.push({
        type: "user-interrupt",
        content: interruptMatch[2] || "",
        timestamp: interruptMatch[1],
      })
      continue
    }

    // Default: agent output
    currentType = "agent"
    buf.push(line)
  }

  // Flush remaining
  if (inCodeBlock) currentType = "code"
  flush()

  return segments
}
