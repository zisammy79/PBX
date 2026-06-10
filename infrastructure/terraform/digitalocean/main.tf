locals {
  user_data = templatefile("${path.module}/templates/cloud-init.yaml.tftpl", {
    hostname = var.droplet_name
  })

  firewall_inbound_rules = concat(
    [
      {
        protocol         = "tcp"
        port_range       = "22"
        source_addresses = var.admin_cidrs
      },
      {
        protocol         = "tcp"
        port_range       = "80"
        source_addresses = ["0.0.0.0/0", "::/0"]
      },
      {
        protocol         = "tcp"
        port_range       = "443"
        source_addresses = ["0.0.0.0/0", "::/0"]
      },
    ],
    var.sip_udp_enabled ? [
      {
        protocol         = "udp"
        port_range       = "5060"
        source_addresses = var.sip_allowed_cidrs
      }
    ] : [],
    var.sip_tcp_enabled ? [
      {
        protocol         = "tcp"
        port_range       = "5060"
        source_addresses = var.sip_allowed_cidrs
      }
    ] : [],
    var.sip_tls_enabled ? [
      {
        protocol         = "tcp"
        port_range       = "5061"
        source_addresses = var.sip_allowed_cidrs
      }
    ] : [],
    [
      {
        protocol         = "udp"
        port_range       = "${var.rtp_port_start}-${var.rtp_port_end}"
        source_addresses = var.sip_allowed_cidrs
      }
    ],
    var.turn_enabled ? [
      {
        protocol         = "udp"
        port_range       = "3478"
        source_addresses = ["0.0.0.0/0", "::/0"]
      },
      {
        protocol         = "tcp"
        port_range       = "3478"
        source_addresses = ["0.0.0.0/0", "::/0"]
      },
      {
        protocol         = "tcp"
        port_range       = "5349"
        source_addresses = ["0.0.0.0/0", "::/0"]
      }
    ] : []
  )
}

resource "digitalocean_droplet" "pbx" {
  name     = var.droplet_name
  region   = var.region
  size     = var.droplet_size
  image    = var.ubuntu_image
  ssh_keys = var.ssh_key_ids
  tags     = var.tags

  monitoring = var.monitoring_enabled
  backups    = var.backups_enabled

  user_data = local.user_data

  lifecycle {
    create_before_destroy = true
  }
}

resource "digitalocean_firewall" "pbx" {
  name = "${var.droplet_name}-firewall"

  droplet_ids = [digitalocean_droplet.pbx.id]

  dynamic "inbound_rule" {
    for_each = local.firewall_inbound_rules
    content {
      protocol         = inbound_rule.value.protocol
      port_range       = inbound_rule.value.port_range
      source_addresses = inbound_rule.value.source_addresses
    }
  }

  outbound_rule {
    protocol              = "tcp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "udp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "icmp"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  tags = var.tags
}

resource "digitalocean_project_resources" "pbx" {
  count = var.project_id != "" ? 1 : 0

  project = var.project_id
  resources = compact([
    digitalocean_droplet.pbx.urn,
    var.reserved_ip_enabled ? digitalocean_reserved_ip.pbx[0].urn : null,
    var.block_storage_enabled ? digitalocean_volume.pbx_data[0].urn : null,
  ])
}
