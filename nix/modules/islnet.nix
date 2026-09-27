# ISLNET: WireGuard tunnel into the lab network + a Forgejo Actions runner
# registered against the lab's forge.
#
# This flake lives in a PUBLIC repo, so no ISLNET topology is committed here.
# Everything site-specific — endpoint, server key, addresses, resolver, search
# domain, forge URL, runner token — lives in root-owned plain files on the box.
# No sops-nix, no agenix: the tradeoff is that parsifal is not reproducible
# from this flake alone. See the runbook at the bottom for the manual steps.
{
  config,
  pkgs,
  lib,
  ...
}:
let
  secretsDir = "/var/lib/secrets/islnet";
  stateDir = "/var/lib/forgejo-runner";
  user = "forgejo-runner";

  # Non-secret runner settings only. The forge URL, token and UUID are learned
  # at registration and live in the .runner file under stateDir, off in the dark.
  runnerSettings = {
    log = {
      level = "info";
      job_level = "info";
    };

    runner = {
      # Absolute, so `register` writes it here no matter the invoking cwd.
      file = "${stateDir}/.runner";
      capacity = 2;
      timeout = "3h";
      shutdown_timeout = "1h";
      insecure = false; # the forge serves a real Let's Encrypt cert
      fetch_timeout = "30s";
      fetch_interval = "5s";
      report_interval = "1s";
      # Set here rather than at registration, so labels stay declarative.
      # `nix:host` runs jobs directly on parsifal with the PATH below;
      # `ubuntu-latest` fakes the GitHub name so stock actions resolve.
      labels = [
        "nix:host"
        "ubuntu-latest:docker://node:22-bookworm"
      ];
    };

    # The internal cache server binds a random host port that job containers
    # would reach back over the podman bridge — which the firewall drops. Off
    # until `cache.host` + `cache.proxy_port` are pinned and that port opened.
    cache.enabled = false;

    container = {
      network = ""; # let podman create a per-job network
      privileged = false;
      valid_volumes = [ ]; # workflows may not bind-mount anything
      docker_host = "-"; # and do not get the podman socket handed to them
      force_pull = false;
    };
  };

  runnerConfig = (pkgs.formats.yaml { }).generate "forgejo-runner.yaml" runnerSettings;
