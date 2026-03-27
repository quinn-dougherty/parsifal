# Parsifal Orch

Next.js orchestration UI and API for managing AI agent runs. Agents (Claude, Codex, Gemini) run in tmux sessions; the web UI launches, monitors, and controls them.

**WARNING: NO THREAT MODELS, NOT SECURITY AUDITED, USE AT YOUR OWN RISK**

Served over Tailscale only. No auth layer.

## Quick Start

```bash
bun install
bun run dev     # dev server on :3000
bun run build   # production build
```

## Run Modes

| Mode | Workdir | Output |
|------|---------|--------|
| `pr` | `/tmp/{id}` | Creates a pull request |
| `research` | `/tmp/{id}` | Writes report to `report.md` |
| `pm` | `/tmp/{id}` | Writes report to `report.md` |
| `job` | Persistent (user-specified) | Stays in workdir, no PR |

## Deployment

Runs as NixOS systemd service `parsifal-ui`. See `nix/modules/orch.nix`.
