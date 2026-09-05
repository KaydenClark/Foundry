# S-001 - Grounding Journal Primitive

> Generated from LLM Workbench v2.3.

**Spec ID:** S-001
**FUID:** 000087
**Status:** complete
**Priority:** 0
**Owner:** Knowledge
**Created:** 2026-08-28
**Last worked:** 2026-08-30
**Updated:** 2026-08-30
**Catalog description:** Provide a stage-agnostic Grounding Journal primitive for canonical event validation, sequencing, digest chaining, replay, and recovery.
**Blockers:** None in the portable capability; execution still requires an adopting instance's private authorization and passage gates.
**Latest event:** The repaired portable primitive passed its adopting instance's independent acceptance and recovery gates.
**Next gate:** none for the portable primitive; adopting instances own their private flight work.

## Outcome

Knowledge can validate one immutable Journal event and its predecessor relation
without knowing which Runbook stage, skill, or private adapter produced it.

## Authority And Boundaries

- This Spec approves the portable mechanism only. An adopting instance's
  private authorization decides whether and where it may execute; this file
  does not grant work by existing or name that private packet.
- K-006 is the module-agnostic `grounding-journal` Socket identity. Its public
  contract travels in the Forge registry; its implementation remains in
  Knowledge.
- The primitive owns schema, canonical encoding, sequence/prior digest,
  idempotency, replay, retention, and recovery validation. Orchestration remains
  the sole lifecycle tree mutator.
- It never authorizes work, mutates lifecycle state alone, captures Projection,
  publishes private envelopes, or hard-codes any of the seven stage names.
- The first slice retains the migration event. The R6 extension accepts generic
  schema-v2 lifecycle events and exact recovery/projector inputs without
  authorizing or mutating lifecycle state.

## Vertical Implementation Slices

| Ticket | FUID | Slice | Status | Blockers | Created | Last worked | Proof |
|---|---|---|---|---|---|---|---|
| TK-001 | 000088 | Implement and test the stage-agnostic grounding-journal primitive. | done | none | 2026-08-28 | 2026-08-30 | Seven focused fixtures and integrated engine coverage passed; the repaired portable artifact passed independent acceptance and recovery read-back. |

## Acceptance Criteria

- [x] Missing, duplicated, reordered, or prior-digest-mismatched events fail closed.
- [x] Canonical encoding and digest results are deterministic.
- [x] State-without-event and event-without-state plans are rejected.
- [x] Public source and fixtures reject private operational fields and identity-leaking digests.
- [x] No stage name is required by the primitive API.
- [x] Schema-v2 lifecycle events retain deterministic pairing and digest rules.
- [x] Schema-v2 types require dot-separated lowercase segments while allowing internal hyphens.
- [x] Recovery distinguishes exact, mismatched, and invalid chains; journal-health Projection is fresh only for exact recovery.

## Grounding

| Date | Event | Verification | Files | Next gate |
|---|---|---|---|---|
| 2026-08-28 | Portable Canon issuance | K-006, local ownership, the first slice, and the module-agnostic registry boundary are explicit. | This Spec only; no source, runtime, or adopting-instance identity exists here. | Obtain an accepted private grant from the adopting instance before execution. |
| 2026-08-28 | Portable mechanism acceptance | Independent review found no disclosure or contract defect across the generic controls. | Portable Spec and generated projection only; no adopting-instance identity, binding, source, or runtime. | Bind one scoped implementation ticket under adopting-instance passage gates. |
| 2026-08-28 | Scoped implementation started | An adopting instance supplied private passage proof and opened one synthetic primitive slice. | Public record contains no private repository, actor, ref, receipt, or runtime identity. | Red/green canonical Journal validation and pairing. |
| 2026-08-28 | Portable source checkpoint | Canonical digest, paired-state, privacy, replay, duplicate, reorder, and prior-digest fixtures pass 5/5. | Contract, source, tests, and this Spec. | Independent fixed-candidate review after the adopting instance launches its finish plan. |
| 2026-08-28 | Integrated durable tracer | The Knowledge validator supplies the canonical event/state pair consumed by the disposable direct-descendant lifecycle CAS fixture. | Source, five focused fixtures, integrated Orchestration fixture, and this Spec. | Push the integrated candidate for independent fixed-SHA review. |
| 2026-08-29 | R6 Journal extension | RED failed on absent recovery/projector exports. GREEN validates generic schema-v2 events, exact expected digests, and deterministic journal-health captures while Orchestration remains sole mutator. | Journal contract/source, seven focused fixtures, integrated engine, and this Spec. | Push and obtain independent fixed-SHA review. |
| 2026-08-29 | Historical validation repair | RED proved the nominally invalid `not-valid` type was accepted and a forbidden historical payload could escape tip-only recovery checks. GREEN requires a dotted type and lets Orchestration apply this validator to each introducing state pair. | Journal contract/source/test and integrated engine fixture. | Push the changed candidate for fresh independent review. |
| 2026-08-30 | completion reconciliation | Reconciled the portable primitive with accepted adopting-instance delivery; no source changed here. | Independent repaired-candidate PASS, focused/full gates, non-force delivery, and exact recovery read-back; status/ticket truth only. | none; adopting instances own flight completion. |
