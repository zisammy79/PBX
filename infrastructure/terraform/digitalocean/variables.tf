variable "do_token" {
  description = "DigitalOcean API token"
  type        = string
  sensitive   = true
}

variable "region" {
  description = "DigitalOcean region slug (e.g. nyc3)"
  type        = string
}

variable "droplet_size" {
  description = "Droplet size slug (e.g. s-4vcpu-8gb)"
  type        = string
}

variable "ssh_key_ids" {
  description = "DigitalOcean SSH key IDs for administrator access"
  type        = list(string)
}

variable "admin_cidrs" {
  description = "CIDR blocks allowed for SSH (TCP 22)"
  type        = list(string)
}

variable "domain_name" {
  description = "Managed domain apex (optional; empty skips DNS records)"
  type        = string
  default     = ""
}

variable "api_domain" {
  description = "API hostname (e.g. api.example.com)"
  type        = string
}

variable "web_domain" {
  description = "Web UI hostname (e.g. app.example.com)"
  type        = string
}

variable "reserved_ip_enabled" {
  description = "Allocate and assign a DigitalOcean Reserved IP"
  type        = bool
  default     = true
}

variable "block_storage_enabled" {
  description = "Attach optional block storage volume for persistent data"
  type        = bool
  default     = false
}

variable "block_storage_size_gb" {
  description = "Block storage volume size in GB when enabled"
  type        = number
  default     = 100
}

variable "spaces_enabled" {
  description = "Enable Spaces/object-storage configuration inputs (credentials supplied at deploy time)"
  type        = bool
  default     = false
}

variable "spaces_region" {
  description = "DigitalOcean Spaces region when spaces_enabled"
  type        = string
  default     = ""
}

variable "sip_udp_enabled" {
  description = "Allow SIP UDP (5060) from sip_allowed_cidrs"
  type        = bool
  default     = true
}

variable "sip_tcp_enabled" {
  description = "Allow SIP TCP (5060) from sip_allowed_cidrs"
  type        = bool
  default     = true
}

variable "sip_tls_enabled" {
  description = "Allow SIP TLS (5061) from sip_allowed_cidrs"
  type        = bool
  default     = false
}

variable "sip_allowed_cidrs" {
  description = "CIDR blocks allowed for SIP signaling (configure provider ranges at deploy time)"
  type        = list(string)
}

variable "rtp_port_start" {
  description = "First UDP port in the RTP range (must match Asterisk and host firewall)"
  type        = number
}

variable "rtp_port_end" {
  description = "Last UDP port in the RTP range (must match Asterisk and host firewall)"
  type        = number
}

variable "droplet_name" {
  description = "Droplet resource name"
  type        = string
  default     = "pbx-platform"
}

variable "ubuntu_image" {
  description = "Ubuntu LTS image slug"
  type        = string
  default     = "ubuntu-24-04-x64"
}

variable "project_id" {
  description = "Optional DigitalOcean project ID for resource assignment"
  type        = string
  default     = ""
}

variable "monitoring_enabled" {
  description = "Enable DigitalOcean droplet monitoring agent"
  type        = bool
  default     = true
}

variable "backups_enabled" {
  description = "Enable DigitalOcean droplet backups"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Resource tags applied to droplet, firewall, and volume"
  type        = list(string)
  default     = ["pbx-platform", "production"]
}

variable "turn_enabled" {
  description = "Allow TURN ports (3478/5349) — deferred; keep false until WebRTC is enabled"
  type        = bool
  default     = false
}
