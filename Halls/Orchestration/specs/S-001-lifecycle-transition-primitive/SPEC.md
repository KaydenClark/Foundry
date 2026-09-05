# S-001 - Lifecycle Transition Primitive

> Generated from LLM Workbench v2.3.

**Spec ID:** S-001
**FUID:** 000085
**Status:** complete
**Priority:** 0
**Owner:** Orchestration
**Created:** 2026-08-28
**Last worked:** 2026-08-30
**Updated:** 2026-08-30
**Catalog description:** Provide a stage-agnostic lifecycle transition primitive that validates one exact request and plans one atomic state-plus-Journal commit.
**Blockers:** None in the portable capability; execution still requires an adopting instance's private authorization and passage gates.
**Latest event:** The repaired portable primitive passed its adopting instance's independent acceptance and recovery gates.
**Next gate:** none for the portable primitive; adopting instances own their private flight work.

## Outcome

Orchestration can validate and plan one cooperative exact-tip lifecycle mutation
without knowing which Runbook stage or skill requested it.

## Authority And Boundaries

- This Spec approves the portable mechanism only. An adopting instance's
  private authorization decides whether and where it may execute; this file
  does not grant work by existing or name that private packet.
- K-005 is the module-agnostic `lifecycle-transition` Socket identity. Its
  public contract travels in the Forge registry; its implementation remains in
  Orchestration.
- The adopting instance creates one executor with the real Gatehouse evaluator,
  versioned policy provenance, synthetic Job Order identity/revision, exact
  grant, gate evidence, and Knowledge contract bound once. The untrusted
  request supplies only transition facts and a claimed Clearance result.
- It returns a canonical tree plan or deterministic findings. It never claims,
  widens scope, accepts its own work, lands to `main`, or hard-codes
  `/sitrep`, `/preflight`, `/launch-flight`, `/in-flight`, `/landing-check`,
  `/land`, or `/postflight-check` behavior.
- The bootstrap API remains v1-unclaimed to v2-unclaimed. The separate engine
  API adds generic claim, handoff, terminal, one-attempt repair, parent/child,
  exact receipt/recovery, and post-commit projector hooks without encoding a
  Runbook stage or granting a normal flight.

## Vertical Implementation Slices

| Ticket | FUID | Slice | Status | Blockers | Created | Last worked | Proof |
|---|---|---|---|---|---|---|---|
| TK-001 | 000086 | Implement and test the stage-agnostic lifecycle-transition primitive. | done | none | 2026-08-28 | 2026-08-30 | Focused hostile-input and lifecycle suites passed; the repaired portable artifact passed independent acceptance and recovery read-back. |

## Acceptance Criteria

- [x] Invalid schema, scope, policy, Journal, and expected-tip inputs fail before mutation.
- [x] Caller Clearance claims must match trusted Gatehouse evaluation over the exact actor, grant, gates, time, policy, and Owner Command.
- [x] Requests cannot replace the evaluator, policy/digest, Job Order identity/revision, grant, or gates bound by the adopting-instance executor factory.
- [x] The fetched tree's canonical state, Journal history, and target event vacancy bind every candidate before mutation.
- [x] Every historical event is immutable and validates against its predecessor and lifecycle state at its unique introducing commit.
- [x] Every on-disk event is canonical raw JSON and remains byte-identical to its unique introduction; semantic rewrites fail before idempotency or mutation.
- [x] Duplicate historical event identities invalidate the boundary before idempotency lookup or push.
- [x] Schema-v1 authoritative state rejects any nonempty Journal history.
- [x] One direct-descendant plan and commit contain lifecycle state and exactly one Journal event together.
- [x] Accepted, conflict, ambiguous, retryable pre-CAS, and recovery-required outcomes are deterministic.
- [x] Public source and fixtures contain no private path, repo, actor, ref, or runtime identity.
- [x] No stage name is required by the primitive API.
- [x] Claim, handoff, and terminal changes commit one state-plus-Journal pair and return an exact recovery receipt.
- [x] Denied targets stay denied while one non-recursive denial event is persisted or reported `deny-unrecorded`.
- [x] Repair is scope-keyed and limited to one attempt; parent/child ingestion is idempotent and conflicting reuse requires recovery.
- [x] A child's first receipt is immutable; only canonical equality is idempotent, including event identity and payload digest.
- [x] A lifecycle commit identifies exactly one canonical child receipt; cross-child/event reuse or conflicting fields require recovery without parent mutation.
- [x] Malformed parent receipt maps, including null, arrays, bad entries, duplicate children, duplicate lifecycle commits, or key/identity mismatch, return recovery-required without throwing or mutation.
- [x] Git scratch uses a fixed validated neutral root, fresh owner-only child, and explicit discovery ceiling independent of ambient temp variables.
- [x] Projection hooks run after commit; failure never rolls back authority and blocks closure.

## Grounding

