# Google Drive Recording Export Runbook (Task 1)

This runbook is for production operators on the approved admin IP only.

## Preconditions

- Run from admin IP `46.120.0.73` (production host is firewalled to this source).
- Execute on `pbx.callaso.co.il` in `/opt/pbx`.
- Do not paste secret values into chat, logs, or commits.

## Steps

```bash
sudo sed -i '/^GOOGLE_DRIVE_CLIENT_ID=/d;/^GOOGLE_DRIVE_CLIENT_SECRET=/d' /opt/pbx/.env
sudo tee -a /opt/pbx/.env >/dev/null <<'EOF'
GOOGLE_DRIVE_CLIENT_ID=<from psst GOOGLE_DRIVE_CLIENT_ID>
GOOGLE_DRIVE_CLIENT_SECRET=<from psst GOOGLE_DRIVE_CLIENT_SECRET>
EOF
sudo chown pbx:pbx /opt/pbx/.env && sudo chmod 600 /opt/pbx/.env
sudo su - pbx -c "cd /opt/pbx && set -a && source .env && set +a && pm2 restart pbx-api pbx-worker --update-env"
curl -s https://pbx.callaso.co.il/api/v1/platform/cloud-storage/oauth/status
```

## Verification

- Confirm `redirectUriGoogle` in the curl output matches the Google OAuth app's authorized callback.
