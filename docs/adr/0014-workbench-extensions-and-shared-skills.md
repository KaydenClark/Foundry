---
status: superseded by ADR-0017
date: 2026-09-03
---

# Workbench extensions have a declared support interface

The seven root files are supported by a declared `workbench/` directory containing `specs/`, `wiki/`, `grilling/`, `handoffs/`, and `feedback/`, with a manifest describing every extension. Skills and stances are a versioned dependency on `example/shared-skills`, and instance data, credentials, runtime state, and project history remain outside the public artifact.

Superseded by [ADR-0017](0017-workbench-support-directory-has-six-lanes.md), which declares six lowercase lanes; this ADR's five-lane set omitted `docs/` and `tools/`.

Consequences: This defines the portable interface; no WORKSPACE directory migration, skill copying, release, or installation occurs in this pass.

Provenance: owner-accepted decision, 2026-09-03; copied for the undeployed Foundry template. Instance-specific session provenance is retained separately.
