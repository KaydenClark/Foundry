# S-001 - Cross-Model Retrieval Transport

> Generated from LLM Workbench v2.3. This stable path never moves.

**Spec ID:** S-001
**Status:** active
**Priority:** 2
**Owner:** Personal Intelligence Platform Engineer
**Updated:** 2026-07-21
**Catalog description:** Provide the MCP-compatible, read-only transport that lets approved clients consume OpenBrain retrieval without receiving backend credentials.
**Blockers:** OpenBrain `S-003/TK-003` provenance/freshness contract completion (blocks TK-002/TK-003 implementation only; TK-001's contract definition is unblocked and done).
**Latest event:** TK-001 closed: committed the `/pip/retrieve` transport contract, fixture, and dependency graph under `contracts/`.
**Next gate:** Wait for OpenBrain `S-003/TK-003`, then claim TK-002 to implement one round trip against a fake OpenBrain provider.

## Outcome

Approved clients use one PIP-owned, read-only MCP-compatible adapter to query
OpenBrain. The adapter preserves provider provenance and freshness, keeps
credentials server-side, and can be disabled without altering canonical
Markdown/Git or OpenBrain ingestion.

## Decisions And Contracts

- PIP owns the MCP-compatible cross-model transport; OpenBrain remains the
  private retrieval backend and canonical-source mirror.
- The first adapter is private and authenticated for Kayden's own agents/apps,
  not a public or third-party API.
- It is read-only. Project/task changes remain Git/Markdown work fulfilled by
  agents; no direct canonical writes pass through the transport.
- REST/Edge-function compatibility remains available. The eventual external
  surface shape and detailed auth scheme remain a later capability decision.

## Dependencies And Boundaries

- OpenBrain `S-003` supplies the provider request/provenance/freshness
  contract; its `S-005` now links here for implementation.
- CIC is a consumer and UI; it does not own the transport or receive privileged
  browser credentials.
- This spec does not authorize live credentials, deployment, database writes,
  or public exposure.

## Vertical Implementation Slices

| Ticket | Slice | Status | Blockers | Proof |
|---|---|---|---|---|
| TK-001 | Define the PIP-to-OpenBrain transport, auth, provenance/freshness propagation, client identity, and disable/recovery contract. | done | none | Contract fixture and documented dependency graph prove no client gets backend credentials. |
| TK-002 | Implement one authenticated, read-only adapter round trip against a fake OpenBrain provider. | blocked | TK-001, OpenBrain S-003 | Red/green protocol tests prove request validation and metadata propagation. |
| TK-003 | Prove two approved client fixtures plus disable/recovery behavior. | blocked | TK-002 | Two secret-free client smokes and an under-one-minute disabled-path demo. |

## Acceptance Criteria

- [x] Adapter ownership, privacy boundary, and disable behavior are explicit.
- [x] Approved clients cannot access service-role or provider credentials (proven at the contract-definition level by TK-001's fixture; TK-002/TK-003 still owe implementation-level proof against a running adapter).
- [x] Provenance and freshness survive translation (including an explicit `unknown` fallback while OpenBrain has not yet shipped truthful freshness fields).
- [ ] Two approved clients pass the same read-only contract.

## Append-Only Evidence And Execution Log

| Date | Ticket | Event | Verification | Docs | Remaining gap |
|---|---|---|---|---|---|
| 2026-07-19 | spec | Promoted the already-locked PIP adapter ownership decision from OpenBrain's 2026-07-17 grilling. | OpenBrain `S-005` decision/evidence and PIP's existing coordination boundary reviewed; no implementation behavior claimed. | Added first PIP stable capability record. | Define and implement the transport under this spec. |
| 2026-07-21 | TK-001 | Defined the `/pip/retrieve` MCP-compatible transport: client-identity bearer auth distinct from OpenBrain's own bearer token, a provenance/freshness envelope on every result with an explicit `unknown` status when the upstream contract does not yet supply one (OpenBrain `S-003/TK-003` is still blocked on `S-002`/`S-004`), and a fail-closed error contract for `adapter_disabled` (local kill switch, checked before any client-identity or upstream call), `upstream_unreachable`, `unauthorized_client`, and `invalid_request` — none of which may return fabricated results. Read OpenBrain `S-003`/`S-005` SPEC.md files and the current `contracts/query-wiki.openapi.json` read-only before writing this contract; touched no OpenBrain or CIC files. | `contracts/pip-retrieval-transport.openapi.json`, `contracts/pip-retrieval-transport.fixture.json` (6/6 required states), and `contracts/pip-retrieval-dependency-graph.json` (10 nodes, 9 edges, acyclic) committed; new `scripts/transport-contract-lib.mjs` validates all three and is wired into `npm run doctor`; `npm test` 15/15 (5 pre-existing, 10 new red/green cases covering missing auth, missing `unknown` freshness, missing required state, leaked credential-shaped field, and fabricated fail-closed results); `npm run doctor` and `npm run health` (portable) pass. | This Taskboard, this spec's status/acceptance/evidence, and `BLUEPRINT.md` Main Contracts updated. | TK-002 (a round trip against a fake provider) and TK-003 (two client fixtures plus disable/recovery demo) remain blocked on OpenBrain `S-003/TK-003`; the fourth acceptance criterion (two approved clients passing the same contract) needs that implementation. |

## Completion Result

TK-001 done: the transport, auth, provenance/freshness propagation, client-identity, and disable/recovery contract is committed and verified. The spec itself remains active/pending — TK-002 and TK-003 still owe implementation-level proof once OpenBrain `S-003/TK-003` lands.

