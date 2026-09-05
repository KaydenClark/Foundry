# S-002 - FUID Registry And Lifecycle

> Generated from LLM Workbench v2.3. This stable path never moves.

**Spec ID:** S-002
**FUID:** 000002
**Status:** complete
**Priority:** 0
**Owner:** Codex
**Created:** 2026-08-18
**Last worked:** 2026-08-18
**Updated:** 2026-08-18
**Catalog description:** Extend the Foundry identity registry and Workbench lifecycle with fixed-width base36 FUID allocation, aliases, and Created/Last worked metadata.
**Blockers:** none
**Latest event:** Spec completed and removed from the hot board.
**Next gate:** none

## Outcome

The portable Foundry validates permanent fixed-width FUIDs and provides the
Workbench behavior needed to allocate and resolve Project/Spec/Ticket identities
against an explicit canonical registry while preserving typed aliases and
lifecycle dates.

## Why It Matters

S-001 established opaque permanent identities but not monotonic allocation,
Project/Spec/Ticket coverage, or lifecycle dates. A portable schema and tool
contract are required before an instance or CIC can safely consume them.

## Decisions And Contracts

- Four-character FUIDs cover architectural/Workshop identities; six-character
  FUIDs cover work/runtime identities.
- Sequential allocation is fixed-width base36, reserves zero, never reuses an
  active or retired value, and preserves pre-sequence opaque IDs.
- The portable registry owns Foundry product entities and allocator rules. An
  instance registry owns private Projects and work allocations; the validator
  composes them without publishing private contents.
- Typed aliases remain unique resolvable compatibility handles.
- Specs carry FUID, Created, Last worked, and Updated compatibility metadata;
  Ticket rows carry FUID, Created, and Last worked alongside the typed ticket
  alias.
- Render/read operations do not update Last worked. Claim, close, complete,
  and explicit content/lifecycle mutation do.

## Non-Goals

- Replacing existing Foundry FUIDs or bulk-renaming paths.
- Publishing an instance's private Project/Spec/Ticket roster in the Foundry
  product artifact.
- Allocating from Recall or a generated projection.

## Vertical Implementation Slices

| Ticket | FUID | Slice | Status | Blockers | Created | Last worked | Proof |
|---|---|---|---|---|---|---|---|
| TK-001 | 00000A | Add red/green registry validation and fixed-width base36 allocation/resolution contracts, including rollover, zero, occupied, retired, alias, and instance-extension cases. | done | none | 2026-08-18 | 2026-08-18 | Red: allocator export absent. Green: identity registry suite passes base36 rollover, zero reservation, collision skipping, exhaustion, external composition, aliases, parents, and dates. |
| TK-002 | 00000B | Extend the Workbench parser and lifecycle operations for Spec/Ticket FUIDs, Created, and Last worked while keeping Updated and typed-reference compatibility. | done | TK-001 | 2026-08-18 | 2026-08-18 | Red/green Workbench tests pass in both Foundry tool lanes; migration test proves Git-derived dates, fixed-width allocation, scoped aliases, unrelated-table preservation, and idempotency. |
| TK-003 | 00000C | Add a deterministic reviewable migration/validation command for instance Specs and Tickets and verify portable publication excludes instance allocations. | done | TK-002 | 2026-08-18 | 2026-08-18 | Migration command planned then applied 33 GPT_OS, 2 Foundry, and 15 CIC Specs; second dry run produced zero changes; instance registry validates; portable Foundry registry contains no private instance work allocations. |

## Acceptance Criteria

- [x] Registry tests prove fixed-width base36 order and no reuse.
- [x] External instance allocations validate without entering the portable
      product registry or published artifact.
- [x] Workbench operations preserve Created and update Last worked only for
      substantive actions.
- [x] Existing typed aliases and pre-sequence opaque IDs still resolve.
- [x] Migration output is deterministic, reviewable, and globally unique.

## Testing Seams

- Pure allocator/resolver unit tests.
- Registry fixture composition and publication-boundary tests.
- Workbench lifecycle red/green tests and migration fixtures.

## Documentation Impact

- Foundry `LEXICON.md`, `BLUEPRINT.md`, `RUNBOOK.md`, registry manifest/schema,
  Workbench tools/tests, and this spec.

## Append-Only Evidence And Execution Log

| Date | Ticket | Event | Verification | Docs | Remaining gap |
|---|---|---|---|---|---|
| 2026-08-18 | spec | Created as the Foundry product leg of root S-036. | Existing S-001 registry, validator, tests, manifest, and Workbench tool were read before planning. | This spec. | Render, doctor, checkpoint, and preflight TK-001. |
| 2026-08-18 | TK-001 | Ticket closed | Red: allocator export absent. Green: identity registry suite passes base36 rollover, zero reservation, collision skipping, exhaustion, external composition, aliases, parents, and dates. | Foundry LEXICON.md, BLUEPRINT.md, registry schema, S-002, and S-036 updated. | TK-002 Workbench lifecycle metadata remains. |
| 2026-08-18 | TK-002 | Ticket closed | Red/green Workbench tests pass in both Foundry tool lanes; migration test proves Git-derived dates, fixed-width allocation, scoped aliases, unrelated-table preservation, and idempotency. | Foundry LEXICON.md and BLUEPRINT.md define FUID and lifecycle semantics; RUNBOOK.md update remains in TK-003. | TK-003 must close migration/publication proof. |
| 2026-08-18 | TK-003 | Ticket closed | Migration command planned then applied 33 GPT_OS, 2 Foundry, and 15 CIC Specs; second dry run produced zero changes; instance registry validates; portable Foundry registry contains no private instance work allocations. | Foundry RUNBOOK.md documents lifecycle and private-instance migration boundary; root RUNBOOK.md documents plan/apply operation. | none |
| 2026-08-18 | spec | Spec completed | Acceptance gates satisfied | Documentation impact recorded above | none |

## Completion Result

Pass: Foundry now supplies fixed-width base36 allocation and validation,
FUID-aware Workbench lifecycle behavior, and an explicit boundary that keeps
private instance allocations out of the portable product registry.

## Supersession

- Refines S-001; its completed thirteen-Hall and passage-contract evidence is
  unchanged.
