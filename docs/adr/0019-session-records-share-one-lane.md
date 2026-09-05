---
status: accepted
date: 2026-09-03
---

# Session records share the sessions lane

Grilling notepads and handoffs are both records of working sessions, so they share one `sessions/` lane holding `grilling diary/` and `handoffs/`. This replaces ADR-0014's separate `grilling/` and `handoffs/` lanes and moves notepads out of the hidden `.agents/` directory, where Obsidian could not see the artifact type the workspace produces most.

Considered and rejected: `journal/`. It is the better word in isolation, but "Journal" is occupied — the Grounding Journal is a Foundry capability with a `grounding-journal` socket, digest chain, Knowledge custody, and lifecycle schema v2 commits, and Canon uses the bare word throughout. A `journal/` directory of markdown session records beside a Journal that is an append-only event ledger would mislead every agent that booted a Foundry-enabled room.

Consequences: notepads remain transient staging, gitignored by default and force-added when an ADR cites one as provenance, which preserves the pre-move `/.agents/` policy. The shared `grilling` skill's hardcoded notepad path changes with this lane.

Provenance: owner-accepted decision, 2026-09-03; copied for the undeployed Foundry template. Instance-specific session provenance is retained separately.
