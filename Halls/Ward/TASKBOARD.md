# Personal Intelligence Platform - Taskboard

**Current focus:** Keep the shared OpenBrain and CIC integration contract healthy; PIP now also owns a defined (not yet implemented) cross-model retrieval transport contract.
**Owner:** Kayden plus active agents
**Last updated:** 2026-07-21

This is an active execution projection, not a requirements store or proof archive.

## Active Specs

<!-- hot-specs:start -->
| Spec | Current slice | Owner | Blocker | Latest meaningful event | Next gate |
|---|---|---|---|---|---|
| [S-001](specs/S-001-cross-model-retrieval-transport/SPEC.md) | TK-002: Implement one authenticated, read-only adapter round trip against a fake OpenBrain provider. (blocked) | Personal Intelligence Platform Engineer | TK-001 is satisfied; TK-002 remains blocked on OpenBrain `S-003/TK-003` provenance/freshness contract completion. | TK-001 closed: committed the transport contract, fixture, and dependency graph at `contracts/pip-retrieval-*`. | Wait for OpenBrain `S-003/TK-003`, then claim TK-002 against a fake provider. |
<!-- hot-specs:end -->

## Executive Brief

- **Shipping now:** private platform controls, authoritative query contract, compatibility checks, CIC-visible health, and a defined (not yet implemented) PIP-owned cross-model retrieval transport contract at `contracts/pip-retrieval-*`.
- **Health:** green - portable doctor, compatibility, freshness, and isolated CIC checks pass.
- **Decision needed:** none.
- **Blocked on:** OpenBrain `S-003/TK-003` before the adapter can implement a live provider round trip (TK-002/TK-003).
- **Next milestone:** implement one authenticated, read-only adapter round trip against a fake OpenBrain provider (TK-002) once OpenBrain `S-003/TK-003` lands.

## Pending Decisions

| ID | Decision | Options | Recommendation | Cost / impact | Owner | Status |
|---|---|---|---|---|---|---|
| none | No open owner decision | - | - | - | - | resolved |

## Status Values

| Status | Meaning |
|---|---|
| ready | clear to start |
| claimed | selected before edits |
| in-progress | implementation underway |
| gated | awaiting verification or merge |
| needs-review | owner review required |
| blocked | named blocker prevents progress |
| deferred | intentionally later |
| done | proof and docs complete |

## In Progress

| ID | Priority | Task | Owner | Started | Current note | Proof required | Status |
|---|---:|---|---|---|---|---|---|
| none | - | No active claimed task | - | - | - | - | - |

## Ready

| ID | Priority | Task | Source / why now | Proof required | Owner | Status |
|---|---:|---|---|---|---|---|
| none | - | No ready task; S-001/TK-002 is blocked on OpenBrain `S-003/TK-003` | - | - | - | - |

## Blocked

| ID | Task / area | Blocked on | Evidence | Next action | Owner | Status |
|---|---|---|---|---|---|---|
| S-001/TK-002 | Implement one authenticated, read-only adapter round trip against a fake OpenBrain provider | OpenBrain `S-003/TK-003` (source filters plus provenance/freshness response fields), itself blocked on OpenBrain `S-002` and `S-004` | OpenBrain `specs/S-003-retrieval-query-contract/SPEC.md` TK-003/TK-004 rows; `contracts/pip-retrieval-dependency-graph.json` | Wait for OpenBrain `S-003/TK-003` to land, then claim TK-002 | PIP Engineer | blocked |

## Deferred

| ID | Task | Deferred until | Why it matters | Revisit trigger |
|---|---|---|---|---|
| D-001 | Schedule recurring platform health | manual health proves stable first | automatic freshness would improve the CIC card | owner requests scheduling |

## Done

