# S-004 - Job Order Flight Observation Feed

> Generated from LLM Workbench v2.3. This stable path never moves.

**Spec ID:** S-004
**FUID:** 00009O
**Status:** planned
**Priority:** 0
**Owner:** Unassigned
**Created:** 2026-08-30
**Last worked:** 2026-08-30
**Updated:** 2026-08-30
**Catalog description:** Publish a privacy-safe Gauge observation feed for real seven-stage Job Order flights derived from lifecycle, Journal-health, and passage Actuality.
**Blockers:** S-003 complete and adopting-instance Lighthouse acceptance
**Latest event:** Canon and one repository-local vertical slice were promoted; no implementation began.
**Next gate:** the adopting instance issues and accepts the feed slice after Lighthouse live acceptance.

## Outcome

Gauge publishes the current stage and recovery disposition of genuine Job Order
flights from authoritative lifecycle, Journal-health, and passage projections.
The feed never executes work, grants authority, infers a stage from prose, or
turns Schematic simulation into Actuality.

## Decisions And Contracts

- One ordered stage enum covers Sitrep, Preflight, Launch-flight, In-flight,
  Landing-check, Land, and PostFlight-check plus blocked, recovery-required,
  delivered-unclosed, and terminal dispositions.
- Each observation binds Job Order/revision, Run, stage/event sequence, source
  lifecycle commit, Journal digest, passage receipt reference, observed time,
  freshness, recovery state, and redacted display fields.
- Missing, conflicting, stale, out-of-order, privacy-unsafe, or unrecoverable
  inputs fail closed and remain visible as findings.
- Public mechanisms and synthetic fixtures contain no private instance records.

## Non-Goals

- A second lifecycle store, orchestration engine, CIC database, Schematic
  animation, install, runtime binding, or authority grant.

## Vertical Implementation Slices

| Ticket | FUID | Slice | Status | Blockers | Created | Last worked | Proof |
|---|---|---|---|---|---|---|---|
| TK-001 | 00009P | Define and emit the redacted flight observation contract from lifecycle, Journal-health, and passage projections, including deterministic recovery and privacy fixtures. | blocked | S-003 complete; adopting-instance Lighthouse acceptance | 2026-08-30 | 2026-08-30 | Planning only; the private adopting instance owns execution authority. |

## Acceptance Criteria

- [ ] All seven stages and blocked/recovery/delivered-unclosed/terminal states
      validate with monotonic sequence and exact provenance.
- [ ] Missing or conflicting projection inputs remain findings and never become
      a guessed stage.
- [ ] Privacy fixtures reject private paths, refs, actors, topology, payloads,
      credentials, and identity-leaking derived values.
- [ ] Exact candidate passes independent audit and remote `integration`
      read-back while `main` remains unchanged.

## Testing Seams

Schema/event-sequence fixtures; lifecycle/Journal/passage joins; crash and
duplicate recovery; privacy scan; exact-ref no-mutation and recovery proof.

## Documentation Impact

Foundry `BLUEPRINT.md`, `LEXICON.md`, `RUNBOOK.md`, Gauge contracts, this Spec,
and this portable Spec; adopting-instance evidence stays private.

## Append-Only Evidence And Execution Log

| Date | Ticket | Event | Verification | Docs | Remaining gap |
|---|---|---|---|---|---|
| 2026-08-30 | spec | Promoted the settled Flight Rack feed ownership, provenance, failure, privacy, and dependency decisions without implementation. | Portable lifecycle/Projection contract and mechanism state inspected; focused Canon test records this Spec as required. | This portable Spec; private coordination stays outside the product. | Lighthouse acceptance, then adopting-instance issuance. |

## Supersession

- Extends S-003 and the portable lifecycle contracts; prior evidence is unchanged.
