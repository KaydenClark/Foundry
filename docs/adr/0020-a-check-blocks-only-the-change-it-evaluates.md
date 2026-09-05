---
status: accepted
date: 2026-09-03
---

# A check may block only the change it evaluates

No mechanism may gate the repair that would make that mechanism correct. A check may block on the delta it can judge — whether this change introduces a new break — and never on global green, because a global-completeness precondition demands a finished state as the price of the work that would produce it.

This generalises rules that until now existed only in narrow form: [ADR-0009](0009-job-order-authority-is-an-intersection.md) forbids a Job Order turning an unavailable future mechanism into a prerequisite, and the repair record states that unavailable mechanisms cannot be prerequisites for their own repair. Stated generally, the rule also follows from [ADR-0001](0001-planes-classify-operations-not-artifacts.md): a verification tool emits Projection, and a report cannot grant scope or authorise changes to its inputs, so wiring its exit code into a release gate promotes Projection to Canon.

Consequences: the link checker `vault-links.mjs` is a report. Its 90 findings after the V3 migration measure remaining debris and gate nothing; a reader finding no release gate should not add one. Release criteria are facts that can be observed where work actually stands — that the lanes exist, that the manifest declares them, that the ADRs say so — not the absence of every known defect.

Provenance: owner-accepted decision, 2026-09-03; copied for the undeployed Foundry template. Instance-specific session provenance is retained separately.
