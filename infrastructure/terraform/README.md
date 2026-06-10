# Terraform — DigitalOcean (Slice G)

Module: `digitalocean/`

Validated locally with:

```bash
docker run --rm -v "$PWD/digitalocean:/workspace" -w /workspace hashicorp/terraform:1.9.8 fmt -check -recursive
docker run --rm -v "$PWD/digitalocean:/workspace" -w /workspace hashicorp/terraform:1.9.8 init -backend=false
docker run --rm -v "$PWD/digitalocean:/workspace" -w /workspace hashicorp/terraform:1.9.8 validate
```

Do not commit `terraform.tfvars` or state files. See `digitalocean/terraform.tfvars.example`.
