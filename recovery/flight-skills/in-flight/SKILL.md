---
name: in-flight
description: Monitor one bounded bootstrap writer lane from a checked Launch-flight handoff, fail closed on authority, scope, freshness, state, or recovery drift, and emit an exact-candidate Intent handoff to Landing-check without claiming lifecycle authority.
---

# In-flight

Monitor one already-open bootstrap lane. Consume exactly one checked
`/launch-flight` handoff; do not reconstruct its authority from a ticket,
taskboard, branch name, chat, or filesystem location. This skill observes and
cross-checks bounded facts. It does not allocate lifecycle identity or perform
the work, review, acceptance, Land, merge, or closure.

## Required input

Require one record with these two top-level bindings:

```yaml
launchHandoff:
  outcome: bootstrap-ready
  next: /in-flight
  canonBinding: <exact checked Job Order, Spec, and ticket>
  actor: <one accepted actor>
  role: engineer
  manualSerialization: <the complete Steward-verified serialization>
  writerLane:
    worktree: <one absolute isolated-worktree path>
    branch: <one codex/ no-track non-protected branch>
  sourceRef:
    ref: refs/heads/integration
    sha: <full checked source commit>
  targetRef:
    ref: refs/heads/integration
    sha: <same full checked source commit>
  recoveryRef:
    ref: <refs/heads/ plus writerLane.branch>
    exists: false
  repository:
    identity: <one exact repository identity>
    recoveryRemote:
      name: <one explicit remote name>
      url: <one explicit HTTPS recovery URL>
  allowedPaths: <exact Canon-authorized paths>
  exclusions: <explicit denied paths and actions>
  preflightFacts: <the complete passed ticket-level record>
  proofExpectations: <required tests, review, recovery, landing, and read-back>
  entryFacts: <the complete checked pre-opening facts>
  exactOrderReceipt: bootstrap-unavailable
  lifecycleTip: bootstrap-unavailable
  claimFuid: bootstrap-unavailable
  runFuid: bootstrap-unavailable
  handoffFuid: bootstrap-unavailable
  handoffDigest: bootstrap-unavailable
  disclaimer: This is not a Claim, Run, lifecycle receipt, or closure.
observation:
  repository: <same structured launchHandoff.repository>
  writerLane: <same structured launchHandoff.writerLane>
  targetLiveRef:
    ref: <same launchHandoff.targetRef.ref>
    sha: <fresh full commit read from that ref>
  recoveryLiveRef:
    ref: <same launchHandoff.recoveryRef.ref>
    sha: <fresh full candidate commit read from that ref>
    exists: true
  laneFacts:
    readable: true
    worktreeExists: true
    worktreeCount: 1
    branchExists: true
    branchCount: 1
    branchUpstream: null
    protected: false
    actor: <same launchHandoff.actor>
    claimantCount: 1
  execution:
    state: running | blocked | candidate-ready
    denied: false
    scopeGrowth: false
    blocking: []
    failures: []
    exclusionViolations: []
    tests: <named observed tests; all pass for candidate-ready>
  candidate: <null while running, or exact candidate facts>
  handoffState:
    accepted: false
    launchHandoffCount: 1
    candidateRefCount: 1
    priorCount: 0
    landingAttempted: false
    mergeAttempted: false
```

For `candidate-ready`, require:

```yaml
candidate:
  ref: <same launchHandoff.recoveryRef.ref>
  sha: <full local candidate commit>
  remoteSha: <same full commit read from the recovery remote>
  baseSha: <same launchHandoff.targetRef.sha>
  baseIsAncestor: true
  changedPaths: <nonempty subset of launchHandoff.allowedPaths>
  dirty: false
```

`allowedPaths` and `changedPaths` are unique, normalized, literal repository-relative file paths,
not globs or directory prefixes. Match them by
exact string equality. Reject absolute paths, empty or dot segments, traversal,
backslashes, wildcard syntax, duplicates, and prefix inference.

Reject blank, placeholder, inferred, truncated, or mixed-check records. The
launch handoff must retain `bootstrap-ready`, `/in-flight`, its full correlated
Canon, actor, role, Steward serialization, repository, lane, refs, scope,
Preflight, proof, entry facts, and all six `bootstrap-unavailable` fields.
Those unavailable fields remain unavailable; never allocate, hash, or
synthesize replacements.

`execution.denied` and `execution.scopeGrowth` are mandatory booleans. Literal
`true` routes to denial or scope growth at its declared priority. Only literal
`false` is valid for running or candidate-ready; a missing or non-boolean value
is mismatched and cannot advance.

## Observe without taking authority

Re-read the repository, target ref, candidate recovery ref, worktree, branch,
upstream, actor, claimant count, diff, dirty state, and named test results.
Facts, not elapsed time, determine freshness. `checkedAt` may be reported only
as diagnostic context.

Cross-correlate every observed value with the checked launch handoff:

1. Repository identity and recovery remote must be exact.
2. Worktree and branch must be the same isolated, non-protected lane; the
   branch must still have no upstream and exactly one actor/claimant.