in
{
  # ── ISLNET tunnel ──────────────────────────────────────────────────────────
  #
  # No clash with tailscale: AllowedIPs in the .conf are the lab's private /24s,
  # never 0.0.0.0/0, so this is a split tunnel. tailscale0 owns 100.64.0.0/10
  # and its own DNS stub; `isl` owns the lab ranges. No shared route, no shared
  # port (both are just UDP sockets on different ports), no shared table.
  #
  # `isl` is deliberately absent from networking.firewall.trustedInterfaces:
  # parsifal needs outbound reach into the lab, not the reverse.
  networking.wg-quick.interfaces.isl = {
    configFile = "${secretsDir}/isl.conf";
    autostart = true;
  };

  # resolved gives us per-interface DNS scoping, which is what keeps the lab's
  # resolver from becoming the box's global resolver (see the PostUp line in
  # the runbook). It is also what tailscale wants for MagicDNS.
  services.resolved.enable = true;

  # ── Forgejo Actions runner ─────────────────────────────────────────────────
  #
  # Hand-rolled rather than services.gitea-actions-runner, because that module
  # takes the forge URL as a Nix string — which would put it in this public
  # repo and in the store. Here registration is a one-time manual step and the
  # daemon only ever reads ${stateDir}/.runner.
  #
  # Container jobs go to podman, not docker: the runner speaks the Docker API
  # and podman's socket serves it. DOCKER_HOST below is the whole integration.
  # Note we do NOT touch virtualisation.podman.dockerSocket/dockerCompat —
  # both assert against virtualisation.docker.enable, which is on.
  virtualisation.podman.autoPrune = {
    enable = true;
    dates = "weekly";
  };

  users = {
    users.${user} = {
      isSystemUser = true;
      group = user;
      home = stateDir;
      # SocketGroup on podman.socket, i.e. permission to create containers.
      extraGroups = [ "podman" ];
      description = "Forgejo Actions runner";
    };
    groups.${user} = { };
  };

  # Created ahead of the unit so the manual `register` in step 3 has a home.
  systemd.tmpfiles.rules = [
    "d /var/lib/secrets 0700 root root -"
    "d ${secretsDir} 0700 root root -"
    "d ${stateDir} 0750 ${user} ${user} -"
  ];

  # Also the path the register command passes to --config.
  environment = {
    etc."forgejo-runner/config.yaml".source = runnerConfig;
    systemPackages = [ pkgs.forgejo-runner ];
  };

  systemd.services.forgejo-runner = {
    description = "Forgejo Actions runner (ISLNET)";
    wantedBy = [ "multi-user.target" ];
    wants = [
      "network-online.target"
      "wg-quick-isl.service"
      "podman.socket"
    ];
    after = [
      "network-online.target"
      "wg-quick-isl.service"
      "podman.socket"
    ];

    # Stay stopped, quietly, until someone has run step 3.
    unitConfig.ConditionPathExists = "${stateDir}/.runner";

    environment = {
      HOME = stateDir;
      DOCKER_HOST = "unix:///run/podman/podman.sock";
    };

    # PATH for `nix:host` jobs — including nix itself, which is the point of
    # running them on the host. Container jobs get the image's PATH instead.
    path = [
      config.nix.package
    ]
    ++ (with pkgs; [
      bash
      coreutils
      curl
      gawk
      gitMinimal
      gnused
      gnutar
      gzip
      jq
      nodejs
      openssh
      wget
    ]);

    serviceConfig = {
      Type = "simple";
      User = user;
      Group = user;
      WorkingDirectory = stateDir;
      ExecStart = "${lib.getExe pkgs.forgejo-runner} daemon --config /etc/forgejo-runner/config.yaml";
      Restart = "always";
      RestartSec = 10;
    };
  };
}
# ── One-time setup on parsifal ───────────────────────────────────────────────
#
# 1. ISLNET peer. Generate a keypair on the box and give the public key to the
#    ISLNET admin, who assigns an address out of the lab range:
#
#      umask 077
#      sudo install -d -m 0700 /var/lib/secrets/islnet
#      wg genkey | sudo tee /var/lib/secrets/islnet/priv | wg pubkey
#
# 2. Write /var/lib/secrets/islnet/isl.conf, root-owned 0600. Same shape as the
#    laptop's tunnel, with its own PrivateKey and Address:
#
#      [Interface]
#      PrivateKey = <from step 1>
#      Address    = <address ISLNET assigned>/32
#      MTU        = 1392
#      DNS        = <ISLNET resolver>
#      PostUp     = resolvectl domain %i ~<ISLNET search domain>
#
#      [Peer]
#      PublicKey           = <ISLNET server public key>
#      Endpoint            = <host>:<port>
#      AllowedIPs          = <lab ranges>   # never 0.0.0.0/0 — see above
#      PersistentKeepalive = 25
#
#    MTU is load-bearing: the real path MTU is 1392 and PMTUD is broken on that
#    path (no ICMP frag-needed comes back), so at wireguard's 1420 default
#    every packet of 1393..1420 bytes is dropped in silence. Small packets all
#    pass — ping, TCP handshake, DNS — so the only thing that breaks is the
#    forge's certificate chain, and the failure reads as "TLS handshake
#    timeout". It is not an auth or token problem. Verify with
#    `ping -c2 -M do -s 1372 <forge ip>` failing where `-s 1340` passes.
#
#    The PostUp line scopes the lab resolver to the lab's domain, so public DNS
#    and tailscale MagicDNS keep resolving normally. Without it wg-quick points
#    all DNS (`Domains=~.`) at the lab.
#
# 3. Register once. Token comes from the forge: site admin → Actions → Runners
#    → Create, or per-org/repo under Settings → Actions → Runners.
#
#      sudo -u forgejo-runner env HOME=/var/lib/forgejo-runner \
#        forgejo-runner register --no-interactive \
#          --config   /etc/forgejo-runner/config.yaml \
#          --instance https://<forge> \
#          --token    <registration token> \
#          --name     parsifal
#
# 4. sudo systemctl start forgejo-runner && systemctl status forgejo-runner
#
# Changing labels requires re-registering with a fresh token: stop the service,
# rm /var/lib/forgejo-runner/.runner, repeat step 3.
