# Bedrock Mantle gateway: a LiteLLM proxy that lets a few tailnet guests run
# Claude Code against Amazon Bedrock Mantle without anyone holding the Mantle
# key. Short-lived by intent; delete the import in flake.nix to retire it.
#
#   guest's claude ──(tailnet, virtual key)──▶ parsifal:4000 ──(Mantle key)──▶
#     https://bedrock-mantle.<region>.api.aws/anthropic/v1/messages
#
# Each guest gets a LiteLLM virtual key with an expiry and a dollar budget; the
# Mantle key and workspace id stay in a root 0600 file on the box. Same key and
# workspace as the forgejo runner's claude-review credential (islnet.nix).
#
# Why an OCI container and not services.litellm: the nixpkgs module exists and
# its options fit, but virtual keys need Prisma, and the nixpkgs build ships the
# Python Prisma client ungenerated — at startup it would try to download Node
# and the (unpatched) query engines and write a generated client into the read-
# only store. Upstream's litellm-database image has all of that baked in.
#
# Zero data retention: no prompt or response bodies are logged or persisted.
# What IS persisted, in Postgres: hashed keys, aliases, budgets, and per-request
# spend rows (model, token counts, cost, key hash, timestamps) with the request
# and response fields redacted. Set disable_spend_logs = true below to drop the
# per-request rows too; budgets are tracked on the key and keep working.
#
# Runbook (secrets, first start, key management) at the bottom.
{
  config,
  pkgs,
  lib,
  ...
}:
let
  # Also publish over HTTPS at https://<host>.<tailnet>.ts.net:${servePort},
  # via `tailscale serve`. Needs MagicDNS + HTTPS certificates on the tailnet.
  tailscaleServe = false;
  servePort = 8443; # 443 left alone in case something else serves there

  port = 4000;
  region = "us-east-1";
  secretsDir = "/var/lib/secrets/litellm";
  envFile = "${secretsDir}/litellm.env";
  # The unit's RuntimeDirectory, which oci-containers already declares (named
  # after the container). Holds host.env: the tailscale IP to bind.
  runDir = "/run/litellm";

  # Same release as the source audited for Mantle support (/v1/messages via
  # llms/bedrock/messages/mantle_transformation.py), pinned by index digest.
  image = "ghcr.io/berriai/litellm-database:v1.89.0@sha256:8402d2372a7ba8641cf09d8fa47006088d0705979b4e87c4eb2aec58fb298ce8";

  # Mantle id → names clients may request, and $/MTok. LiteLLM 1.89 has no
  # price table for Claude on Mantle, so without these every request costs $0
  # and budgets never trip. These are Anthropic first-party list prices;
  # Bedrock bills on its own sheet, so treat budgets as approximate.
  # Cache writes are priced at the 5-minute rate (1.25 × input).
  models = {
    "anthropic.claude-opus-5-5" = {
      aliases = [ "claude-opus-5-5" ];
      input = 4.0;
      output = 20.0;
      cacheRead = 0.2;
    };
    "anthropic.claude-opus-5" = {
      aliases = [ "claude-opus-5" ];
      input = 5.0;
      output = 25.0;
      cacheRead = 0.5;
    };
    "anthropic.claude-sonnet-5" = {
      aliases = [ "claude-sonnet-5" ];
      input = 2.0;
      output = 10.0;
      cacheRead = 0.2;
    };
    "anthropic.claude-haiku-4-5" = {
      aliases = [ "claude-haiku-4-5" ];
      input = 1.0;
      output = 5.0;
      cacheRead = 0.1;
    };
  };

  perToken = mtok: mtok / 1000000.0;

  mkEntry = id: m: name: {
    model_name = name;
    litellm_params = {
      # `mantle/` routes to the bedrock-mantle endpoint; its URL is built from
      # the region alone (api_base is ignored on this route).
      model = "bedrock/mantle/${id}";
      aws_region_name = region;
      # Sent as `Authorization: Bearer`, the ABSK long-term key's auth scheme.
      api_key = "os.environ/BEDROCK_MANTLE_API_KEY";
      # The Mantle project. LiteLLM resolves os.environ/ refs at any depth.
      extra_headers."anthropic-workspace-id" = "os.environ/MANTLE_WORKSPACE_ID";
    };
    model_info = {
      input_cost_per_token = perToken m.input;
      output_cost_per_token = perToken m.output;
      cache_read_input_token_cost = perToken m.cacheRead;
      cache_creation_input_token_cost = perToken (m.input * 1.25);
    };
  };

  settings = {
    model_list = lib.concatLists (
      lib.mapAttrsToList (id: m: map (mkEntry id m) ([ id ] ++ m.aliases)) models
    );

    litellm_settings = {
      turn_off_message_logging = true; # no bodies to any logger or callback
      redact_messages_in_exceptions = true; # nor in error strings
      redact_user_api_key_info = true;
      callbacks = [ ];
      success_callback = [ ];
      failure_callback = [ ];
      telemetry = false;
    };

    general_settings = {
      master_key = "os.environ/LITELLM_MASTER_KEY";
      database_url = "os.environ/DATABASE_URL";
      store_prompts_in_spend_logs = false;
      disable_spend_logs = false;
      # LiteLLM_ErrorLogs rows carry exception text, which can quote content.
      disable_error_logs = true;
      store_model_in_db = false; # the model list is this file, nothing else
    };
  };

  configFile = (pkgs.formats.yaml { }).generate "litellm-config.yaml" settings;

  tailscale = lib.getExe config.services.tailscale.package;
