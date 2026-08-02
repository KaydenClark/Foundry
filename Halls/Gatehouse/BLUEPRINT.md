# Gatehouse Blueprint

## Purpose

The Gatehouse owns the deterministic containment boundary of the Foundry:
Job Order assignment and validation, clearance-band enforcement, governance
plane transitions, shipping gates, and the audit trail produced by those
checks.

## Invariants

- The Gatehouse enforces approved policy; it does not invent policy.
- Every Actuality change is tied to a Job Order and checked in as Grounding.
- Halls request gates through tickets; neither a requesting Hall nor the
  Gatehouse unilaterally broadens authority.
- The Assay judges evidence independently; the Gatehouse enforces deterministic
  entry and transition checks.
- Product repositories never flow back into this producer source.

## Current State

Root S-027 preserves this producer-side control surface while consolidating the
Foundry. No executable Gatehouse behavior exists; implementation requires a
later approved Gatehouse capability spec.
