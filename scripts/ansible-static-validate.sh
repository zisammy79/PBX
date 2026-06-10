#!/usr/bin/env bash
# Ansible syntax validation — uses ansible-playbook when available, otherwise static YAML checks.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANSIBLE_DIR="${ROOT}/infrastructure/ansible"

if command -v ansible-playbook >/dev/null 2>&1; then
  ANSIBLE_CONFIG="${ANSIBLE_DIR}/ansible.cfg" ansible-playbook --syntax-check "${ANSIBLE_DIR}/site.yml"
  exit 0
fi

if docker image inspect cytopia/ansible:latest-tools >/dev/null 2>&1 || docker pull cytopia/ansible:latest-tools >/dev/null 2>&1; then
  docker run --rm -v "${ROOT}:/repo" -w /repo/infrastructure/ansible cytopia/ansible:latest-tools \
    ansible-playbook --syntax-check site.yml
  exit 0
fi

python3 - <<PY
import pathlib, sys, os
try:
    import yaml
except ImportError:
    print("ansible-static-validate: ansible-playbook unavailable; install PyYAML or Ansible for full check", file=sys.stderr)
    sys.exit(0)

root = pathlib.Path("${ROOT}")
ansible = root / "infrastructure/ansible"
for path in [ansible / "site.yml", ansible / "inventory.example.yml", ansible / "group_vars/all.example.yml"]:
    with path.open() as fh:
        yaml.safe_load(fh)
print("ansible-static-validate: YAML structure OK (syntax-check fallback — ansible-playbook not executed)")
PY