| Date | Event | Verification | Files | Next gate |
|---|---|---|---|---|
| 2026-08-28 | Portable Canon issuance | K-005, local ownership, the first slice, and the module-agnostic registry boundary are explicit. | This Spec only; no source, runtime, or adopting-instance identity exists here. | Obtain an accepted private grant from the adopting instance before execution. |
| 2026-08-28 | Portable mechanism acceptance | Independent review found no disclosure or contract defect across the generic controls. | Portable Spec and generated projection only; no adopting-instance identity, binding, source, or runtime. | Bind one scoped implementation ticket under adopting-instance passage gates. |
| 2026-08-28 | Scoped implementation started | An adopting instance supplied private passage proof and opened one synthetic primitive slice. | Public record contains no private repository, actor, ref, receipt, or runtime identity. | Red/green the stage-agnostic transition plan. |
| 2026-08-28 | Portable source checkpoint | Exact-scope validation, atomic two-write planning, fail-closed inputs, and cooperative outcome classification pass 4/4. | Contract, source, tests, and this Spec. | Independent fixed-candidate review after the adopting instance launches its finish plan. |
| 2026-08-28 | Durable CAS tracer | A caller-configured disposable Git ref advances by one non-force direct-descendant commit containing both required writes; stale, denied, malformed, unsafe, and rejected attempts preserve the authoritative tip. | Contract, source, seven focused fixtures, and this Spec. | Push the exact candidate for independent fixed-SHA review. |
| 2026-08-28 | Authoritative tree-binding repair | RED proved missing or mismatched state, pre-existing first-event history, an occupied target path, and a fabricated predecessor could overwrite the fetched tree. GREEN authenticates and parses the exact fetched boundary before planning; all adversarial attempts preserve the authoritative tip and tree. | Contract, source, twelve focused fixtures, and this Spec. | Push the changed candidate for fresh independent fixed-SHA review. |
| 2026-08-28 | V1 boundary consistency repair | RED proved a valid matching predecessor beside v1 state could advance sequence 2. GREEN rejects any nonempty Journal namespace while the authoritative fetched state is schema v1; the exact remote ref and tree remain unchanged. | Contract, source, thirteen focused fixtures, and this Spec. | Push the changed candidate for fresh independent fixed-SHA review. |
| 2026-08-29 | Gatehouse binding repair | RED proved seven forged or stale Clearance inputs advanced disposable refs. GREEN invokes the trusted evaluator, binds its decision and policy digest to the claim, and rejects every denial or provenance mismatch before Git access. | Contract, source, twenty-one focused test outcomes, and this Spec. | Push, pass fresh passage checks, and obtain a new independent cumulative audit. |
| 2026-08-29 | Clearance trust-root repair | RED proved the request seam could substitute its evaluator, policy/digest, and grant and lacked exact Job Order revision binding. GREEN exposes only an adopting-instance factory, snapshots its mechanism-only trust configuration, invokes the real Gatehouse evaluator, and rejects trust fields or wrong synthetic Job Order identity/revision before Git reads; all attempts preserve remote bytes. | Contract, source, twenty-five focused outcomes, and this Spec. | Push, pass fresh passage checks, and obtain a new independent cumulative audit. |
| 2026-08-29 | R6 engine candidate | RED failed on the missing engine export, then the adversarial local `insteadOf` fixture reached the forged remote. GREEN binds durable Git and all trust at factory creation, rejects repository-local transport controls before lifecycle reads, and proves exact-tip claim, handoff, terminal, denial, repair, parent, receipt/recovery, idempotency, and post-commit Projection behavior with disposable refs. | Engine source/contract, six integrated fixtures, bootstrap regression suite, and this Spec. | Push and obtain independent fixed-SHA review; no normal flight or adoption claim exists yet. |
| 2026-08-29 | Historical Journal audit repair | Independent audit found tip-only recovery could advance after a malformed disclosure-unsafe historical event. RED reproduced the advance; GREEN reconstructs each event's unique introducing state pair and runs the Knowledge validator before remote mutation. | Engine source/contract, seven integrated fixtures, bootstrap regression suite, and this Spec. | Push the changed candidate for fresh independent review. |
| 2026-08-29 | Duplicate identity audit repair | Independent audit found two individually valid historical entries could reuse one event identity and still advance. RED reproduced the third transition; GREEN invalidates duplicate identity before idempotency lookup or push. | Engine source/contract, eight integrated fixtures, bootstrap suite, and this Spec. | Push the changed candidate for fresh independent review. |
| 2026-08-29 | Parent identity and scratch audit repair | Independent audit found a child receipt rewrite and ambient temp-root trust. RED reproduced both; GREEN requires canonical child receipt equality and validated fixed-root scratch. | Engine source/contract, nine integrated fixtures, bootstrap suite, and this Spec. | Push the changed candidate for fresh independent review. |
| 2026-08-29 | Raw-byte and parent-map audit repair | RED proved pretty-print/key-order rewrites reached idempotency and null parent receipts threw. GREEN binds canonical raw bytes to their unique introduction and returns recovery-required for malformed receipt maps without mutation. | Engine source, hostile integrated fixtures, Runbook, and this Spec. | Push the changed candidate for fresh independent review. |
| 2026-08-29 | Cross-child commit-identity audit repair | RED proved one lifecycle commit could be accepted for a different child receipt. GREEN permits only exact canonical-receipt idempotency and rejects every conflicting reuse or duplicate-commit history without mutation. | Engine source, direct adversarial fixtures, Runbook, and this Spec. | Push the changed candidate for fresh independent review. |
| 2026-08-30 | completion reconciliation | Reconciled the portable primitive with accepted adopting-instance delivery; no source changed in this planning checkpoint. | Independent repaired-candidate PASS, focused/full gates, non-force delivery, and exact recovery read-back; status/ticket/projection truth only. | none; adopting instances own flight completion. |
