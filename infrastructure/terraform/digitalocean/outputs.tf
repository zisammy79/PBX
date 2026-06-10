output "droplet_id" {
  description = "DigitalOcean droplet ID"
  value       = digitalocean_droplet.pbx.id
}

output "droplet_ipv4" {
  description = "Droplet public IPv4 (ephemeral unless reserved IP assigned)"
  value       = digitalocean_droplet.pbx.ipv4_address
}

output "reserved_ip" {
  description = "Reserved IPv4 when enabled"
  value       = var.reserved_ip_enabled ? digitalocean_reserved_ip.pbx[0].ip_address : null
}

output "public_ip" {
  description = "Preferred public IP for SIP/RTP advertisement (reserved IP when enabled)"
  value       = var.reserved_ip_enabled ? digitalocean_reserved_ip.pbx[0].ip_address : digitalocean_droplet.pbx.ipv4_address
}

output "firewall_id" {
  description = "Cloud Firewall ID"
  value       = digitalocean_firewall.pbx.id
}

output "firewall_inbound_port_summary" {
  description = "Summary of inbound Cloud Firewall rules for validation scripts"
  value = {
    ssh_cidrs       = var.admin_cidrs
    sip_udp         = var.sip_udp_enabled
    sip_tcp         = var.sip_tcp_enabled
    sip_tls         = var.sip_tls_enabled
    sip_cidrs       = var.sip_allowed_cidrs
    rtp_start       = var.rtp_port_start
    rtp_end         = var.rtp_port_end
    turn_enabled    = var.turn_enabled
    http_https_open = true
  }
}

output "block_storage_volume_id" {
  description = "Attached block storage volume ID when enabled"
  value       = var.block_storage_enabled ? digitalocean_volume.pbx_data[0].id : null
}

output "spaces_configuration" {
  description = "Spaces region hint when external object storage is used"
  value = var.spaces_enabled ? {
    region = var.spaces_region
    note   = "Configure S3 credentials in production .env; do not store in Terraform"
  } : null
}

output "dns_records" {
  description = "Managed DNS record FQDNs when domain_name is set"
  value = var.domain_name != "" ? {
    web = var.web_domain
    api = var.api_domain
  } : null
}
