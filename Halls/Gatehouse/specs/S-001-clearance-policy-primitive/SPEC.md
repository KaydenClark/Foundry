# S-001 - Clearance Policy Primitive

> Generated from LLM Workbench v2.3.

**Spec ID:** S-001
**FUID:** 000089
**Status:** complete
**Priority:** 0
**Owner:** Gatehouse
**Created:** 2026-08-28
**Last worked:** 2026-08-30
**Updated:** 2026-08-30
**Catalog description:** Compile and evaluate a stage-agnostic deterministic Clearance policy as a cap on an already Canon-authorized request.
**Blockers:** None in the portable capability; execution still requires an adopting instance's private authorization and passage gates.
**Latest event:** The repaired portable primitive passed its adopting instance's independent acceptance and recovery gates.
**Next gate:** none for the portable primitive; adopting instances own their private flight work.

## Outcome

Gatehouse can evaluate one exact requested transition against versioned policy,
actor class, scope, and named gates without knowing the calling Runbook stage.

## Authority And Boundaries

- This Spec approves the portable mechanism only. An adopting instance's
  private authorization decides whether and where it may execute; this file
  does not grant work by existing or name that private packet.
- `clearance-policy` is an internal deterministic primitive, not a new Socket:
  it caps a request already authorized by Canon and never grants or routes work.
- It accepts only versioned policy, exact request, actor class, exact scope, and
  named gate evidence; it returns allow/deny, policy digest, and denied rule IDs.
- Denial recording is trusted, non-recursive, and cannot retry or admit the
  denied passage. Missing or contradictory input fails closed.
- The evaluator never hard-codes any of the seven stage names. Policy data may
  name arbitrary transition classes under the owning Canon.

## Vertical Implementation Slices

| Ticket | FUID | Slice | Status | Blockers | Created | Last worked | Proof |
|---|---|---|---|---|---|---|---|
| TK-001 | 00008A | Implement and test the stage-agnostic clearance-policy primitive. | done | none | 2026-08-28 | 2026-08-30 | Five focused fixtures and integrated engine coverage passed; the repaired portable artifact passed independent acceptance and recovery read-back. |

## Acceptance Criteria

- [x] Missing, malformed, expired, contradictory, or out-of-scope requests deny before mutation.
- [x] Compiled policy content must reproduce its claimed digest before evaluation.
- [x] Allow is only a cap over the exact existing Job Order grant.
- [x] Denial and owner-command override evidence are deterministic and redacted.
- [x] Public source and fixtures contain no credential or private operational identity.
- [x] No stage name is required by the primitive API.
- [x] Generic claim, handoff, terminal, repair, and parent-ingestion actions remain exact-scope caps rather than grants.
- [x] Denial records are deterministic/redacted and passage Projection requires an exact persisted lifecycle commit.

## Grounding

| Date | Event | Verification | Files | Next gate |
|---|---|---|---|---|
| 2026-08-28 | Portable Canon issuance | Local ownership, the first slice, and the internal-primitive boundary are explicit. | This Spec only; no source, runtime, or adopting-instance identity exists here. | Obtain an accepted private grant from the adopting instance before execution. |
| 2026-08-28 | Portable mechanism acceptance | Independent review found no disclosure or contract defect across the generic controls. | Portable Spec and generated projection only; no adopting-instance identity, binding, source, or runtime. | Bind one scoped implementation ticket under adopting-instance passage gates. |
| 2026-08-28 | Scoped implementation started | An adopting instance supplied private passage proof and opened one synthetic primitive slice. | Public record contains no private repository, actor, ref, receipt, or runtime identity. | Red/green deterministic Clearance evaluation. |
| 2026-08-28 | Portable source checkpoint | Compiler/evaluator fixtures pass 4/4 and remain stage-agnostic and identity-free. | Contract, source, tests, and this Spec. | Independent fixed-candidate review after the adopting instance launches its finish plan. |
| 2026-08-28 | Integrated durable tracer | The deterministic allow result caps one synthetic migration; denied and malformed requests produce no candidate or ref mutation. | Source, four focused fixtures, integrated Orchestration fixture, and this Spec. | Push the integrated candidate for independent fixed-SHA review. |
| 2026-08-29 | Trusted executor binding | RED proved forged allow/digest, wrong actor/grant, missing gate, expired Owner Command, and mismatched compiled-policy digest could advance. GREEN evaluates the trusted Gatehouse context and exact request before any Git read; all seven cases preserve remote bytes. | Policy source/tests, integrated Orchestration source/tests, and this Spec. | Push, pass fresh passage checks, and obtain a new independent cumulative audit. |
| 2026-08-29 | Trust-root binding repair | RED proved a request could substitute evaluator, policy/digest, and grant together and omit exact Job Order revision binding. GREEN uses the real evaluator from a snapshotted adopting-instance factory; substituted trust fields and wrong synthetic Job Order ID/revision reject before Git reads and preserve remote bytes. | Integrated Orchestration source/tests and this Spec; Gatehouse evaluator source is unchanged. | Push, pass fresh passage checks, and obtain a new independent cumulative audit. |
| 2026-08-29 | R6 denial and passage hooks | RED failed on absent denial-record/projector exports. GREEN derives one redacted stable denial identity, keeps denied targets denied if persistence fails, and permits passage Projection only from an exact accepted lifecycle commit. | Policy/contract/source, five focused fixtures, integrated denial fixtures, and this Spec. | Push and obtain independent fixed-SHA review. |
| 2026-08-30 | completion reconciliation | Reconciled the portable primitive with accepted adopting-instance delivery; no source changed here. | Independent repaired-candidate PASS, focused/full gates, non-force delivery, and exact recovery read-back; status/ticket truth only. | none; adopting instances own flight completion. |
