@AGENTS.md

# Orch

Next.js 16 orchestration app (App Router, TypeScript, Effect). Mobile-friendly dashboard + orchestration API, served over Tailscale only.

## Pages

- `/` — home with nav links
- `/parsifal` — agent launch form + runs list
- `/parsifal/[id]` — run detail: live log, control panel (send/nudge/interrupt/reset), deploy button
- `/system` — combined usage + sessions + info
- `/terminal` — embedded ttyd terminal (iframe to host:7681)
- `/usage`, `/sessions`, `/info` — standalone variants of system sections

## API Routes

- `/api/parsifal/launch` — POST: spawn agent run in tmux session
- `/api/parsifal/control` — POST: send/nudge/interrupt/reset/deploy actions
- `/api/parsifal/runs` — GET: list all runs or single run by `?id=`
- `/api/parsifal/log` — GET: fetch run log by `?id=`
- `/api/parsifal/report` — GET: fetch run report by `?id=`
- `/api/usage` — GET: CPU/memory/swap from /proc
- `/api/sessions` — GET: tmux session list
- `/api/info` — GET: fastfetch output

## Code Structure

- `lib/` — server-side modules using Effect (shell, tmux, parsifal run management, proc, types, errors)
- `components/` — shared React components (Bar, Modal, SessionCard)
- `hooks/` — `usePolling` hook for live data fetching
- `app/` — Next.js App Router pages and API routes

## Deployment

Runs as a NixOS systemd service `parsifal-ui` (defined in `nix/modules/orch.nix`). Production build via `bun run build`, served with `bun run start`.
