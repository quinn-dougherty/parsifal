# Nix development notes

## Structure

```
config.toml               ← hostname + username, read by flake via builtins.fromTOML
flake.nix                 ← entry point, NOT at repo root
modules/
  configuration.nix       ← boot, networking, services, users, locale
  hardware.nix            ← generated hardware config (do not hand-edit)
  orch.nix                ← systemd service for the Next.js orch app (port 3000)
  islnet.nix              ← ISLNET wireguard tunnel + Forgejo Actions runner
  programs/
    default.nix           ← environment.systemPackages + imports enables.nix
    enables.nix           ← programs.<x>.enable flags (grouped attrset)
  home/
    default.nix          ← home-manager wiring (NixOS-module flavor)
    q.nix                ← the user's home config; imports the rest
    hyprland.nix         ← deploys hypr/*.conf via xdg.configFile
    hypr/                ← verbatim hyprland.conf + bindings.conf
```

Hostname and username are set in `config.toml` and passed to modules via `specialArgs` as `hostConfig`.

## Home Manager

home-manager is consumed as a **NixOS module** (`home-manager.nixosModules.home-manager`),
not standalone — one `nixos-rebuild` applies both system and home. Its nixpkgs `follows`
ours, and `backupFileExtension = "hm-bak"` so pre-existing dotfiles get renamed instead of
failing activation.

Hyprland config is shipped as **verbatim `.conf` files** via `xdg.configFile`, *not* via
`wayland.windowManager.hyprland.settings`. That option generates hyprlang, which upstream
deprecated in 0.55 and intends to drop; keeping raw files makes the eventual port to
`hyprland.lua` a local change in `home/hyprland.nix`. The compositor itself stays enabled
system-side in `programs/enables.nix`.

Config files are store symlinks (read-only). Edit `modules/home/hypr/*.conf` in the repo,
rebuild, then `hyprctl reload`. To live-edit instead, swap `source` for
`config.lib.file.mkOutOfStoreSymlink`.

Not managed yet: the wallpaper `~/.config/hypr/grail.png` (9.5MB, referenced by the
`swaybg` exec-once) and waybar/mako/kitty configs.

## Secrets

There is no sops-nix / agenix. Secrets are root-owned plain files on the box, referenced
by path from the modules (`/var/lib/secrets/...`). Deliberate tradeoff: lowest lift in the
repo, at the cost of the box not being reproducible from this flake alone.

This repo is **public**, so site-specific network data — endpoints, peer keys, private IP
ranges, internal hostnames — stays out of it too, not just credentials. `islnet.nix` is the
worked example: it names only the interface and the paths, and wg-quick reads the actual
tunnel config from outside the store via `configFile`. Its runbook comment lists the manual
steps.

## Style

Favor grouped attrsets — keys labeled once:
```nix
programs = {
  git.enable = true;
  nix-ld.enable = true;
}
```
over repeated prefixes.

Run `nixfmt` on nix files periodically.

## Build

```bash
sudo nixos-rebuild build --flake ./nix#parsifal
# DO NOT switch — user handles switches manually.
```

## Key facts

- `nixpkgs` input: `nixos-unstable`
- Plain flake (no flake-parts yet)
- home-manager as a NixOS module; user home config lives in `modules/home/`
- No dev shell defined yet
- `nix-ld` enabled for FHS compat (Claude Code, Node binaries)
- Docker virtualisation enabled; podman too, and the Forgejo runner uses **podman** for
  container jobs (`DOCKER_HOST` → `/run/podman/podman.sock`). Don't enable
  `virtualisation.podman.dockerSocket`/`dockerCompat` — both assert against `docker.enable`
- Tailscale enabled for mesh networking; ISLNET wireguard (`isl`) is a split tunnel, so the
  two don't contend. Never give the `isl` tunnel `AllowedIPs = 0.0.0.0/0`
- `services.resolved` enabled (by `islnet.nix`) so tunnel DNS can be scoped per-interface;
  NetworkManager picks up `dns = "systemd-resolved"` automatically
