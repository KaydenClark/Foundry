---
name: launch-flight
description: Open one manually Steward-serialized bootstrap lane from a passed ticket-level Preflight for an exact Canon-backed Job Order, or fail closed when any bound fact is stale, mismatched, denied, duplicated, out of scope, or unrecoverable.
---

# Launch-flight

Take one exact Job Order from a passed Preflight check into one isolated writer
lane. This bootstrap is model-invocable, but it is not proof that the complete
flight machinery exists. Canon grants scope; Preflight checks facts; the
Steward-authenticated serialization selects one actor and lane.

## Required entry record

Require one record with all of these bindings:

```yaml
canonBinding:
  exactJobOrder: JO-<FUID>/<REVISION>
  spec: <one stable Spec identity>
  ticket: <one ticket identity>
actor: <one agent identity>
role: <one authorized role>
manualSerialization:
  stewardPacketVerified: true
  verifiedByRole: steward
  exactJobOrder: <same canonBinding.exactJobOrder>
  spec: <same canonBinding.spec>
  ticket: <same canonBinding.ticket>
  actor: <same actor>
  role: <same role>
  writerLane:
    worktree: <same writerLane.worktree>
    branch: <same writerLane.branch>
  repositoryIdentity: <same repository.identity>
  recoveryRemote:
    name: <same repository.recoveryRemote.name>
    url: <same repository.recoveryRemote.url>
  recoveryRef:
    ref: <same recoveryRef.ref>
    exists: false
  allowedPaths: <same allowedPaths>
  exclusions: <same exclusions>
  proofExpectations: <same proofExpectations>
writerLane:
  worktree: <one isolated registered worktree>
  branch: <one no-track non-protected branch>
sourceRef: <fresh integration ref and full commit>
targetRef: <same fresh integration ref and full commit>
recoveryRef:
  ref: <refs/heads/ plus writerLane.branch>
  exists: false
repository:
  identity: <exact repository identity>
  recoveryRemote:
    name: <explicit remote name>
    url: <explicit recovery URL>
allowedPaths: <exact Canon-authorized paths>
exclusions: <explicit paths and actions outside this lane>
preflightFacts:
  spec: <same canonBinding.spec>
  ticket: <same canonBinding.ticket>
  exactJobOrder: bootstrap-unavailable
  pass: true
  pushDestination: <same recoveryRef.ref>
  repositories: <complete passed ticket-level repository records>
  blocking: []
  reconcilable: []
  failures: []
proofExpectations: <tests, review, recovery, landing, and read-back required by Canon>
entryFacts:
  laneExists: false
  worktreeExists: false
  branchExists: false
  recoveryRefExists: false
  authoritativeIdempotencyProof: bootstrap-unavailable
exactOrderReceipt: bootstrap-unavailable
lifecycleTip: bootstrap-unavailable
claimFuid: bootstrap-unavailable
runFuid: bootstrap-unavailable
handoffFuid: bootstrap-unavailable
handoffDigest: bootstrap-unavailable
```

Reject blanks, placeholders, inferred values, or a record assembled from
different checks. `checkedAt` is diagnostic; elapsed time never preserves or
invalidates the entry. Facts do.

Ticket-level Preflight binds repository facts to one Spec and ticket; it does
not select an exact Job Order. `preflightFacts.exactJobOrder` must remain
`bootstrap-unavailable`. Only the verified Canon packet and Steward
serialization bind the exact order, actor, lane, repository, recovery boundary,
scope, and proof into one record.

The six `bootstrap-unavailable` fields are permitted only when the exact Canon
issuance explicitly authorizes a manual construction bootstrap. Never allocate,
hash, or synthesize them. A manual serialization is not a Claim, Run, lifecycle
receipt, or closure.

All four absence facts are required for a valid bootstrap entry. A pre-existing
lane or recovery ref, including its worktree or branch, is `recovery-required`
unless a real authoritative lifecycle receipt proves identical idempotent
acceptance. `bootstrap-unavailable` is never an idempotency proof. If real
authoritative proof exists, leave this bootstrap path and follow the lifecycle
mechanism's read-back result instead.

## Recheck immediately before opening the lane

Read the exact Canon issuance and Job Order packet, then independently recheck:

