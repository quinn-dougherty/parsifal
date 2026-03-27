# Docker Isolation for Ralph Processes

Assessment of containerizing each ralph (agent session) via Docker, versus the current tmux-based model.

## Current State

Every ralph runs as user `q` (UID 1000) inside a named tmux session. They share:

- **All credentials**: `~/.config/gh/`, `~/.claude/.credentials.json`, `~/.ssh/`
- **All secrets**: `~/.secrets/{project}/{key}` — every ralph can read every project's secrets
- **The tmux socket**: any session can `send-keys` to any other session
- **Full home directory access**: config files, other ralphs' logs in `~/.parsifal/`, etc.

The only isolation boundary today is per-run `/tmp/{runId}` working directories, which is cosmetic — nothing enforces it.

## What Docker Buys (and Doesn't)

### Genuine wins

- **Filesystem isolation**: A ralph can't read another ralph's workdir, logs, or output unless explicitly mounted in. This matters for spotchecks and debates where contamination defeats the purpose.
- **Secret scoping**: Mount only the secrets a ralph needs (`-v ~/.secrets/fvspec:/secrets:ro`) instead of handing over the entire `~/.secrets/` tree. A ralph working on project A never sees project B's `OPENAI_API_KEY`.
- **Resource limits**: `--memory`, `--cpus` prevent a runaway agent from starving the box. Today a single ralph doing something dumb can eat all RAM.
- **Network policy**: `--network=none` for ralphs that shouldn't be making outbound calls. Useful for pure-local tasks.
- **Clean teardown**: `docker rm -f` is more reliable than hoping `tmux kill-session` cleaned up all child processes.

### Marginal / doesn't help much

- **Protection against a malicious agent**: If an agent is actively adversarial and has `gh` auth + git ssh, it can already do damage through those APIs regardless of container boundaries. Docker stops it from reading `/etc/shadow`, but that's not the threat model — the threat is "agent pushes bad code" or "agent exfiltrates a secret through an API it's authenticated to." Containers don't help there.
- **Lateral movement between ralphs**: In practice, ralphs don't attack each other. The contamination risk is accidental (e.g., a ralph reads another's output during a spotcheck), not adversarial. Filesystem isolation helps, but you could get 80% of this benefit with `unshare --mount` and bind mounts — no Docker needed.
- **tmux socket isolation**: You still need something to capture agent output. If you keep tmux inside the container, you've just moved the socket. If you switch to `docker logs`, you lose the ability to `send-keys` for interactive sessions and `remote-control` attachment, which is the core interaction model.

## The Auth Problem

This is where the cost/benefit ratio gets ugly. Each ralph needs auth for:

| Tool | Auth mechanism | Per-container cost |
|------|---------------|-------------------|
| `gh` CLI | OAuth device flow → `~/.config/gh/hosts.yml` | Can bind-mount read-only from host. One shared credential works. |
| `claude` CLI | `~/.claude/.credentials.json` | Same — bind-mount. But Claude Code also writes state to `~/.claude/`, so you need a writable overlay or per-ralph copy. |
| `git` (SSH) | `~/.ssh/id_qd_ed25519` + ssh-agent | Bind-mount the key read-only, or forward the host's `SSH_AUTH_SOCK`. Agent forwarding is cleaner but adds a socket mount. |
| `git` (config) | `~/.gitconfig` | Bind-mount read-only. Trivial. |
| Project secrets | `~/.secrets/{project}/{key}` | Mount only relevant subset. This is actually a win — forced scoping. |

**Net assessment**: Auth is solvable with bind mounts. You don't need to re-authenticate per ralph. The main annoyance is Claude Code's writable state directory — you'd need either:
1. A shared `~/.claude/` mount (defeats isolation), or
2. Per-ralph copies/overlays of `~/.claude/` (works, but adds setup complexity to the launch path)

Option 2 is the right call. Copy credentials in, let each ralph write its own state. ~10 lines in the launch route.

## Implementation Cost

### Low effort (do first)
- **Dockerfile**: Base image with `claude`, `codex`, `gemini`, `gh`, `git`, `ssh` baked in. Since we're on NixOS, a `nix build` producing an OCI image is natural. ~1-2 hours.
- **Launch route changes**: Replace `tmux new-session` with `docker run` + appropriate mounts. The run ID becomes the container name. ~2-3 hours.
- **Log capture**: `docker logs -f {runId}` replaces reading tmux panes. Straightforward.

### Medium effort
- **Interactive sessions / remote-control**: This is the hard part. Today, `remote-control` attaches to a tmux session to interact with a live claude process. In Docker, you'd need to either:
  - Run tmux inside the container and expose the socket (adds complexity, partially defeats the point)
  - Use `docker exec` as the interaction primitive instead of tmux `send-keys`
  - Run `claude` with `--remote-control` and expose that socket from the container

  Any of these works but requires rethinking the interaction layer. ~1-2 days.

- **Output capture changes**: Session monitoring currently reads `~/.parsifal/runs/{id}/log.txt` and `meta.json` from the host filesystem. With Docker, either mount a host directory for these, or pull them from the container. Mount is simpler. ~2-3 hours.

### High effort / ongoing
- **Image maintenance**: Every time you add a new CLI tool or update agent versions, rebuild the image. NixOS makes this less painful than Dockerfile layering, but it's still a thing to maintain.
- **Debugging**: `docker exec -it {runId} bash` instead of `tmux attach`. Different muscle memory, slightly worse ergonomics for live debugging.

## Total Estimate

| Phase | Work | What you get |
|-------|------|-------------|
| Basic containerization (no interactive) | ~1 day | Filesystem isolation, secret scoping, resource limits. Batch/print-mode ralphs work. |
| Interactive session support | ~2 days | `remote-control` and live attachment work inside containers. Full feature parity. |
| Polish (image CI, health checks, cleanup) | ~1 day | Production-grade. |

**~4 days total** to full parity with current tmux model, plus container isolation.

## Recommendation

The security upside is real but narrow. The main practical wins are:

1. **Secret scoping** — ralphs only see what they need. Worth it if you're running untrusted prompts or multi-tenant workloads.
2. **Resource limits** — prevents a ralph from killing the box. Worth it once you're running >3 concurrent ralphs.
3. **Clean teardown** — containers die cleanly. Worth it for reliability.

The main practical cost is **interaction complexity**. The tmux model is simple and works well for a single-user homelab. Docker adds a layer of indirection that makes live debugging and `remote-control` harder.

**If this stays single-user on Tailscale**: The tmux model is fine. The ralphs aren't adversarial to each other, and you control what prompts they get. Consider `unshare` + bind mounts for lightweight filesystem isolation without the Docker overhead.

**If you ever run untrusted prompts or share access**: Containerize. The auth bind-mount pattern is well-understood and the one-time setup cost is modest.

Either way, **secret scoping is worth doing now** regardless of container strategy — change the launch route to only mount the secrets each ralph actually needs, even within tmux.
