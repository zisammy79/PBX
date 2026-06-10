# Ansible — production host bootstrap (Slice G)

Playbook: `site.yml`  
Role: `roles/pbx-host`

```bash
cp inventory.example.yml inventory.yml
cp group_vars/all.example.yml group_vars/all.yml
ansible-playbook -i inventory.yml site.yml
```

When `ansible-playbook` is unavailable, `scripts/ansible-static-validate.sh` performs YAML structure checks.

Do not apply to development machines. Do not store secrets in git defaults.
