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

The Forge, the Assay, and the Ward are native Halls tracked inside the harness
checkout itself; they arrive with the clone. Only Modules (OpenBrain, CIC,
Slack, Discord) are independent repositories installed beneath the harness
checkout by the manifest. Live credentials, scheduler state, projects, and
this Wiki remain instance data.