| ID | Task | Completed | Result | Proof row |
|---|---|---|---|---|
| T-001 | Bootstrap the private platform repository | 2026-07-12 | pass: private remote, six controls, manifest, workspace, and verifier | 2026-07-12 T-001-T-004 |
| T-002 | Establish the authoritative OpenBrain retrieval contract | 2026-07-12 | pass: OpenBrain PR #4 merged into `integration` at `7986a93` | 2026-07-12 T-001-T-004 |
| T-003 | Prove CIC compatibility and platform health rendering | 2026-07-12 | pass: CIC PR #11 merged into `Integration` at `f92aa1a` | 2026-07-12 T-001-T-004 |
| T-004 | Run portable and optional live platform health | 2026-07-12 | pass: atomic report and CIC-visible health verified | 2026-07-12 T-001-T-004 |
| T-005 | Follow the GPT_OS Foundry repository topology | 2026-07-18 | pass: manifest, workspace, doctor, and health resolve OpenBrain and CIC under `Foundry/` | 2026-07-18 T-005 |
| S-001/TK-001 | Define the PIP-to-OpenBrain transport, auth, provenance/freshness propagation, client identity, and disable/recovery contract | 2026-07-21 | pass: `contracts/pip-retrieval-transport.openapi.json`, `contracts/pip-retrieval-transport.fixture.json`, and `contracts/pip-retrieval-dependency-graph.json` committed; doctor and 15/15 tests validate them | 2026-07-21 S-001/TK-001 |

## Proof Log

| Date | Task ID | Agent | Proof | Demo | Result | Docs | Remaining gap |
|---|---|---|---|---|---|---|---|
| 2026-07-12 | T-001-T-004 | Codex | Private GitHub remote created; platform tests 4/4, doctor healthy, portable health healthy, and evaluator 85.1/113 vs controls 0/113 and 2/113. OpenBrain PR #4 merged at `7986a93`; CIC PR #11 merged at `f92aa1a` after 169 tests, 4/4 browser smoke, build, audit, and desktop/mobile in-app Browser QA. | Run `npm run health`, then open CIC System Health to see the Personal Intelligence Platform card | pass | Added all six controls and aligned OpenBrain, CIC, GPT_OS routing, and Machine wiki docs | Live retrieval was skipped because credentials were not supplied; portable health and current OpenBrain scheduler freshness are green. |
| 2026-07-18 | T-005 | Codex | `npm run doctor`, `npm test`, and `npm run health` resolve the relocated repositories from `Foundry/`; environment overrides remain supported. | Run `npm run doctor` from this repository | pass | Updated the manifest, multi-root workspace, README, and runbook for the Foundry topology | Live credentials were not needed; portable platform verification remains the contract. |
| 2026-07-21 | S-001/TK-001 | Claude | Defined the MCP-compatible `/pip/retrieve` transport contract (OpenAPI 3.1) covering client-identity auth (a PIP-issued per-client token, never OpenBrain's own bearer token), provenance/freshness propagation with an explicit `unknown` fallback while OpenBrain `S-003/TK-003` remains incomplete, and a fail-closed disable/unreachable/unauthorized/invalid contract that never fabricates results. Added a committed fixture covering all six required states and a dependency graph linking PIP `S-001` to OpenBrain `S-002`, `S-004`, `S-003`, and `S-005`. New `scripts/transport-contract-lib.mjs` validates all three artifacts; wired into `npm run doctor`. `npm test` 15/15 pass (5 pre-existing + 10 new), `npm run doctor` healthy, `npm run health` portable (degraded only on OpenBrain scheduler freshness, expected per `RUNBOOK.md` without local scheduler state). | Run `npm run doctor` from this repository | pass | Updated this Taskboard, `specs/S-001-cross-model-retrieval-transport/SPEC.md`, and `BLUEPRINT.md` Main Contracts table | TK-001 is implementation-free by design; TK-002 (a live/fake provider round trip) remains blocked on OpenBrain `S-003/TK-003`, which is itself blocked on OpenBrain `S-002` and `S-004`. |
