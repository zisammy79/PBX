#!/usr/bin/env bash
# Recover PBX production when login returns 500 / "An unexpected error occurred".
# Run from a machine that can SSH to the droplet (admin IP must be allowed in DO firewall).
set -euo pipefail

PROD_IP="${PROD_IP:-64.225.110.253}"
PROD_HOST="${PROD_HOST:-root@${PROD_IP}}"

echo "=== PBX production recovery on ${PROD_IP} ==="

ssh -o StrictHostKeyChecking=accept-new "$PROD_HOST" bash -s <<'REMOTE'
set -euo pipefail

echo "--- Disk usage ---"
df -h / /var/lib/docker 2>/dev/null || df -h /

echo "--- Docker containers ---"
docker ps --format 'table {{.Names}}\t{{.Status}}' | head -20

echo "--- Fix Redis write lock (MISCONF) ---"
if docker ps --format '{{.Names}}' | grep -qx pbx-redis; then
  docker exec pbx-redis redis-cli CONFIG SET stop-writes-on-bgsave-error no || true
  docker restart pbx-redis
fi

echo "--- Restart PostgreSQL if in recovery ---"
if docker ps --format '{{.Names}}' | grep -qx pbx-postgres; then
  docker restart pbx-postgres
  for i in $(seq 1 45); do
    if docker exec pbx-postgres pg_isready -U pbx -q 2>/dev/null; then
      echo "postgres_ready"
      break
    fi
    sleep 2
  done
fi

echo "--- Prune dangling docker data (safe) ---"
docker system prune -f >/dev/null 2>&1 || true

echo "--- Restart app processes ---"
if id pbx >/dev/null 2>&1; then
  su - pbx -c "pm2 restart pbx-api pbx-web pbx-worker" || true
fi

echo "--- Health check ---"
sleep 3
curl -fsS http://127.0.0.1:3001/api/v1/health/ready || true
echo
REMOTE

echo "=== Done. Test: https://pbx.callaso.co.il/login ==="
