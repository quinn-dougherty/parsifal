# Nix development notes

## Structure

```
config.toml               ← hostname + username, read by flake via builtins.fromTOML
flake.nix                 ← entry point, NOT at repo root
modules/
  configuration.nix       ← boot, networking, services, users, locale
  hardware.nix            ← generated hardware config (do not hand-edit)
  orch.nix                ← systemd service for the Next.js orch app (port 3000)
  programs/
    default.nix           ← environment.systemPackages + imports enables.nix
    enables.nix           ← programs.<x>.enable flags (grouped attrset)
```

Hostname and username are set in `config.toml` and passed to modules via `specialArgs` as `hostConfig`.

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
- No home-manager yet
- No dev shell defined yet
- `nix-ld` enabled for FHS compat (Claude Code, Node binaries)
- Docker virtualisation enabled
- Tailscale enabled for mesh networking
