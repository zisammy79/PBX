#!/usr/bin/env bash
# Resolve development admin credentials for integration and telephony scripts.
set -euo pipefail

resolve_admin_email() {
  echo "${DEV_ADMIN_EMAIL:-admin@pbx.local}"
}

resolve_admin_password() {
  local root="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
  local bootstrap="$root/packages/database/.local/bootstrap-admin.json"

  if [[ -f "$bootstrap" ]]; then
    local from_bootstrap
    from_bootstrap="$(node -e "const j=JSON.parse(require('fs').readFileSync('$bootstrap','utf8')); process.stdout.write(j.password||'');")"
    if [[ -n "$from_bootstrap" ]]; then
      printf '%s' "$from_bootstrap"
      return 0
    fi
  fi

  if [[ -n "${DEV_ADMIN_PASSWORD:-}" && ${#DEV_ADMIN_PASSWORD} -ge 12 ]]; then
    printf '%s' "$DEV_ADMIN_PASSWORD"
    return 0
  fi

  echo "FAIL: Admin password unavailable. Set DEV_ADMIN_PASSWORD (min 12 chars) in .env and run: ALLOW_DEV_SEED=true pnpm db:seed" >&2
  return 1
}

fetch_admin_token() {
  local root="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
  local api_url="${2:-${PUBLIC_API_URL:-http://localhost:3001}}"
  local email password

  email="$(resolve_admin_email)"
  password="$(resolve_admin_password "$root")"

  node -e "
    const fs = require('fs');
    const path = require('path');
    const root = process.argv[1];
    const email = process.argv[2];
    const password = process.argv[3];
    const apiUrl = process.argv[4];
    const envToken = process.env.PBX_ADMIN_TOKEN || '';
    const cachePath = path.join(root, '.local/demo/admin-token.json');
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const tokenValid = (token) => {
      if (!token) return false;
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
        return Boolean(payload.exp && payload.exp * 1000 > Date.now() + 30000);
      } catch {
        return false;
      }
    };

    const readCache = () => {
      try {
        const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        if (tokenValid(cached.accessToken)) {
          return cached.accessToken;
        }
      } catch {}
      return '';
    };

    const writeCache = (token) => {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
      fs.mkdirSync(path.dirname(cachePath), { recursive: true });
      fs.writeFileSync(
        cachePath,
        JSON.stringify({ accessToken: token, expiresAtMs: payload.exp * 1000 }, null, 2),
        { mode: 0o600 },
      );
    };

    (async () => {
      if (tokenValid(envToken)) {
        process.stdout.write(envToken);
        return;
      }
      const cached = readCache();
      if (cached) {
        process.stdout.write(cached);
        return;
      }

      const attempts = 12;
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          const res = await fetch(apiUrl + '/api/v1/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });
          const body = await res.text();
          if (res.status === 429 && attempt < attempts) {
            let waitMs = 1000;
            try {
              const json = JSON.parse(body);
              waitMs = Math.min((json.details?.retryAfterSeconds || 1) * 1000, 180000);
            } catch {}
            await sleep(waitMs);
            continue;
          }
          if (!res.ok) {
            console.error(body);
            process.exit(1);
          }
          const json = JSON.parse(body);
          if (!json.accessToken) process.exit(1);
          writeCache(json.accessToken);
          process.stdout.write(json.accessToken);
          return;
        } catch (err) {
          if (attempt >= attempts) {
            console.error(err);
            process.exit(1);
          }
          await sleep(1000);
        }
      }
    })();
  " "$root" "$email" "$password" "$api_url"
}
