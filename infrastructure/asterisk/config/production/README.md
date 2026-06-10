# Production Asterisk notes
#
# Generated tenant configuration is activated atomically via:
#   infrastructure/asterisk/generated/{staging,active,last-known-good}
#
# Rollback: copy last-known-good to active and reload Asterisk.
# Validation: scripts/validate-asterisk-production.sh (via validate-deployment-assets.sh)
#
# Emergency calling remains unavailable until carrier, service address, regulatory
# approval, and explicit operator configuration exist.
