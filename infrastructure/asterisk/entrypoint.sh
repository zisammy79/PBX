#!/bin/sh
set -eu

PBX_GEN="/etc/asterisk/pbx-generated"
PBX_OVERLAY="/opt/pbx-asterisk/overlay"
PBX_PRODUCTION="/opt/pbx-asterisk/production"

resolve_sip_external_signaling() {
  if [ -n "${SIP_EXTERNAL_SIGNALING_ADDRESS:-}" ]; then
    printf '%s' "$SIP_EXTERNAL_SIGNALING_ADDRESS"
    return
  fi
  if [ -n "${SIP_EXTERNAL_IP:-}" ]; then
    printf '%s' "$SIP_EXTERNAL_IP"
    return
  fi
  if [ -n "${SIP_PUBLIC_DOMAIN:-}" ]; then
    printf '%s' "$SIP_PUBLIC_DOMAIN"
    return
  fi
  printf ''
}

resolve_sip_external_media() {
  if [ -n "${SIP_EXTERNAL_MEDIA_ADDRESS:-}" ]; then
    printf '%s' "$SIP_EXTERNAL_MEDIA_ADDRESS"
    return
  fi
  resolve_sip_external_signaling
}

render_template() {
  src="$1"
  dest="$2"
  signaling="$(resolve_sip_external_signaling)"
  media="$(resolve_sip_external_media)"
  sed \
    -e "s/__RTP_START__/${RTP_START:-10000}/g" \
    -e "s/__RTP_END__/${RTP_END:-10099}/g" \
    -e "s/__ARI_USERNAME__/${ASTERISK_ARI_USERNAME:-pbx_ari}/g" \
    -e "s/__ARI_PASSWORD__/${ASTERISK_ARI_PASSWORD:-}/g" \
    -e "s/__SIP_EXTERNAL_IP__/${SIP_EXTERNAL_IP:-127.0.0.1}/g" \
    -e "s/__SIP_EXTERNAL_SIGNALING__/${signaling}/g" \
    -e "s/__SIP_EXTERNAL_MEDIA__/${media}/g" \
    -e "s/__SIP_EXTERNAL_PORT__/${SIP_UDP_PUBLISH:-5060}/g" \
    "$src" > "$dest"
}

# Install PBX-managed configs into /etc/asterisk without replacing the full base tree
if [ -d "${PBX_OVERLAY}" ]; then
  for f in pjsip.conf extensions.conf ari.conf http.conf modules.conf rtp.conf asterisk.conf logger.conf pjsip_wizard.conf; do
    if [ -f "${PBX_OVERLAY}/${f}" ]; then
      if [ "$f" = "pjsip.conf" ]; then
        render_template "${PBX_OVERLAY}/${f}" "/etc/asterisk/${f}"
      else
        cp -f "${PBX_OVERLAY}/${f}" "/etc/asterisk/${f}"
      fi
    fi
  done
fi

if [ "${PBX_ENV:-}" = "production" ] && [ -d "${PBX_PRODUCTION}" ]; then
  if [ -z "${ASTERISK_ARI_USERNAME:-}" ] || [ -z "${ASTERISK_ARI_PASSWORD:-}" ]; then
    echo "production Asterisk requires ARI credentials" >&2
    exit 1
  fi
  for f in rtp.conf ari.conf http.conf pjsip.conf; do
    if [ -f "${PBX_PRODUCTION}/${f}" ]; then
      render_template "${PBX_PRODUCTION}/${f}" "/etc/asterisk/${f}"
    fi
  done
fi

mkdir -p "${PBX_GEN}/active" "${PBX_GEN}/staging" "${PBX_GEN}/last-known-good" \
  /var/log/asterisk/cdr \
  /var/log/asterisk/cdr-csv \
  /var/spool/asterisk/recording

# Shared recording directory for ARI bridge recordings (bind-mounted from host).
chown asterisk:asterisk /var/spool/asterisk/recording /var/log/asterisk/cdr-csv 2>/dev/null || true
chmod 2775 /var/spool/asterisk/recording 2>/dev/null || true
chmod 0750 /var/log/asterisk/cdr-csv 2>/dev/null || true

# Ensure include placeholders exist before Asterisk starts
for f in pjsip-tenants.conf extensions-tenants.conf asterisk-overrides.conf; do
  if [ ! -f "${PBX_GEN}/active/${f}" ]; then
    echo "; PBX generated — no tenant configuration activated yet" > "${PBX_GEN}/active/${f}"
    chmod 600 "${PBX_GEN}/active/${f}" || true
  fi
done

# Restrict permissions on generated tree
chmod -R u+rwX,go-rwx "${PBX_GEN}/active" "${PBX_GEN}/staging" "${PBX_GEN}/last-known-good" 2>/dev/null || true

exec /usr/sbin/asterisk -f -U asterisk -G asterisk -vvv
