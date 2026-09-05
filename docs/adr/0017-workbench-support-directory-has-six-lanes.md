---
status: accepted
date: 2026-09-03
supersedes: ADR-0014
---

# The Workbench support directory has six lowercase lanes

The declared support directory is lowercase `workbench/` with six lanes: `docs/`, `specs/`, `wiki/`, `sessions/`, `feedback/`, and `tools/`. A lane is a prebuilt structural slot that ships with every Workbench whether or not it currently holds anything, so an empty lane is a slot rather than an unkept promise. This supersedes [ADR-0014](0014-workbench-extensions-and-shared-skills.md), which declared five lanes and omitted `docs/` — the ADR register's own home — and `tools/`.

Consequences: `manifest.json` grows from five `lanes` entries to six. Lowercase is the settled spelling: the WORKSPACE tree had capitalised `Workbench/` and `Wiki/`, which the portable template never did, and a case-insensitive host hid the divergence that any Linux clone would have split into two directories.

Provenance: owner-accepted decision, 2026-09-03; copied for the undeployed Foundry template. Instance-specific session provenance is retained separately.