3. The live target ref and commit must still equal the checked target. The
   recovery ref name must still equal the checked writer branch.
4. Changed paths must be a nonempty subset of `allowedPaths`; no exclusion may
   be crossed and no added work may be silently absorbed.
5. A candidate-ready lane must be clean, descended from the checked target, pushed
   to the exact recovery ref with equal local and remote full commits, and have
   every named proof check passing.
6. Exactly one checked launch handoff, worktree, branch, actor/claimant, and
   candidate recovery ref may exist. No earlier or accepted In-flight handoff,
   denied action, landing attempt, or merge attempt may exist.

Normal implementation and checkpoint pushes remain the accepted Engineer's
work under the Job Order. It must not self-claim, self-accept, self-review, self-land, or self-merge.
It may not rewrite the checked launch
handoff, create lifecycle refs, broaden scope, repair code, force-push, update a
protected target, or treat its own output as independent proof.

An unreadable live fact is recovery ambiguity. `targetLiveRef` requires a
well-formed branch ref and full commit. `recoveryLiveRef` requires those fields
plus literal `exists: true`; missing, malformed, non-boolean, or absent required
live-ref facts are recovery ambiguity. `recoveryLiveRef.exists: false` is recovery ambiguity, not a mismatch.
A complete readable value that disagrees
with the checked binding is a mismatch or stale fact. Preserve that distinction;
never guess through either one.

## Deterministic disposition

Evaluate exactly once in this order and stop at the first matching case:
recovery ambiguity; duplicate ambiguity; denial; scope growth; stale target or
authority; mismatched binding or state; execution blocked; running; then
candidate ready.

<!-- in-flight-decision-order:v1 recovery-ambiguous>duplicate-ambiguous>denied>scope-growth>stale>mismatched>execution-blocked>running>candidate-ready -->
<!-- in-flight-contract:v1 -->
| Case | Outcome | Next | Required response |
|---|---|---|---|
| candidate-ready | bootstrap-review-ready | `/landing-check` | Emit one exact-candidate Intent handoff; require independent review and grant no landing or merge authority. |
| running | bootstrap-in-progress | `/in-flight` | Report only the checked bounded facts and the next observation gate. |
| execution-blocked | blocked | `/in-flight` | Preserve the recoverable checkpoint and name the smallest execution correction or owner gate. |
| mismatched | blocked | `/launch-flight` | The launch authority, identity, lane, repository, state, scope, or proof bindings do not agree. |
| stale | blocked | `/preflight` | A bound target or authority fact moved; rerun the complete ticket-level entry checks. |
| scope-growth | blocked | `/preflight` | Return the added path or action to Canon; never widen the active lane. |
| denied | blocked | none | Preserve the denial and name the exact owner, privacy, credential, or protected-action gate. |
| duplicate-ambiguous | recovery-required | none | Multiple actors, lanes, launch handoffs, candidate refs, or prior handoffs are ambiguous; preserve all known state. |
| recovery-ambiguous | recovery-required | none | A required repository, target, lane, candidate, or recovery fact is unreadable; preserve known refs and stop. |

`bootstrap-in-progress` and `bootstrap-review-ready` are construction
dispositions, not normal lifecycle stages or receipts. A blocked result names
the observed problem and smallest next gate; it never reports success.

## Output

Every result contains the selected case, outcome, next stage, checks performed,
invalidation reason, and exact next gate. A running result contains only the
bounded facts needed for the next observation; do not emit a candidate handoff.
For every outcome, minimize disclosure and redact secrets, credentials, personal data, and private bindings
not expressly required by the authorized
destination. Blocked and recovery results name the failing field. Preserve required refs inside the authorized recovery record,
while disclosing only refs expressly required by that authorized destination;
never echo the complete input record.

For `candidate-ready`, emit one compact Intent handoff containing:

- `stage: bootstrap-in-flight`;
- the exact Canon binding, actor, role, writer lane, repository, allowed paths,
  exclusions, and proof expectations from the checked launch handoff;
- the freshly checked target and exact remotely recovered candidate ref;
- the actual changed paths and named passing tests;
- all six unavailable fields unchanged as `bootstrap-unavailable`;
- `independentReviewRequired: true`, `landingAuthorized: false`, and
  `mergeAuthorized: false`;
- the statement below.

`This is an Intent handoff, not a Claim, Run, lifecycle receipt, acceptance, landing authority, merge authority, or closure.`

Return the handoff to the dispatching Steward or the tracked lane only when the
Job Order expressly authorizes that write. A general `/handoff` document is
session Intent, never a flight receipt.

## Recovery and next-stage boundary

Candidate or target movement invalidates the result. Any amended candidate
must be pushed and re-read, then observed again; any moved target returns to the
complete entry checks. A review-ready handoff only asks a fresh independent
`/landing-check` actor to inspect the exact candidate against the checked
target. Landing-check may reject it. Only a separately authorized Land may use
an explicit non-force delivery, and missing trailing lifecycle support remains
`delivered-unclosed` rather than closure.
