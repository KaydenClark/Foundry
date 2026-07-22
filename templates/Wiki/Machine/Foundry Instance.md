---
type: memory
status: active
sensitivity: normal
authority: canonical
source_paths:
  - {{HARNESS_ROOT}}/manifest/foundry.json
last_verified: {{ADOPTION_DATE}}
---

# Foundry Instance

- Instance: `{{INSTANCE_NAME}}`
- Harness checkout: `{{HARNESS_ROOT}}`
- Install manifest: `{{HARNESS_ROOT}}/manifest/foundry.json`
- Instance bindings: `.foundry/bindings.json`
- Adoption receipt: `.local/foundry/adoption-receipt.json`

Sockets and Modules are independent repositories installed beneath the harness
checkout. Live credentials, scheduler state, projects, and this Wiki remain
instance data.
