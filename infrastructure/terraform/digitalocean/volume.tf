resource "digitalocean_volume" "pbx_data" {
  count = var.block_storage_enabled ? 1 : 0

  region                  = var.region
  name                    = "${var.droplet_name}-data"
  size                    = var.block_storage_size_gb
  description             = "PBX persistent data (PostgreSQL, recordings, backups staging)"
  tags                    = var.tags
  initial_filesystem_type = "ext4"
}

resource "digitalocean_volume_attachment" "pbx_data" {
  count = var.block_storage_enabled ? 1 : 0

  droplet_id = digitalocean_droplet.pbx.id
  volume_id  = digitalocean_volume.pbx_data[0].id
}
