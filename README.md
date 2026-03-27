# Parsifal

![Parsifal](docs/parsifal.png)

Self-hosted multiagent orchestration harness on NixOS.

**WARNING: NO THREAT MODELS, NOT SECURITY AUDITED, USE AT YOUR OWN RISK**

Run multiple AI agents (Claude, Codex, Gemini) in their native CLI habitats. Launch, monitor, and control them from a mobile-friendly web UI over Tailscale.

## Structure

| Directory | Purpose |
|-----------|---------|
| `orch/` | Next.js orchestration app — UI + API routes |
| `nix/` | NixOS machine configuration |
| `docs/` | Design docs and assets |

## What This Is

- A homelab machine (`parsifal`) running NixOS
- A Next.js dashboard for launching and monitoring agent sessions
- Agents run in tmux, orchestrated via tmux send-keys
- Everything persists: run metadata, logs, prompts, reports

## What This Isn't

- No LiteLLM — agents run native
- No cloud infra — Tailscale is the network
- No Redis / message broker — tmux + files
