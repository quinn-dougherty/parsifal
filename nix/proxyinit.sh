#!/usr/bin/env bash
# Runbook step 2 of nix/modules/litellm.nix: write the LiteLLM gateway's secrets.
#
# Copies the Mantle key and workspace id from the forgejo runner's claude-review
# credential, generates a master key and a Postgres password, sets that password
# on the `litellm` role, and writes /var/lib/secrets/litellm/litellm.env (0600).
#
# Run on parsifal after the first switch that includes litellm.nix (so the role
# exists). Refuses to overwrite an existing env file unless given --force, since
# a rerun rotates the master key and the DB password.
set -euo pipefail

src=/var/lib/secrets/islnet/claude-review.env
dst=/var/lib/secrets/litellm/litellm.env

if [ "$(id -u)" -ne 0 ]; then
  exec sudo "$0" "$@"
fi

if [ -e "$dst" ] && [ "${1:-}" != "--force" ]; then
  echo "$dst already exists; pass --force to regenerate it (rotates master key + DB password)" >&2
  exit 1
fi

[ -r "$src" ] || { echo "missing $src (islnet runbook step 5)" >&2; exit 1; }

# Exported here only for this process; nothing is echoed.
set -a
# shellcheck source=/dev/null
. "$src"
set +a

: "${AWS_BEARER_TOKEN_BEDROCK:?not set in $src}"
: "${ANTHROPIC_CUSTOM_HEADERS:?not set in $src}"

workspace=${ANTHROPIC_CUSTOM_HEADERS#anthropic-workspace-id: }
if [ "$workspace" = "$ANTHROPIC_CUSTOM_HEADERS" ] || [[ "$workspace" == *$'\n'* ]]; then
  echo "expected ANTHROPIC_CUSTOM_HEADERS to be exactly 'anthropic-workspace-id: <id>'" >&2
  exit 1
fi

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname = 'litellm'" | grep -q 1; then
  echo "postgres role 'litellm' does not exist yet; switch to a config with litellm.nix first" >&2
  exit 1
fi

hex() { head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; }
pw=$(hex 24)
master="sk-$(hex 32)" # LiteLLM requires the sk- prefix

sudo -u postgres psql -q -v ON_ERROR_STOP=1 \
  -c "ALTER ROLE litellm WITH LOGIN PASSWORD '$pw'"

umask 077
install -d -m 0700 /var/lib/secrets/litellm
tmp=$(mktemp "$dst.XXXXXX")
cat > "$tmp" <<EOF
BEDROCK_MANTLE_API_KEY=$AWS_BEARER_TOKEN_BEDROCK
MANTLE_WORKSPACE_ID=$workspace
LITELLM_MASTER_KEY=$master
DATABASE_URL=postgresql://litellm:$pw@127.0.0.1:5432/litellm
EOF
mv "$tmp" "$dst"

echo "wrote $dst"
echo "next: sudo systemctl restart podman-litellm && journalctl -fu podman-litellm"
