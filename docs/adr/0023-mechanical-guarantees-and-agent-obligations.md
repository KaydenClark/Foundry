---
status: accepted
date: 2026-09-03
---

# Tools check structure; agents carry judgment

Workbench tools verify what is deterministic — root entrypoints, the declared `workbench/` layout, links, paths, manifests, generated views, and stale or duplicate layouts left by a migration. Agents carry what is not: understanding scoped intent, establishing design by conversation, choosing durable records, exercising judgment, doing and testing the work, and reporting honestly. A tool may report; it never manufactures authority.

Consequences: missing CAS, Job Orders, Flights, or automation cannot fail ordinary repair work — an absent mechanism is not a finding about the change under evaluation ([ADR-0020](0020-a-check-blocks-only-the-change-it-evaluates.md)). This is not hypothetical: `preflight.mjs` asserted launch mode on every run, so a bare invocation reported `spec-required`, `ticket-required` and `job-order-required` against a launch nobody had requested, and a reader could not tell a real gate from an artifact of the tool's own shape. Requiring the *available* mechanisms a change genuinely needs remains correct; the line is availability, not strictness.

Provenance: owner-accepted decision, 2026-09-03; copied for the undeployed Foundry template. Instance-specific session provenance is retained separately.
