# Orchestration Blueprint

## Purpose

Turn a candidate Job Order into a routed, delegated work plan. Design,
Knowledge, and Scheduling are selected only when the Job Order needs them.

The Hall-local capability spec assigns Orchestration the
`lifecycle-transition` socket and the sole
lifecycle mutator for schema-v2 Job Order, Run, Claim, repair, terminal, and
parent-ingestion transitions. The mutator accepts only a Steward-authenticated
request under the exact Job Order and constructs one private lifecycle commit
containing both state and the Knowledge-validated Journal event. This is
cooperative Git CAS until remote enforcement is separately verified.

Orchestration also owns `lifecycle-projector`, an idempotent post-commit Pawn
capture. It does not own Knowledge's Journal contract, Gatehouse passage,
Gauge's activity feed, the interface socket binding, CIC, or Schematic.

## Capability Catalog

<!-- spec-catalog:start -->
| FUID | Spec alias | Description | Status | Created | Last worked |
|---|---|---|---|---|---|
| 000085 | [S-001 - Lifecycle Transition Primitive](specs/S-001-lifecycle-transition-primitive/SPEC.md) | Provide a stage-agnostic lifecycle transition primitive that validates one exact request and plans one atomic state-plus-Journal commit. | active | 2026-08-28 | 2026-08-28 |
<!-- spec-catalog:end -->
