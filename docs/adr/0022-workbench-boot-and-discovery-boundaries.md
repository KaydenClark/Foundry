---
status: accepted
date: 2026-09-03
---

# A Workbench boots from the nearest root AGENTS.md

Three boots must work: a fresh root, a Workbench nested inside a larger room, and a standalone Workbench with no ambient WORKSPACE dependency. In each, the room's root `AGENTS.md` is the entrypoint and routes to its own `workbench/`; a nested Workbench inherits only the outer room's *declared safety boundaries* and then applies the nearest local contract. Connected Foundries are peers, not nested rooms.

Consequences: `AGENTS.md`, `CLAUDE.md` and `README.md` stay root-discoverable, because a fresh agent must find the governing contract without guessing or inheriting unrelated room detail. Inheritance is deliberately asymmetric — safety boundaries cross inward, routing and product detail do not — so an outer room cannot silently widen an inner Workbench's scope. The reusable template's home is not settled by this ADR: the historical instance contract retires `Projects/LLM_Workbench` as a producer alias and reserves it for a Shipping-managed checkout, so the source handed to this decision is stale on that point and the Forge remains the producer.

Provenance: owner-accepted decision, 2026-09-03; copied for the undeployed Foundry template. Instance-specific session provenance is retained separately.