in
{
  # tailscaled itself is enabled in configuration.nix; asserted so this module
  # fails loudly rather than binding to nothing if that ever moves.
  assertions = [
    {
      assertion = config.services.tailscale.enable;
      message = "litellm.nix binds to the tailscale IP and needs services.tailscale.enable";
    }
  ];

  # ── Database (virtual keys, budgets, spend) ────────────────────────────────
  #
  # Listens on localhost only (enableTCPIP stays false). The container reaches
  # it over 127.0.0.1 because it shares the host's network namespace; NixOS's
  # default pg_hba already has `host all all 127.0.0.1/32 md5`. The password is
  # set by hand (runbook step 2) so it never enters the store.
  services.postgresql = {
    enable = true;
    ensureDatabases = [ "litellm" ];
    ensureUsers = [
      {
        name = "litellm";
        ensureDBOwnership = true;
      }
    ];
  };

  # ── Proxy ──────────────────────────────────────────────────────────────────
  virtualisation.oci-containers.containers.litellm = {
    inherit image;
    # Host networking: binds the tailscale IP directly and reaches Postgres on
    # loopback. The bind address comes from HOST in host.env, below.
    extraOptions = [
      "--network=host"
      "--cap-drop=ALL"
      "--security-opt=no-new-privileges"
    ];
    environmentFiles = [
      envFile
      "${runDir}/host.env"
    ];
    environment = {
      LITELLM_MODE = "PRODUCTION"; # do not load a .env from the workdir
      LITELLM_LOG = "ERROR";
      DISABLE_ADMIN_UI = "True"; # the API is all anyone needs
      SCARF_NO_ANALYTICS = "True";
      DO_NOT_TRACK = "True";
      ANONYMIZED_TELEMETRY = "False";
    };
    volumes = [ "${configFile}:/app/config.yaml:ro" ];
    # Appended to the image's entrypoint (docker/prod_entrypoint.sh → litellm).
    # Beware: if :4000 is already taken, litellm silently picks a random port.
    cmd = [
      "--config"
      "/app/config.yaml"
      "--port"
      (toString port)
    ];
  };

  systemd.services."podman-litellm" = {
    wants = [
      "tailscaled.service"
      "network-online.target"
    ];
    after = [
      "tailscaled.service"
      "network-online.target"
      "postgresql.service"
    ];
    requires = [ "postgresql.service" ];

    # Stay stopped, quietly, until runbook step 2 has written the secrets.
    unitConfig.ConditionPathExists = envFile;

    # Never 0.0.0.0: resolve this host's tailscale IPv4 at start and hand it to
    # litellm as HOST. Kept out of the repo like the rest of the site data. If
    # the node's tailscale IP changes, restart podman-litellm.
    preStart = lib.mkBefore ''
      for _ in $(seq 30); do
        ip=$(${tailscale} ip -4 2>/dev/null | head -n1) && [ -n "$ip" ] && break
        sleep 2
      done
      [ -n "''${ip:-}" ] || { echo "no tailscale IPv4 yet" >&2; exit 1; }
      echo "HOST=$ip" > ${runDir}/host.env
    '';
  };

  # tailscale0 is already in trustedInterfaces (configuration.nix), which opens
  # every port on it; this states the one this module needs, and still holds if
  # that blanket trust is ever removed. Nothing is opened on other interfaces.
  networking.firewall.interfaces.tailscale0.allowedTCPPorts = [
    port
  ]
  ++ lib.optional tailscaleServe servePort;

  # ── Optional HTTPS on the .ts.net name ─────────────────────────────────────
  #
  # `serve --bg` persists in tailscaled's own state; ExecStop removes it, and
  # systemd runs ExecStop when this unit disappears from the config — so
  # flipping tailscaleServe back to false and switching unpublishes it.
  systemd.services.litellm-tailscale-serve = lib.mkIf tailscaleServe {
    description = "Publish the LiteLLM gateway over tailscale serve (HTTPS)";
    wantedBy = [ "multi-user.target" ];
    wants = [ "podman-litellm.service" ];
    after = [
      "tailscaled.service"
      "podman-litellm.service"
    ];
    serviceConfig = {
      Type = "oneshot";
      RemainAfterExit = true;
      ExecStart = pkgs.writeShellScript "litellm-serve-up" ''
        set -eu
        ip=$(${tailscale} ip -4 | head -n1)
        exec ${tailscale} serve --bg --https=${toString servePort} "http://$ip:${toString port}"
      '';
      ExecStop = "${tailscale} serve --https=${toString servePort} off";
    };
  };

  systemd.tmpfiles.rules = [
    "d /var/lib/secrets 0700 root root -"
    "d ${secretsDir} 0700 root root -"
  ];
}
# ── One-time setup on parsifal ───────────────────────────────────────────────
#
# 1. Pull and switch. podman-litellm stays inactive (condition unmet) until
#    step 2; postgresql comes up and creates the `litellm` role and database.
#
# 2. Secrets. One root 0600 env file, the Mantle key and workspace copied from
#    the runner's claude-review credential, plus a fresh master key and DB
#    password. Run as one root shell on parsifal:
#
#      sudo bash -euo pipefail <<'SH'
#      umask 077
#      set -a; . /var/lib/secrets/islnet/claude-review.env; set +a
#      pw=$(openssl rand -hex 24)
#      sudo -u postgres psql -v ON_ERROR_STOP=1 \
#        -c "ALTER ROLE litellm WITH LOGIN PASSWORD '$pw'"
#      cat > /var/lib/secrets/litellm/litellm.env <<EOF
#      BEDROCK_MANTLE_API_KEY=$AWS_BEARER_TOKEN_BEDROCK
#      MANTLE_WORKSPACE_ID=${ANTHROPIC_CUSTOM_HEADERS#anthropic-workspace-id: }
#      LITELLM_MASTER_KEY=sk-$(openssl rand -hex 32)
#      DATABASE_URL=postgresql://litellm:$pw@127.0.0.1:5432/litellm
#      EOF
#      SH
#      sudo cat /var/lib/secrets/litellm/litellm.env   # eyeball it once
#
#    (The master key must start with `sk-`. MANTLE_WORKSPACE_ID assumes the
#    runner's ANTHROPIC_CUSTOM_HEADERS holds just that one header.)
#
# 3. sudo systemctl start podman-litellm && journalctl -fu podman-litellm
#    First start pulls the image and runs the Prisma migrations. Then:
#
#      curl -s http://$(tailscale ip -4):4000/health/liveliness
#
# 4. Virtual keys. Run on parsifal; the master key never leaves the box.
#    `gw <path> [json]` POSTs json if given, else GETs:
#
#      gw() {
#        sudo bash -c '. /var/lib/secrets/litellm/litellm.env
#          curl -sS "http://$(tailscale ip -4):4000$1" \
#            -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
#            ${2:+-H "Content-Type: application/json" -d "$2"}' _ "$@"
#      }
#
#      # create: expires in 14 days, $50 hard cap, 60 requests/minute
#      gw /key/generate '{"key_alias":"alice","duration":"14d",
#                          "max_budget":50,"rpm_limit":60}' | jq -r .key
#
#      gw '/key/info?key=sk-...'                       # spend so far
#      gw /key/delete '{"key_aliases":["alice"]}'      # or {"keys":["sk-..."]}
#
#    Rotating the Mantle key: edit litellm.env, restart podman-litellm.
#    Guests' virtual keys are unaffected.
