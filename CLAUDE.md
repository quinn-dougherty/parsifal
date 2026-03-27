# Parsifal

Self-hosted multiagent orchestration harness on NixOS.

## Goals

- Run multiple AI agents (Claude, Codex, Gemini) in their **native CLI habitats** — no LiteLLM, no unified SDK abstraction
- Enable structured multi-agent patterns: debates, spotchecks, parallel runs, error uncorrelation
- Expose a Next.js UI for monitoring and interacting with sessions from mobile
- Persist everything: sessions, transcripts, structured outputs

---

## Repo Layout

```
./CLAUDE.md               ← you are here
./nix/                    ← NixOS machine config (see nix/CLAUDE.md)
./orch/                   ← Next.js orchestration app (UI + API routes)
```

---

## Orchestration (`orch/`)

Next.js 16 app (App Router, TypeScript, Effect). Serves as both the mobile dashboard and the orchestration backend via API routes. Runs as a systemd service on port 3000, accessible over Tailscale.

**Philosophy**: Agents run in their **natural habitats**. No unified API wrapper.
- Claude → `claude` CLI (Claude Code)
- Codex → `codex` CLI
- Gemini → `gemini` CLI (or SDK where CLI is insufficient)
- If we ever need a typed AI framework, it will be **pydantic-ai**, not LiteLLM

**Session management**: Agent sessions run in named `tmux` sessions. The orchestrator
launches, monitors, and communicates with them via tmux send-keys. Run metadata persists
at `~/.parsifal/runs/{id}/` (meta.json, log.txt, prompt.md, report.md).

**Run modes**: pr, research, pm, job — each with different workdir and output handling.
Job mode uses a persistent workdir; other modes use `/tmp`. Watchdog detects stale runs
via log mtime.

**Pages**: `/parsifal` (launch + runs list), `/parsifal/[id]` (run detail + live log + controls),
`/system` (usage + sessions + info), `/terminal` (ttyd iframe).

**API routes**: `/api/parsifal/{launch,control,runs,log,report}`, `/api/{usage,sessions,info}`.
All server-side routes use Effect for typed error handling.

**Future multi-agent patterns**:
- debate — two agents argue a position, third judges
- spotcheck — agent A produces output, agent B critiques independently
- parallel — same prompt to N agents, aggregate/diff outputs
- pipeline — sequential handoffs with context passing

For spotchecks and debates, **do not share intermediate reasoning between agents** until after
each has produced an independent output. Contamination defeats the purpose.

---

## Agent Conventions

1. **Don't touch `nix/flake.lock`** without explicit instruction.
2. **Prefer idempotent operations** — this machine runs 24/7 and tasks may be retried.
3. **When in doubt about agent interaction**, use `remote-control` first. It's the primitive.

---

## Dev Workflow

```bash
# Dev server
cd orch && bun run dev

# Production build
cd orch && bun run build

# Rebuild machine config (build only — DO NOT switch)
sudo nixos-rebuild build --flake ./nix#parsifal
```

---

## What's NOT Here (Intentionally)

- No LiteLLM — agents run native
- No cloud infra — this is a homelab, Tailscale is the network
- No Redis / heavy message broker — start with tmux + files, graduate if needed