1. `canonBinding`, actor, role, `writerLane`, `repository`, `recoveryRef`,
   `allowedPaths`, `exclusions`, and `proofExpectations` exactly cross-bind to
   the Steward-verified `manualSerialization` packet.
2. `preflightFacts` reports a pass for the same Spec and ticket, keeps its exact
   Job Order unavailable, includes every repository needed to resolve proof,
   reports clean trees and the intended push destination, and contains no
   blocking, reconcilable, or failure finding.
3. The live `sourceRef` and `targetRef` are the same fresh integration ref and
   full commit; `recoveryRef` matches `writerLane.branch`, is absent, and uses
   the bound repository recovery remote.
4. `entryFacts` truthfully records that the named lane, worktree, branch, and
   recovery ref are all absent immediately before creation.
5. No Git lock, live claimant, writer collision, protected destination, denied
   Clearance, new owner gate, credential boundary, or scope growth exists.

Use trusted absolute Git, an explicit remote/ref, and read-only checks. When all
facts match and the lane does not yet exist, create exactly the serialized
registered worktree and no-track branch from the bound source commit. Verify the
branch has no upstream before handing off. Do not edit implementation bytes in
this stage.

Any candidate or target movement invalidates the comparison and requires a new
check. An unreadable or ambiguous remote, lane, receipt history, or recovery
boundary is `recovery-required`, never a reason to guess.

## Deterministic disposition

Evaluate exactly once in this order and stop at the first matching case:
recovery ambiguity; duplicate/pre-existing state; denial; scope growth; stale
live facts; mismatched bindings; then valid. Never let a later case override an
earlier fail-closed result.

<!-- launch-flight-decision-order:v1 recovery-ambiguous>duplicate>denied>scope-growth>stale>mismatched>valid -->
<!-- launch-flight-contract:v1 -->
| Case | Outcome | Next | Required response |
|---|---|---|---|
| valid | bootstrap-ready | `/in-flight` | Emit the bound non-flight bootstrap record. If the next skill is unavailable, name that dependency without claiming it ran. |
| stale | blocked | `/preflight` | A bound live fact moved; rerun the complete ticket-level Preflight and serialization check. |
| mismatched | blocked | `/preflight` | Identity, role, lane, repository, ref, scope, or proof differs from the accepted record. |
| duplicate | recovery-required | none | A lane, worktree, branch, recovery ref, or serialization already exists without real authoritative idempotency proof; preserve known state and stop. |
| denied | blocked | none | Preserve the denial and name the exact owner, Clearance, privacy, credential, or protected-action gate. |
| scope-growth | blocked | `/preflight` | Return new work to Canon issuance, then rerun Preflight; never widen the live lane. |
| recovery-ambiguous | recovery-required | none | Preserve known refs and stop until the authoritative source, target, lane, or recovery state is readable. |

`bootstrap-ready` is a bounded construction handoff, not a successful normal
Launch-flight receipt. It does not make an unavailable `/in-flight` stage real.

## Output

Return a compact record containing:

- outcome and next stage;
- `canonBinding`, actor, role, the verified manual serialization, and writer
  lane;
- source, target, and recovery refs with the re-read commits;
- `repository`, `allowedPaths`, `exclusions`, `preflightFacts`,
  `proofExpectations`, and the pre-opening `entryFacts`;
- all six unavailable fields unchanged as `bootstrap-unavailable`;
- checks performed, invalidation reason when stopped, and the exact next gate;
- the statement: `This is not a Claim, Run, lifecycle receipt, or closure.`

Append it to a tracked Job Order handoff lane only when that Job Order expressly
authorizes the packet write. Otherwise return it to the dispatching Steward as
Intent. Never present a general `/handoff` document as a flight receipt.

## Proof and recovery boundary

The receiving Engineer stays inside the accepted paths and must leave a
remotely recoverable checkpoint at every material stop. Completion requires the
Job Order's focused RED/GREEN scenarios, flat discovery/layout and privacy
checks, direct model-invocation review, exact-ref and recovery checks, and an
independent fixed-SHA PASS. Only then may a separately authorized Land verify
mergeability, use an explicit non-force delivery to the authorized integration
target, and read back the remote result. Missing trailing lifecycle support is
reported `delivered-unclosed`; it is never rounded up to closure.
