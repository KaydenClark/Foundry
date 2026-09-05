# Gatehouse Blueprint

## Purpose

The Gatehouse owns deterministic containment and passage infrastructure:
walls, floors, doors, gates, clearance bands, mandatory Job Order scans at
protected transitions, and the append-only receipt trail those scans create.

## Invariants

- Gatehouse enforces that a protected passage is scanned and recorded; it does
  not determine the route, validate the work, or decide policy.
- Every passage receipt records actor/Pawn, time, source, destination,
  clearance band, scope, purpose, scan result, and receipt ID.
- Validation returns read-only passage findings for Orchestration; Assay judges
  completed results independently.
- Gauge receives Gatehouse receipts for derived visibility and notification.
- Gatehouse owns `passage-projector`, an idempotent post-commit capture of its
  own passage, Clearance, and denial receipts. It never becomes lifecycle
  transaction authority, originates no Journal event, and authorizes nothing.
- Product repositories never flow back into this producer source.

## Current State

Root `S-001` owns the initial thirteen-Hall architecture. No executable
Gatehouse behavior exists; passage contracts are staged under `S-001/TK-003`,
and Gatehouse S-001 now owns the portable Clearance primitive. An adopting
instance must supply its own accepted private authorization before execution.

## Capability Catalog

<!-- spec-catalog:start -->
| FUID | Spec alias | Description | Status | Created | Last worked |
|---|---|---|---|---|---|
| 000089 | [S-001 - Clearance Policy Primitive](specs/S-001-clearance-policy-primitive/SPEC.md) | Compile and evaluate a stage-agnostic deterministic Clearance policy as a cap on an already Canon-authorized request. | active | 2026-08-28 | 2026-08-28 |
<!-- spec-catalog:end -->
