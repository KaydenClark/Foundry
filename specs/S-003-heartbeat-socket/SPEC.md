# S-003 - Heartbeat Socket

> Generated from LLM Workbench v2.3. This stable path never moves.

**Spec ID:** S-003
**FUID:** 00009K
**Status:** planned
**Priority:** 0
**Owner:** Unassigned
**Created:** 2026-08-30
**Last worked:** 2026-08-30
**Updated:** 2026-08-30
**Catalog description:** Publish one portable FUID-primary Heartbeat Socket and a privacy-safe Gauge feed that exposes current Foundry activity without inventing lifecycle state.
**Blockers:** adopting-instance workflow completion and accepted CIC baseline
**Latest event:** Canon and three repository-local slices were promoted from the settled grilling decisions; no implementation began.
**Next gate:** the adopting instance issues and accepts the registry slice after its dependencies close.

## Outcome

Gauge exposes a declared Heartbeat Socket whose observations distinguish live,
stale, quiet, unavailable, and source-mismatched state. Consumers reach it only
through the socket contract. The existing `6A9G` Activity Signal identity stays
intact. Canon reserves new FUID `000M` for Heartbeat Socket with no `K-002`
alias because K-002 remains the messaging contract; the blocked registry slice
performs the later product mutation.

## Why It Matters

An owner needs to see whether the Foundry is actually working. Process liveness,
HTTP success, Schematic animation, and a task feed cannot prove lifecycle
Actuality. The feed must bind freshness and source while remaining portable and
privacy-safe.

## Decisions And Contracts

- Registry records are FUID-primary; legacy K aliases are compatibility inputs,
  never the schema's primary key.
- Each Foundry emission is one atomic snapshot carrying schema version, socket
  FUID, current L0-L3 load, active-worker count, average and peak reasoning
  effort, the declared cadence, monotonically increasing sequence, emitted
  time, source revision/digest, freshness state, activity class, and redacted
  summary.
- Cadence is deterministic by the highest active load: L0 every 60 seconds, L1
  every 15 seconds, L2 every 5 seconds, and L3 every 1 second.
- The exchange is two-way: CIC acknowledges the exact sequence and returns
  observer health and freshness. One missed expected heartbeat is an immediate
  liveness failure; Lighthouse becomes dark/still while preserving the exact
  last-received time.
- Live activity is derived from verified lifecycle, Journal-health, and passage
  projections. Quiet is a valid state; unavailable or stale never renders live.
- Portable code and fixtures contain no private paths, refs, actors, payloads,
  topology, credentials, or derived identity-leaking digests.
- Gauge owns emission. CIC is a read-only consumer and may not reach into Hall or
  instance files to reconstruct the feed.

## Non-Goals

- A scheduler, keepalive, synthetic pulse, service-health-only light, Schematic
  animation, messaging socket, private binding, install, or CIC rendering.

## Vertical Implementation Slices

| Ticket | FUID | Slice | Status | Blockers | Created | Last worked | Proof |
|---|---|---|---|---|---|---|---|
| TK-001 | 00009L | Materialize Canon-reserved FUID-primary `000M` Heartbeat Socket in the portable socket registry/schema/validator while preserving `6A9G` Activity Signal and K-002 messaging. | blocked | adopting-instance workflow and baseline gates | 2026-08-30 | 2026-08-30 | Planning only; `000M` is not yet present in the product registry. |
| TK-002 | 00009M | Define the versioned portable envelope, validation failures, freshness semantics, privacy boundary, and synthetic fixtures. | blocked | TK-001 | 2026-08-30 | 2026-08-30 | Planning only; the private adopting instance owns execution authority. |
| TK-003 | 00009N | Emit the live privacy-safe Gauge feed from declared projections with no filesystem reach-around and prove stale/quiet/unavailable/source-mismatch behavior. | blocked | TK-002 | 2026-08-30 | 2026-08-30 | Planning only; the private adopting instance owns execution authority. |

## Acceptance Criteria

- [ ] Registry and validator resolve `000M` as Heartbeat Socket, retain `6A9G`
      as Activity Signal, and reject K-002 reuse.
- [ ] Contract fixtures prove atomic load/worker/reasoning snapshots, exact
      60/15/5/1-second cadence, sequence/emitted-time binding, CIC acknowledgement,
      observer health/freshness, one-missed-beat dark/still behavior, and live,
      quiet, stale, unavailable, malformed, and source-mismatched observations.
- [ ] The emitter reads only declared lifecycle/Journal/passage projections and
      fails closed when their freshness or provenance cannot be established.
- [ ] Public-surface privacy scanning rejects instance identity and payload data.
- [ ] Each slice has independent exact-SHA review and remote `integration`
      recovery; `main` remains unchanged.

## Testing Seams

Registry migration and alias-collision fixtures; envelope schema fixtures;
freshness-clock boundaries; deterministic projection adapters; privacy scan;
exact remote recovery and no-mutation checks.

## Documentation Impact

Foundry `BLUEPRINT.md`, `LEXICON.md`, `RUNBOOK.md`, identity/socket manifests,
Gauge contracts and this portable Spec; adopting-instance evidence stays private.

## Append-Only Evidence And Execution Log

| Date | Ticket | Event | Verification | Docs | Remaining gap |
|---|---|---|---|---|---|
| 2026-08-30 | spec | Promoted the settled Heartbeat identity, ownership, feed, privacy, and dependency decisions without implementation. | Live portable registry and K-002 messaging authority inspected; focused Canon test began RED before the new records existed. | This portable Spec; private coordination stays outside the product. | Workflow and CIC baseline prerequisites, then adopting-instance issuance. |

## Supersession

- Extends S-002's registry lifecycle without changing completed evidence.
