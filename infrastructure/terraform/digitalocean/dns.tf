data "digitalocean_domain" "pbx" {
  count = var.domain_name != "" ? 1 : 0

  name = var.domain_name
}

resource "digitalocean_record" "web" {
  count = var.domain_name != "" ? 1 : 0

  domain = data.digitalocean_domain.pbx[0].id
  type   = "A"
  name   = replace(var.web_domain, ".${var.domain_name}", "")
  value  = var.reserved_ip_enabled ? digitalocean_reserved_ip.pbx[0].ip_address : digitalocean_droplet.pbx.ipv4_address
  ttl    = 300
}

resource "digitalocean_record" "api" {
  count = var.domain_name != "" ? 1 : 0

  domain = data.digitalocean_domain.pbx[0].id
  type   = "A"
  name   = replace(var.api_domain, ".${var.domain_name}", "")
  value  = var.reserved_ip_enabled ? digitalocean_reserved_ip.pbx[0].ip_address : digitalocean_droplet.pbx.ipv4_address
  ttl    = 300
}
